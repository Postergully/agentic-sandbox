/**
 * Snowflake SQL REST API Shape
 *
 * Transforms responses to match Snowflake's SQL REST API format.
 * Reference: https://docs.snowflake.com/en/developer-guide/sql-api/reference
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ApiShape,
  ShapeAuthConfig,
  EndpointConfig,
  QueryMetadata,
  TokenGenerationParams,
  ColumnDefinition,
} from './base';

/**
 * Snowflake result set metadata format
 */
interface SnowflakeResultSetMetaData {
  numRows: number;
  format: 'jsonv2';
  partitionInfo: PartitionInfo[];
  rowType: SnowflakeRowType[];
}

interface PartitionInfo {
  rowCount: number;
  uncompressedSize: number;
}

interface SnowflakeRowType {
  name: string;
  database: string;
  schema: string;
  table: string;
  type: string;
  byteLength?: number;
  nullable: boolean;
  precision?: number;
  scale?: number;
  collation?: string;
}

/**
 * Snowflake statement response format
 */
interface SnowflakeStatementResponse {
  resultSetMetaData: SnowflakeResultSetMetaData;
  data: string[][];
  code: string;
  statementStatusUrl: string;
  requestId: string;
  sqlState: string;
  statementHandle: string;
  message: string;
  createdOn: number;
}

/**
 * Snowflake error response format
 */
interface SnowflakeErrorResponse {
  code: string;
  message: string;
  sqlState: string;
  statementHandle?: string;
}

/**
 * Snowflake token response format
 */
interface SnowflakeTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Map internal types to Snowflake types
 */
function mapToSnowflakeType(internalType: string): string {
  const typeMap: Record<string, string> = {
    string: 'TEXT',
    text: 'TEXT',
    varchar: 'TEXT',
    number: 'FIXED',
    integer: 'FIXED',
    int: 'FIXED',
    float: 'REAL',
    double: 'REAL',
    decimal: 'FIXED',
    boolean: 'BOOLEAN',
    date: 'DATE',
    datetime: 'TIMESTAMP_NTZ',
    timestamp: 'TIMESTAMP_NTZ',
    json: 'VARIANT',
    object: 'OBJECT',
    array: 'ARRAY',
  };
  return typeMap[internalType.toLowerCase()] || 'TEXT';
}

/**
 * Convert a value to Snowflake string representation
 * Snowflake SQL API returns all values as strings in the data array
 */
function toSnowflakeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Snowflake API Shape Implementation
 */
export class SnowflakeShape implements ApiShape {
  name = 'snowflake';
  displayName = 'Snowflake SQL REST API';
  baseUrl = '/api/v2';

  endpoints: Record<string, EndpointConfig> = {
    executeStatement: {
      method: 'POST',
      path: '/statements',
      description: 'Execute a SQL statement',
      bodySchema: {
        type: 'object',
        required: ['statement'],
        properties: {
          statement: { type: 'string', description: 'SQL statement to execute' },
          timeout: { type: 'number', description: 'Query timeout in seconds' },
          database: { type: 'string', description: 'Database context' },
          schema: { type: 'string', description: 'Schema context' },
          warehouse: { type: 'string', description: 'Warehouse to use' },
          role: { type: 'string', description: 'Role to use' },
          bindings: { type: 'object', description: 'Parameter bindings' },
          parameters: { type: 'object', description: 'Session parameters' },
        },
      },
    },
    getStatementStatus: {
      method: 'GET',
      path: '/statements/:statementHandle',
      description: 'Get the status of a statement execution',
    },
    getStatementResult: {
      method: 'GET',
      path: '/statements/:statementHandle/result',
      description: 'Get the result of a completed statement',
      queryParams: ['partition'],
    },
    cancelStatement: {
      method: 'POST',
      path: '/statements/:statementHandle/cancel',
      description: 'Cancel a running statement',
    },
  };

  auth: ShapeAuthConfig = {
    type: 'oauth2',
    endpoints: {
      token: '/oauth/token-request',
    },
    acceptAnyCredentials: true, // Mock server accepts any credentials
    tokenExpiresIn: 3600,
  };

  /**
   * Transform query results to Snowflake response format
   */
  responseTransform(data: unknown[], metadata?: QueryMetadata): SnowflakeStatementResponse {
    const statementHandle = metadata?.statementHandle || uuidv4();
    const rowCount = data.length;
    const columns = metadata?.columns || this.inferColumns(data);

    // Convert data rows to string arrays (Snowflake format)
    const transformedData = data.map((row) => {
      if (Array.isArray(row)) {
        return row.map(toSnowflakeValue);
      }
      // If row is an object, convert to array based on column order
      // Handle case-insensitivity: PostgreSQL returns lowercase keys, columns may be uppercase
      const rowObj = row as Record<string, unknown>;
      return columns.map((col) => {
        // Try the column name as-is, then lowercase, then uppercase
        const value = rowObj[col.name] ?? rowObj[col.name.toLowerCase()] ?? rowObj[col.name.toUpperCase()];
        return toSnowflakeValue(value);
      });
    });

    // Build row type metadata
    const rowType: SnowflakeRowType[] = columns.map((col) => ({
      name: col.name.toUpperCase(),
      database: 'MOCK_DB',
      schema: 'PUBLIC',
      table: '',
      type: mapToSnowflakeType(col.type),
      nullable: col.nullable ?? true,
      byteLength: col.byteLength,
      precision: col.precision,
      scale: col.scale,
    }));

    return {
      resultSetMetaData: {
        numRows: rowCount,
        format: 'jsonv2',
        partitionInfo: [
          {
            rowCount,
            uncompressedSize: JSON.stringify(transformedData).length,
          },
        ],
        rowType,
      },
      data: transformedData,
      code: '090001',
      statementStatusUrl: `/api/v2/statements/${statementHandle}`,
      requestId: uuidv4(),
      sqlState: metadata?.sqlState || '00000',
      statementHandle,
      message: 'Statement executed successfully.',
      createdOn: Date.now(),
    };
  }

  /**
   * Transform errors to Snowflake error format
   */
  errorTransform(error: Error | string, code?: string): SnowflakeErrorResponse {
    const message = typeof error === 'string' ? error : error.message;

    // Map common errors to Snowflake error codes
    let errorCode = code || '000900';
    let sqlState = '42000';

    if (message.toLowerCase().includes('syntax')) {
      errorCode = '001003';
      sqlState = '42601';
    } else if (message.toLowerCase().includes('not found') || message.toLowerCase().includes('does not exist')) {
      errorCode = '002003';
      sqlState = '42S02';
    } else if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('unauthorized')) {
      errorCode = '003001';
      sqlState = '42501';
    } else if (message.toLowerCase().includes('timeout')) {
      errorCode = '000604';
      sqlState = '57014';
    }

    return {
      code: errorCode,
      message,
      sqlState,
    };
  }

  /**
   * Generate token response in Snowflake format
   */
  generateTokenResponse(tokenData: TokenGenerationParams): SnowflakeTokenResponse {
    return {
      access_token: tokenData.accessToken,
      token_type: tokenData.tokenType || 'Bearer',
      expires_in: tokenData.expiresIn,
      refresh_token: tokenData.refreshToken,
      scope: tokenData.scope,
    };
  }

  /**
   * Infer column definitions from data when not provided
   */
  private inferColumns(data: unknown[]): ColumnDefinition[] {
    if (data.length === 0) return [];

    const firstRow = data[0];
    if (Array.isArray(firstRow)) {
      // Array data - generate generic column names
      return firstRow.map((_, i) => ({
        name: `COLUMN_${i + 1}`,
        type: 'TEXT',
        nullable: true,
      }));
    }

    // Object data - use keys as column names
    const rowObj = firstRow as Record<string, unknown>;
    return Object.entries(rowObj).map(([key, value]) => ({
      name: key,
      type: this.inferType(value),
      nullable: true,
    }));
  }

  /**
   * Infer type from a JavaScript value
   */
  private inferType(value: unknown): string {
    if (value === null || value === undefined) return 'TEXT';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'float';
    }
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'timestamp';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'string';
  }
}

/**
 * Create statement status response
 */
export function createStatementStatusResponse(
  statementHandle: string,
  status: 'running' | 'success' | 'failed' | 'cancelled',
  progress?: number
): Record<string, unknown> {
  const statusMap: Record<string, string> = {
    running: 'RUNNING',
    success: 'SUCCESS',
    failed: 'FAILED_WITH_ERROR',
    cancelled: 'ABORTED',
  };

  return {
    statementHandle,
    statementStatusUrl: `/api/v2/statements/${statementHandle}`,
    sqlState: status === 'success' ? '00000' : status === 'failed' ? '42000' : '00000',
    code: status === 'success' ? '090001' : status === 'failed' ? '000900' : '333334',
    message:
      status === 'success'
        ? 'Statement executed successfully.'
        : status === 'failed'
          ? 'Statement execution failed.'
          : status === 'cancelled'
            ? 'Statement was cancelled.'
            : 'Statement is still running.',
    createdOn: Date.now(),
    statementStatus: statusMap[status],
    progressInfo: progress !== undefined ? { percentage: progress } : undefined,
  };
}

// Export singleton instance
export const snowflakeShape = new SnowflakeShape();
