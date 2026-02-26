/**
 * Snowflake Service
 *
 * Main business logic service for the Snowflake mock server.
 * Handles SQL statement execution, status tracking, and result retrieval.
 *
 * Key responsibilities:
 * 1. Execute Statement: Parse SQL, execute via QueryEngine, store in query history
 * 2. Get Statement Status: Retrieve status from query_history
 * 3. Get Statement Result: Retrieve cached results
 * 4. Cancel Statement: Update status to ABORTED
 */

import { v4 as uuidv4 } from 'uuid';
import database from '../config/database';
import { sqlParser, ParsedSelectQuery } from './sqlParser';
import { snowflakeShape, createStatementStatusResponse } from '../shapes/snowflake';
import { ColumnDefinition, QueryMetadata } from '../shapes/base';
import logger from '../utils/logger';

/**
 * Parameters for executing a SQL statement
 */
interface ExecuteStatementParams {
  statement: string;
  timeout?: number;
  database?: string;
  schema?: string;
  warehouse?: string;
  role?: string;
  bindings?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}

/**
 * Cached query result
 */
interface CachedResult {
  data: unknown[];
  columns: ColumnDefinition[];
  rowCount: number;
  executionTimeMs: number;
  createdAt: number;
}

/**
 * Table mapping from Snowflake names to actual PostgreSQL tables
 */
const TABLE_MAPPING: Record<string, string> = {
  CUSTOMERS: 'snowflake_sample_customers',
  SAMPLE_CUSTOMERS: 'snowflake_sample_customers',
  ORDERS: 'snowflake_sample_orders',
  SAMPLE_ORDERS: 'snowflake_sample_orders',
  PRODUCTS: 'snowflake_sample_products',
  SAMPLE_PRODUCTS: 'snowflake_sample_products',
  ORDER_ITEMS: 'snowflake_sample_order_items',
  SAMPLE_ORDER_ITEMS: 'snowflake_sample_order_items',
};

/**
 * Snowflake Service Class
 *
 * Provides mock Snowflake SQL REST API functionality.
 */
class SnowflakeService {
  /**
   * In-memory cache for results (simulates Snowflake's result caching)
   * Key: statementHandle, Value: CachedResult
   */
  private resultCache: Map<string, CachedResult> = new Map();

  /**
   * Cache TTL in milliseconds (default: 24 hours)
   */
  private readonly cacheTtlMs = 24 * 60 * 60 * 1000;

  /**
   * Maximum cache entries before cleanup
   */
  private readonly maxCacheEntries = 1000;

  /**
   * Execute a SQL statement
   *
   * @param params - Statement execution parameters
   * @returns Snowflake-formatted response
   */
  async executeStatement(params: ExecuteStatementParams): Promise<unknown> {
    const statementHandle = uuidv4();
    const startTime = Date.now();

    logger.info(`Executing Snowflake statement: ${statementHandle}`);
    logger.debug(`SQL: ${params.statement}`);

    try {
      // 1. Record the query as RUNNING in snowflake_query_history
      await this.recordQueryStart(statementHandle, params);

      // 2. Parse the SQL statement
      let parsedQuery: ParsedSelectQuery;
      try {
        parsedQuery = sqlParser.parse(params.statement);
      } catch (parseError) {
        const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
        await this.recordQueryFailure(statementHandle, '001003', errorMessage);
        logger.error(`SQL parse error: ${errorMessage}`);
        return snowflakeShape.errorTransform(errorMessage, '001003');
      }

      // 3. Map Snowflake table name to actual PostgreSQL table
      const actualTable = this.mapTableName(parsedQuery.table);
      if (!actualTable) {
        const errorMessage = `Table '${parsedQuery.table}' does not exist or is not accessible.`;
        await this.recordQueryFailure(statementHandle, '002003', errorMessage);
        logger.error(errorMessage);
        return snowflakeShape.errorTransform(errorMessage, '002003');
      }

      // 4. Execute the query against PostgreSQL
      const { data, columns } = await this.executeQuery(parsedQuery, actualTable);

      // 5. Calculate execution time
      const executionTimeMs = Date.now() - startTime;

      // 6. Update query_history with success status
      await this.recordQuerySuccess(statementHandle, data.length, executionTimeMs);

      // 7. Cache the result
      this.cacheResult(statementHandle, {
        data,
        columns,
        rowCount: data.length,
        executionTimeMs,
        createdAt: Date.now(),
      });

      // 8. Return Snowflake-formatted response
      const metadata: QueryMetadata = {
        rowCount: data.length,
        columns,
        executionTimeMs,
        statementHandle,
        sqlState: '00000',
      };

      logger.info(`Statement ${statementHandle} completed: ${data.length} rows in ${executionTimeMs}ms`);
      return snowflakeShape.responseTransform(data, metadata);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown execution error';
      await this.recordQueryFailure(statementHandle, '000900', errorMessage);
      logger.error(`Statement execution failed: ${errorMessage}`);
      return snowflakeShape.errorTransform(errorMessage, '000900');
    }
  }

  /**
   * Get the status of a statement execution
   *
   * @param statementHandle - The statement handle to check
   * @returns Statement status response
   */
  async getStatementStatus(statementHandle: string): Promise<unknown> {
    logger.debug(`Getting status for statement: ${statementHandle}`);

    try {
      const result = await database.query(
        `SELECT status, error_code, error_message, rows_produced, execution_time_ms
         FROM snowflake_query_history
         WHERE statement_handle = $1`,
        [statementHandle]
      );

      if (result.rows.length === 0) {
        logger.warn(`Statement not found: ${statementHandle}`);
        return snowflakeShape.errorTransform(
          `Statement not found: ${statementHandle}`,
          '000900'
        );
      }

      const row = result.rows[0];
      const statusMap: Record<string, 'running' | 'success' | 'failed' | 'cancelled'> = {
        RUNNING: 'running',
        SUCCESS: 'success',
        FAILED: 'failed',
        CANCELLED: 'cancelled',
        BLOCKED: 'running',
      };

      const mappedStatus = statusMap[row.status] || 'running';

      if (row.status === 'FAILED' && row.error_message) {
        return {
          ...createStatementStatusResponse(statementHandle, mappedStatus),
          message: row.error_message,
          code: row.error_code || '000900',
        };
      }

      return createStatementStatusResponse(statementHandle, mappedStatus);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error getting statement status: ${errorMessage}`);
      return snowflakeShape.errorTransform(errorMessage, '000900');
    }
  }

  /**
   * Get the result of a completed statement
   *
   * @param statementHandle - The statement handle to retrieve results for
   * @param partition - Optional partition number (for large results)
   * @returns Statement result response
   */
  async getStatementResult(statementHandle: string, partition?: number): Promise<unknown> {
    logger.debug(`Getting result for statement: ${statementHandle}, partition: ${partition}`);

    // Check cache first
    const cached = this.resultCache.get(statementHandle);
    if (cached) {
      logger.debug(`Cache hit for statement: ${statementHandle}`);

      const metadata: QueryMetadata = {
        rowCount: cached.rowCount,
        columns: cached.columns,
        executionTimeMs: cached.executionTimeMs,
        statementHandle,
        sqlState: '00000',
      };

      return snowflakeShape.responseTransform(cached.data, metadata);
    }

    // Check if statement exists and is complete
    const statusResult = await database.query(
      `SELECT status, rows_produced
       FROM snowflake_query_history
       WHERE statement_handle = $1`,
      [statementHandle]
    );

    if (statusResult.rows.length === 0) {
      logger.warn(`Statement not found: ${statementHandle}`);
      return snowflakeShape.errorTransform(
        `Statement not found: ${statementHandle}`,
        '000900'
      );
    }

    const row = statusResult.rows[0];
    if (row.status === 'RUNNING') {
      return snowflakeShape.errorTransform(
        'Statement is still running. Please check status before fetching results.',
        '333334'
      );
    }

    if (row.status === 'FAILED' || row.status === 'CANCELLED') {
      return snowflakeShape.errorTransform(
        `Statement ${row.status.toLowerCase()}. No results available.`,
        '000900'
      );
    }

    // Result not in cache but statement succeeded - return empty result
    // This simulates result expiration
    logger.warn(`Result not in cache for completed statement: ${statementHandle}`);
    return snowflakeShape.errorTransform(
      'Result set has expired. Please re-execute the query.',
      '000900'
    );
  }

  /**
   * Cancel a running statement
   *
   * @param statementHandle - The statement handle to cancel
   * @returns Cancel response
   */
  async cancelStatement(statementHandle: string): Promise<unknown> {
    logger.info(`Cancelling statement: ${statementHandle}`);

    try {
      const result = await database.query(
        `UPDATE snowflake_query_history
         SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP
         WHERE statement_handle = $1 AND status = 'RUNNING'
         RETURNING id`,
        [statementHandle]
      );

      if (result.rows.length === 0) {
        // Check if statement exists
        const checkResult = await database.query(
          `SELECT status FROM snowflake_query_history WHERE statement_handle = $1`,
          [statementHandle]
        );

        if (checkResult.rows.length === 0) {
          return snowflakeShape.errorTransform(
            `Statement not found: ${statementHandle}`,
            '000900'
          );
        }

        const status = checkResult.rows[0].status;
        return snowflakeShape.errorTransform(
          `Statement cannot be cancelled. Current status: ${status}`,
          '000900'
        );
      }

      // Remove from cache
      this.resultCache.delete(statementHandle);

      logger.info(`Statement cancelled: ${statementHandle}`);
      return createStatementStatusResponse(statementHandle, 'cancelled');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error cancelling statement: ${errorMessage}`);
      return snowflakeShape.errorTransform(errorMessage, '000900');
    }
  }

  /**
   * Generate a mock OAuth token
   *
   * @returns Mock token response
   */
  generateMockToken(): { access_token: string; token_type: string; expires_in: number } {
    return {
      access_token: `mock-snowflake-${uuidv4()}`,
      token_type: 'Bearer',
      expires_in: 3600,
    };
  }

  /**
   * Map Snowflake table name to actual PostgreSQL table
   */
  private mapTableName(snowflakeTable: string): string | null {
    const upperTable = snowflakeTable.toUpperCase();
    return TABLE_MAPPING[upperTable] || null;
  }

  /**
   * Execute a parsed query against PostgreSQL
   */
  private async executeQuery(
    parsedQuery: ParsedSelectQuery,
    actualTable: string
  ): Promise<{ data: Record<string, unknown>[]; columns: ColumnDefinition[] }> {
    // Build the SQL query
    let sql = 'SELECT ';

    // Handle DISTINCT
    if (parsedQuery.distinct) {
      sql += 'DISTINCT ';
    }

    // Handle columns
    if (parsedQuery.columns === '*' || !Array.isArray(parsedQuery.columns)) {
      sql += '*';
    } else {
      // Ensure column names are properly formatted for PostgreSQL
      const columnList = parsedQuery.columns.map((col) => {
        // If column name contains special characters, quote it
        if (/[^a-zA-Z0-9_]/.test(col)) {
          return `"${col}"`;
        }
        return col.toLowerCase(); // PostgreSQL uses lowercase column names
      });
      sql += columnList.join(', ');
    }

    sql += ` FROM ${actualTable}`;

    // Build WHERE clause
    const { whereClause, params } = this.buildWhereClause(parsedQuery.where);
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }

    // Handle GROUP BY
    if (parsedQuery.groupBy && parsedQuery.groupBy.length > 0) {
      sql += ` GROUP BY ${parsedQuery.groupBy.join(', ')}`;
    }

    // Handle ORDER BY
    if (parsedQuery.orderBy && parsedQuery.orderBy.length > 0) {
      const orderClauses = parsedQuery.orderBy.map(
        (ob) => `${ob.column} ${ob.direction}`
      );
      sql += ` ORDER BY ${orderClauses.join(', ')}`;
    }

    // Handle LIMIT
    if (parsedQuery.limit !== undefined) {
      sql += ` LIMIT ${parsedQuery.limit}`;
    }

    // Handle OFFSET
    if (parsedQuery.offset !== undefined) {
      sql += ` OFFSET ${parsedQuery.offset}`;
    }

    logger.debug(`Executing PostgreSQL query: ${sql}`);
    logger.debug(`Parameters: ${JSON.stringify(params)}`);

    const result = await database.query(sql, params);

    // Infer column definitions from first row or query metadata
    const columns = this.inferColumnDefinitions(result.rows[0], result.fields);

    return {
      data: result.rows,
      columns,
    };
  }

  /**
   * Build WHERE clause from parsed conditions
   */
  private buildWhereClause(
    where?: ParsedSelectQuery['where'],
    paramIndex = 1
  ): { whereClause: string; params: unknown[]; nextIndex: number } {
    if (!where) {
      return { whereClause: '', params: [], nextIndex: paramIndex };
    }

    const params: unknown[] = [];

    const processCondition = (
      condition: ParsedSelectQuery['where'],
      currentIndex: number
    ): { clause: string; newIndex: number } => {
      if (!condition) {
        return { clause: '', newIndex: currentIndex };
      }

      // Check if it's a group (AND/OR)
      if ('type' in condition && (condition.type === 'AND' || condition.type === 'OR')) {
        const group = condition as { type: 'AND' | 'OR'; conditions: Array<unknown> };
        const clauses: string[] = [];
        let idx = currentIndex;

        for (const subCondition of group.conditions) {
          const result = processCondition(subCondition as ParsedSelectQuery['where'], idx);
          if (result.clause) {
            clauses.push(result.clause);
            idx = result.newIndex;
          }
        }

        return {
          clause: clauses.length > 0 ? `(${clauses.join(` ${group.type} `)})` : '',
          newIndex: idx,
        };
      }

      // It's a single condition
      const cond = condition as {
        column: string;
        operator: string;
        value: unknown;
        values?: unknown[];
      };

      // Ensure column name is a string and lowercase for PostgreSQL
      const columnName = typeof cond.column === 'string'
        ? cond.column.toLowerCase()
        : String(cond.column).toLowerCase();

      let clause: string;
      let newIndex = currentIndex;

      switch (cond.operator) {
        case 'IS':
          clause = `${columnName} IS NULL`;
          break;
        case 'IS NOT':
          clause = `${columnName} IS NOT NULL`;
          break;
        case 'IN':
        case 'NOT IN':
          if (cond.values && cond.values.length > 0) {
            const placeholders = cond.values.map((_, i) => `$${newIndex + i}`);
            clause = `${columnName} ${cond.operator} (${placeholders.join(', ')})`;
            params.push(...cond.values);
            newIndex += cond.values.length;
          } else {
            clause = cond.operator === 'IN' ? 'FALSE' : 'TRUE';
          }
          break;
        case 'LIKE':
          clause = `${columnName} ILIKE $${newIndex}`;
          params.push(cond.value);
          newIndex++;
          break;
        default:
          clause = `${columnName} ${cond.operator} $${newIndex}`;
          params.push(cond.value);
          newIndex++;
      }

      return { clause, newIndex };
    };

    const result = processCondition(where, paramIndex);
    return {
      whereClause: result.clause,
      params,
      nextIndex: result.newIndex,
    };
  }

  /**
   * Infer column definitions from query result
   */
  private inferColumnDefinitions(
    sampleRow: Record<string, unknown> | undefined,
    fields: Array<{ name: string; dataTypeID: number }> | undefined
  ): ColumnDefinition[] {
    if (!fields || fields.length === 0) {
      if (!sampleRow) {
        return [];
      }
      // Infer from sample row
      return Object.entries(sampleRow).map(([key, value]) => ({
        name: key.toUpperCase(),
        type: this.inferTypeFromValue(value),
        nullable: true,
      }));
    }

    // Use PostgreSQL field metadata
    return fields.map((field) => ({
      name: field.name.toUpperCase(),
      type: this.mapPostgresTypeToSnowflake(field.dataTypeID),
      nullable: true,
    }));
  }

  /**
   * Infer type from JavaScript value
   */
  private inferTypeFromValue(value: unknown): string {
    if (value === null || value === undefined) return 'TEXT';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'FIXED' : 'REAL';
    }
    if (typeof value === 'boolean') return 'BOOLEAN';
    if (value instanceof Date) return 'TIMESTAMP_NTZ';
    if (Array.isArray(value)) return 'ARRAY';
    if (typeof value === 'object') return 'OBJECT';
    return 'TEXT';
  }

  /**
   * Map PostgreSQL type OID to Snowflake type
   */
  private mapPostgresTypeToSnowflake(typeId: number): string {
    // Common PostgreSQL type OIDs
    const typeMap: Record<number, string> = {
      16: 'BOOLEAN', // bool
      20: 'FIXED', // int8
      21: 'FIXED', // int2
      23: 'FIXED', // int4
      25: 'TEXT', // text
      700: 'REAL', // float4
      701: 'REAL', // float8
      1043: 'TEXT', // varchar
      1082: 'DATE', // date
      1114: 'TIMESTAMP_NTZ', // timestamp
      1184: 'TIMESTAMP_TZ', // timestamptz
      1700: 'FIXED', // numeric
      2950: 'TEXT', // uuid
      3802: 'VARIANT', // jsonb
      114: 'VARIANT', // json
    };
    return typeMap[typeId] || 'TEXT';
  }

  /**
   * Record query start in history
   */
  private async recordQueryStart(
    statementHandle: string,
    params: ExecuteStatementParams
  ): Promise<void> {
    await database.query(
      `INSERT INTO snowflake_query_history (
        statement_handle, database_name, schema_name, sql_text, query_type, status
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        statementHandle,
        params.database || 'MOCK_DB',
        params.schema || 'PUBLIC',
        params.statement,
        'SELECT',
        'RUNNING',
      ]
    );
  }

  /**
   * Record query success in history
   */
  private async recordQuerySuccess(
    statementHandle: string,
    rowCount: number,
    executionTimeMs: number
  ): Promise<void> {
    await database.query(
      `UPDATE snowflake_query_history
       SET status = 'SUCCESS',
           rows_produced = $2,
           execution_time_ms = $3,
           completed_at = CURRENT_TIMESTAMP
       WHERE statement_handle = $1`,
      [statementHandle, rowCount, executionTimeMs]
    );
  }

  /**
   * Record query failure in history
   */
  private async recordQueryFailure(
    statementHandle: string,
    errorCode: string,
    errorMessage: string
  ): Promise<void> {
    await database.query(
      `UPDATE snowflake_query_history
       SET status = 'FAILED',
           error_code = $2,
           error_message = $3,
           completed_at = CURRENT_TIMESTAMP
       WHERE statement_handle = $1`,
      [statementHandle, errorCode, errorMessage]
    );
  }

  /**
   * Cache a query result
   */
  private cacheResult(statementHandle: string, result: CachedResult): void {
    // Cleanup old entries if cache is full
    if (this.resultCache.size >= this.maxCacheEntries) {
      this.cleanupCache();
    }

    this.resultCache.set(statementHandle, result);
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];

    for (const [handle, result] of this.resultCache.entries()) {
      if (now - result.createdAt > this.cacheTtlMs) {
        entriesToDelete.push(handle);
      }
    }

    // If still over limit, remove oldest entries
    if (this.resultCache.size - entriesToDelete.length >= this.maxCacheEntries) {
      const entries = Array.from(this.resultCache.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt);

      const removeCount = Math.ceil(this.maxCacheEntries * 0.2); // Remove 20%
      for (let i = 0; i < removeCount && i < entries.length; i++) {
        entriesToDelete.push(entries[i][0]);
      }
    }

    for (const handle of entriesToDelete) {
      this.resultCache.delete(handle);
    }

    logger.debug(`Cache cleanup: removed ${entriesToDelete.length} entries`);
  }

  /**
   * Clear all cached results (for testing)
   */
  clearCache(): void {
    this.resultCache.clear();
  }

  /**
   * Get cache statistics (for monitoring)
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.resultCache.size,
      maxSize: this.maxCacheEntries,
    };
  }
}

// Export singleton instance
export const snowflakeService = new SnowflakeService();
export default snowflakeService;
