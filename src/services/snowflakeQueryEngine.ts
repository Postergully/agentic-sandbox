/**
 * Snowflake Query Engine Service
 *
 * Executes parsed SQL queries against Snowflake-specific PostgreSQL tables.
 * Maps virtual Snowflake table/column names to actual PostgreSQL equivalents.
 */

import database from '../config/database';
import {
  ParsedSelectQuery,
  WhereCondition,
  WhereGroup,
  OrderByClause,
  AggregateFunction,
} from './sqlParser';
import logger from '../utils/logger';

/**
 * Column metadata information
 */
export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

/**
 * Query execution result
 */
export interface QueryResult {
  rows: Record<string, unknown>[];
  columns: ColumnInfo[];
  rowCount: number;
}

/**
 * Query execution error
 */
export class QueryExecutionError extends Error {
  constructor(
    message: string,
    public readonly query?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'QueryExecutionError';
  }
}

/**
 * Snowflake Query Engine
 *
 * Translates and executes parsed SQL queries against PostgreSQL tables
 * that simulate Snowflake data structures.
 */
class SnowflakeQueryEngine {
  /**
   * Maps virtual Snowflake table names to actual PostgreSQL table names
   */
  private readonly tableMapping: Record<string, string> = {
    CUSTOMERS: 'snowflake_sample_customers',
    ORDERS: 'snowflake_sample_orders',
    PRODUCTS: 'snowflake_sample_products',
    ORDER_ITEMS: 'snowflake_sample_order_items',
  };

  /**
   * Maps common Snowflake column naming conventions to PostgreSQL snake_case
   */
  private readonly columnMapping: Record<string, string> = {
    // Customers table
    CUSTOMER_ID: 'customer_id',
    FIRST_NAME: 'first_name',
    LAST_NAME: 'last_name',
    EMAIL: 'email',
    PHONE: 'phone',
    ADDRESS: 'address',
    CITY: 'city',
    STATE: 'state',
    ZIP_CODE: 'zip_code',
    COUNTRY: 'country',
    CREATED_AT: 'created_at',
    UPDATED_AT: 'updated_at',

    // Orders table
    ORDER_ID: 'order_id',
    ORDER_DATE: 'order_date',
    STATUS: 'status',
    TOTAL_AMOUNT: 'total_amount',
    SHIPPING_ADDRESS: 'shipping_address',
    BILLING_ADDRESS: 'billing_address',

    // Products table
    PRODUCT_ID: 'product_id',
    PRODUCT_NAME: 'product_name',
    DESCRIPTION: 'description',
    CATEGORY: 'category',
    PRICE: 'price',
    STOCK_QUANTITY: 'stock_quantity',
    SKU: 'sku',

    // Order items table
    ORDER_ITEM_ID: 'order_item_id',
    QUANTITY: 'quantity',
    UNIT_PRICE: 'unit_price',
    DISCOUNT: 'discount',
    LINE_TOTAL: 'line_total',
  };

  /**
   * PostgreSQL type mapping for result metadata
   */
  private readonly pgTypeMapping: Record<number, string> = {
    16: 'boolean',
    20: 'bigint',
    21: 'smallint',
    23: 'integer',
    25: 'text',
    700: 'real',
    701: 'double precision',
    1043: 'varchar',
    1082: 'date',
    1114: 'timestamp',
    1184: 'timestamptz',
    1700: 'numeric',
  };

  /**
   * Execute a parsed SELECT query against the Snowflake mock tables
   *
   * @param parsedQuery - The parsed SQL query from sqlParser
   * @returns Query results with rows, column metadata, and row count
   * @throws QueryExecutionError if execution fails
   */
  async execute(parsedQuery: ParsedSelectQuery): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      // Validate and resolve table name
      const tableName = this.resolveTableName(parsedQuery.table);

      // Build query components
      const params: unknown[] = [];
      const selectClause = this.buildSelectClause(parsedQuery.columns, parsedQuery.aggregates);
      const fromClause = `FROM ${tableName}`;
      const whereClause = parsedQuery.where
        ? this.buildWhereClause(parsedQuery.where, params)
        : '';
      const groupByClause = parsedQuery.groupBy
        ? this.buildGroupByClause(parsedQuery.groupBy)
        : '';
      const orderByClause = parsedQuery.orderBy
        ? this.buildOrderByClause(parsedQuery.orderBy)
        : '';
      const limitClause = this.buildLimitClause(parsedQuery.limit, parsedQuery.offset);

      // Assemble full query
      const distinctKeyword = parsedQuery.distinct ? 'DISTINCT ' : '';
      const queryParts = [
        `SELECT ${distinctKeyword}${selectClause}`,
        fromClause,
        whereClause,
        groupByClause,
        orderByClause,
        limitClause,
      ].filter(Boolean);

      const sqlQuery = queryParts.join(' ');

      logger.debug(`Executing Snowflake query: ${sqlQuery}`);
      logger.debug(`Query parameters: ${JSON.stringify(params)}`);

      // Execute query
      const result = await database.query(sqlQuery, params);

      const duration = Date.now() - startTime;
      logger.info(`Snowflake query executed in ${duration}ms, returned ${result.rowCount} rows`);

      // Build column metadata
      const columns = this.extractColumnMetadata(result.fields);

      // Transform row keys back to uppercase (Snowflake convention)
      const rows = result.rows.map((row) => this.transformRowKeys(row));

      return {
        rows,
        columns,
        rowCount: result.rowCount ?? 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Snowflake query execution failed: ${errorMessage}`);

      throw new QueryExecutionError(
        `Query execution failed: ${errorMessage}`,
        parsedQuery.table,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Resolve virtual Snowflake table name to actual PostgreSQL table
   *
   * @param tableName - Virtual table name (case-insensitive)
   * @returns Actual PostgreSQL table name
   * @throws QueryExecutionError if table not found
   */
  private resolveTableName(tableName: string): string {
    const upperName = tableName.toUpperCase();
    const resolved = this.tableMapping[upperName];

    if (!resolved) {
      const availableTables = Object.keys(this.tableMapping).join(', ');
      throw new QueryExecutionError(
        `Unknown table: ${tableName}. Available tables: ${availableTables}`
      );
    }

    return resolved;
  }

  /**
   * Build the SELECT clause with column names and aggregates
   *
   * @param columns - Array of column names or '*'
   * @param aggregates - Optional aggregate functions
   * @returns SELECT clause string
   */
  private buildSelectClause(
    columns: string[] | '*',
    aggregates?: AggregateFunction[]
  ): string {
    const parts: string[] = [];

    // Handle regular columns
    if (columns === '*') {
      parts.push('*');
    } else {
      for (const col of columns) {
        const mappedCol = this.mapColumnName(col);
        // Include alias if column was renamed
        if (mappedCol !== col.toLowerCase()) {
          parts.push(`${mappedCol} AS "${col}"`);
        } else {
          parts.push(mappedCol);
        }
      }
    }

    // Handle aggregate functions
    if (aggregates && aggregates.length > 0) {
      // If we only have aggregates (no regular columns), clear parts
      if (columns !== '*' && (columns as string[]).length === 0) {
        parts.length = 0;
      }

      for (const agg of aggregates) {
        const aggColumn = agg.column === '*' ? '*' : this.mapColumnName(agg.column);
        const aggExpr = `${agg.function}(${aggColumn})`;
        const alias = agg.alias || `${agg.function.toLowerCase()}_${agg.column}`;
        parts.push(`${aggExpr} AS "${alias}"`);
      }
    }

    return parts.length > 0 ? parts.join(', ') : '*';
  }

  /**
   * Build WHERE clause with parameterized values
   *
   * @param where - WHERE condition or group
   * @param params - Parameter array to populate
   * @param paramIndex - Starting parameter index
   * @returns WHERE clause string
   */
  private buildWhereClause(
    where: WhereCondition | WhereGroup,
    params: unknown[],
    paramIndex: number = 1
  ): string {
    const clause = this.buildWhereExpression(where, params, { index: paramIndex });
    return `WHERE ${clause}`;
  }

  /**
   * Recursively build WHERE expression
   *
   * @param where - WHERE condition or group
   * @param params - Parameter array to populate
   * @param counter - Parameter index counter object
   * @returns Expression string
   */
  private buildWhereExpression(
    where: WhereCondition | WhereGroup,
    params: unknown[],
    counter: { index: number }
  ): string {
    // Handle AND/OR groups
    if ('type' in where && (where.type === 'AND' || where.type === 'OR')) {
      const group = where as WhereGroup;
      const expressions = group.conditions.map((cond) =>
        this.buildWhereExpression(cond, params, counter)
      );
      return `(${expressions.join(` ${group.type} `)})`;
    }

    // Handle single condition
    const condition = where as WhereCondition;
    const column = this.mapColumnName(condition.column);

    switch (condition.operator) {
      case 'IS':
      case 'IS NOT':
        return `${column} ${condition.operator} NULL`;

      case 'IN':
      case 'NOT IN': {
        const values = condition.values || [condition.value];
        const inPlaceholders = values.map((v) => {
          params.push(v);
          return `$${counter.index++}`;
        });
        return `${column} ${condition.operator} (${inPlaceholders.join(', ')})`;
      }

      case 'LIKE':
        params.push(condition.value);
        return `${column} ILIKE $${counter.index++}`;

      default:
        params.push(condition.value);
        return `${column} ${condition.operator} $${counter.index++}`;
    }
  }

  /**
   * Build GROUP BY clause
   *
   * @param groupBy - Array of column names
   * @returns GROUP BY clause string
   */
  private buildGroupByClause(groupBy: string[]): string {
    const mappedColumns = groupBy.map((col) => this.mapColumnName(col));
    return `GROUP BY ${mappedColumns.join(', ')}`;
  }

  /**
   * Build ORDER BY clause
   *
   * @param orderBy - Array of order by clauses
   * @returns ORDER BY clause string
   */
  private buildOrderByClause(orderBy: OrderByClause[]): string {
    const clauses = orderBy.map((ob) => {
      const column = this.mapColumnName(ob.column);
      return `${column} ${ob.direction}`;
    });
    return `ORDER BY ${clauses.join(', ')}`;
  }

  /**
   * Build LIMIT and OFFSET clause
   *
   * @param limit - Optional limit value
   * @param offset - Optional offset value
   * @returns LIMIT/OFFSET clause string
   */
  private buildLimitClause(limit?: number, offset?: number): string {
    const parts: string[] = [];

    if (limit !== undefined && limit > 0) {
      parts.push(`LIMIT ${Math.floor(limit)}`);
    }

    if (offset !== undefined && offset > 0) {
      parts.push(`OFFSET ${Math.floor(offset)}`);
    }

    return parts.join(' ');
  }

  /**
   * Map Snowflake column name to PostgreSQL column name
   *
   * @param column - Column name (case-insensitive)
   * @returns Mapped PostgreSQL column name
   */
  private mapColumnName(column: string): string {
    const upperName = column.toUpperCase();

    // Check explicit mapping first
    if (this.columnMapping[upperName]) {
      return this.columnMapping[upperName];
    }

    // Default: convert to lowercase (PostgreSQL convention)
    return column.toLowerCase();
  }

  /**
   * Extract column metadata from PostgreSQL field descriptors
   *
   * @param fields - PostgreSQL field array
   * @returns Array of column info
   */
  private extractColumnMetadata(fields: Array<{ name: string; dataTypeID: number }>): ColumnInfo[] {
    return fields.map((field) => ({
      name: field.name.toUpperCase(), // Return as uppercase (Snowflake convention)
      type: this.pgTypeMapping[field.dataTypeID] || 'unknown',
      nullable: true, // PostgreSQL doesn't expose this in field metadata
    }));
  }

  /**
   * Transform row keys to uppercase (Snowflake convention)
   *
   * @param row - Database row with lowercase keys
   * @returns Row with uppercase keys
   */
  private transformRowKeys(row: Record<string, unknown>): Record<string, unknown> {
    const transformed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      transformed[key.toUpperCase()] = value;
    }

    return transformed;
  }

  /**
   * Get list of available tables
   *
   * @returns Array of available virtual table names
   */
  getAvailableTables(): string[] {
    return Object.keys(this.tableMapping);
  }

  /**
   * Check if a table exists in the mapping
   *
   * @param tableName - Table name to check
   * @returns True if table exists
   */
  tableExists(tableName: string): boolean {
    return this.tableMapping[tableName.toUpperCase()] !== undefined;
  }

  /**
   * Get the PostgreSQL table name for a virtual table
   *
   * @param tableName - Virtual table name
   * @returns PostgreSQL table name or undefined
   */
  getPhysicalTableName(tableName: string): string | undefined {
    return this.tableMapping[tableName.toUpperCase()];
  }
}

// Export singleton instance
export const snowflakeQueryEngine = new SnowflakeQueryEngine();
export default snowflakeQueryEngine;
