/**
 * API Shape System - Base Types and Interfaces
 *
 * Defines the contract for connector shapes that transform
 * API responses to match specific external system formats.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type AuthType = 'oauth2' | 'apikey' | 'basic' | 'keypair';

/**
 * Configuration for a single API endpoint within a shape
 */
export interface EndpointConfig {
  /** HTTP method for this endpoint */
  method: HttpMethod;
  /** URL path pattern (can include :params) */
  path: string;
  /** Query parameters this endpoint accepts */
  queryParams?: string[];
  /** JSON Schema for request body validation */
  bodySchema?: Record<string, unknown>;
  /** Description for documentation */
  description?: string;
}

/**
 * Authentication configuration for a shape
 */
export interface ShapeAuthConfig {
  /** Type of authentication this shape uses */
  type: AuthType;
  /** Authentication-related endpoints */
  endpoints: {
    /** Token endpoint for OAuth flows */
    token?: string;
    /** User info endpoint */
    userinfo?: string;
    /** Authorization endpoint for OAuth code flow */
    authorize?: string;
  };
  /**
   * For mock server: accept any credentials without validation
   * Real implementations would set this to false
   */
  acceptAnyCredentials: boolean;
  /** Token expiration in seconds */
  tokenExpiresIn?: number;
}

/**
 * Metadata about query results for response transformation
 */
export interface QueryMetadata {
  /** Number of rows returned */
  rowCount: number;
  /** Column definitions */
  columns: ColumnDefinition[];
  /** Execution time in milliseconds */
  executionTimeMs?: number;
  /** Statement handle/ID for async operations */
  statementHandle?: string;
  /** SQL state code */
  sqlState?: string;
}

/**
 * Column definition for result set metadata
 */
export interface ColumnDefinition {
  /** Column name */
  name: string;
  /** Data type (varies by shape) */
  type: string;
  /** Whether column can be null */
  nullable?: boolean;
  /** Byte length for string types */
  byteLength?: number;
  /** Precision for numeric types */
  precision?: number;
  /** Scale for numeric types */
  scale?: number;
}

/**
 * Core interface for API shapes
 *
 * Each shape defines how to transform data and responses
 * to match a specific external system's API format.
 */
export interface ApiShape {
  /** Unique identifier for this shape */
  name: string;

  /** Display name for documentation */
  displayName: string;

  /** Base URL path prefix for all endpoints */
  baseUrl: string;

  /** Map of endpoint name to configuration */
  endpoints: Record<string, EndpointConfig>;

  /** Authentication configuration */
  auth: ShapeAuthConfig;

  /**
   * Transform raw data to this shape's response format
   * @param data - Raw query result data
   * @param metadata - Query execution metadata
   * @returns Transformed response matching this shape's format
   */
  responseTransform(data: unknown[], metadata?: QueryMetadata): unknown;

  /**
   * Transform error to this shape's error format
   * @param error - Error object or message
   * @param code - Optional error code
   * @returns Formatted error response
   */
  errorTransform(error: Error | string, code?: string): unknown;

  /**
   * Generate a token response for this shape
   * @param tokenData - Token generation parameters
   * @returns Token response in this shape's format
   */
  generateTokenResponse(tokenData: TokenGenerationParams): unknown;
}

/**
 * Parameters for token generation
 */
export interface TokenGenerationParams {
  /** Access token string */
  accessToken: string;
  /** Refresh token string (optional) */
  refreshToken?: string;
  /** Expiration time in seconds */
  expiresIn: number;
  /** Token type (usually 'Bearer') */
  tokenType?: string;
  /** Scope granted */
  scope?: string;
}

/**
 * Registry entry for a shape
 */
export interface ShapeRegistryEntry {
  /** Shape instance */
  shape: ApiShape;
  /** Version of this shape */
  version: string;
  /** Whether this shape is enabled */
  enabled: boolean;
}

/**
 * Type guard to check if an object implements ApiShape
 */
export function isApiShape(obj: unknown): obj is ApiShape {
  if (!obj || typeof obj !== 'object') return false;
  const shape = obj as Partial<ApiShape>;
  return (
    typeof shape.name === 'string' &&
    typeof shape.baseUrl === 'string' &&
    typeof shape.endpoints === 'object' &&
    typeof shape.auth === 'object' &&
    typeof shape.responseTransform === 'function'
  );
}
