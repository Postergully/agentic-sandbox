/**
 * OpenAPI/Swagger Parser
 *
 * Parses OpenAPI 3.x and Swagger 2.x specifications to extract
 * ConnectorSchema definitions including entities, fields, endpoints,
 * and relationships.
 *
 * @module openapi-parser
 */

import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';
import {
  ConnectorSchema,
  EntityDefinition,
  FieldDefinition,
  EndpointDefinition,
  RelationshipDefinition,
  AuthConfig,
  FieldType,
  HttpMethod,
  Operation,
  validateSchema,
} from '../connector-schema';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of OpenAPI parsing
 */
export interface OpenAPIParseResult {
  schema: ConnectorSchema;
  warnings: string[];
  metadata: {
    openApiVersion: string;
    title: string;
    description?: string;
    servers?: string[];
  };
}

/**
 * Parser options
 */
export interface OpenAPIParserOptions {
  /** Connector name (defaults to API title in snake_case) */
  name?: string;
  /** Base URL prefix for endpoints */
  baseUrl?: string;
  /** Table name prefix (e.g., 'netsuite_' -> 'netsuite_customers') */
  tablePrefix?: string;
  /** Whether to infer relationships from $ref */
  inferRelationships?: boolean;
  /** Whether to include deprecated endpoints */
  includeDeprecated?: boolean;
}

// =============================================================================
// TYPE MAPPING
// =============================================================================

/**
 * Maps OpenAPI types to FieldType
 */
function mapOpenAPITypeToFieldType(
  schema: OpenAPIV3.SchemaObject | OpenAPIV3_1.SchemaObject
): FieldType {
  const type = schema.type as string;
  const format = schema.format;

  // Handle arrays and objects specially
  if (type === 'array' || type === 'object') {
    return 'json';
  }

  // String formats
  if (type === 'string') {
    switch (format) {
      case 'uuid':
        return 'uuid';
      case 'date':
        return 'date';
      case 'date-time':
        return 'datetime';
      case 'email':
      case 'uri':
      case 'hostname':
      default:
        return 'string';
    }
  }

  // Number types
  if (type === 'integer' || type === 'number') {
    return 'number';
  }

  // Boolean
  if (type === 'boolean') {
    return 'boolean';
  }

  // Default to string for unknown types
  return 'string';
}

/**
 * Maps HTTP method string to HttpMethod type
 */
function mapHttpMethod(method: string): HttpMethod | null {
  const upper = method.toUpperCase();
  if (['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(upper)) {
    return upper as HttpMethod;
  }
  return null;
}

/**
 * Infers CRUD operation from HTTP method and path
 */
function inferOperation(method: HttpMethod, path: string): Operation {
  const hasIdParam = path.includes('{') || path.includes(':');

  switch (method) {
    case 'GET':
      return hasIdParam ? 'get' : 'list';
    case 'POST':
      // Check for search endpoints
      if (path.toLowerCase().includes('search')) {
        return 'search';
      }
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return 'get';
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Converts a string to snake_case
 */
/**
 * Normalizes a version string to semver format (X.Y.Z).
 * Handles common non-semver versions like "v1", "2.0", "1", etc.
 */
function toSemver(version?: string): string {
  if (!version) return '1.0.0';
  // Strip leading 'v' or 'V'
  const cleaned = version.replace(/^[vV]/, '');
  // Already valid semver?
  if (/^\d+\.\d+\.\d+/.test(cleaned)) return cleaned;
  // Two-part version like "2.0"
  if (/^\d+\.\d+$/.test(cleaned)) return `${cleaned}.0`;
  // Single number like "1"
  if (/^\d+$/.test(cleaned)) return `${cleaned}.0.0`;
  // Fallback
  return '1.0.0';
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/-/g, '_')
    .replace(/\s+/g, '_')
    .replace(/__+/g, '_');
}

/**
 * Converts a string to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (c) => c.toUpperCase());
}

/**
 * Converts a string to camelCase
 */
function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Segments to skip when extracting entity names from paths.
 * Includes version prefixes (v1, v2.1) and common non-entity segments.
 */
const NON_ENTITY_SEGMENTS = new Set(['api', 'public', 'internal', 'external', 'rest', 'graphql', 'admin', 'private']);

/**
 * Extracts entity name from path, skipping version prefixes and non-entity segments.
 * e.g., '/v1/public/contracts/{id}' -> 'Contract'
 */
function extractEntityNameFromPath(path: string): string {
  // Remove leading slash and parameters
  const segments = path
    .split('/')
    .filter((s) => s && !s.startsWith('{') && !s.startsWith(':'));

  if (segments.length === 0) {
    return 'Root';
  }

  // Find the first meaningful segment (skip version prefixes and non-entity segments)
  const entitySegment = segments.find(
    (s) => !(/^v\d+\.?\d*$/i.test(s)) && !NON_ENTITY_SEGMENTS.has(s.toLowerCase())
  );

  const entityName = entitySegment || segments[segments.length - 1];

  // Singularize common patterns
  let singular = entityName;
  if (singular.endsWith('ies')) {
    singular = singular.slice(0, -3) + 'y';
  } else if (singular.endsWith('ses') || singular.endsWith('xes') || singular.endsWith('zes') || singular.endsWith('ches') || singular.endsWith('shes')) {
    singular = singular.slice(0, -2);
  } else if (singular.endsWith('s') && !singular.endsWith('ss')) {
    singular = singular.slice(0, -1);
  }

  return toPascalCase(singular);
}

/**
 * Normalizes path parameters from {param} to :param format
 */
function normalizePath(path: string): string {
  return path.replace(/{([^}]+)}/g, ':$1');
}


/**
 * Infers Faker.js method for a field based on name and type
 */
function inferFakerMethod(
  name: string,
  type: FieldType,
  format?: string
): string | undefined {
  const lowerName = name.toLowerCase();

  // UUID fields
  if (type === 'uuid' || lowerName === 'id' || lowerName.endsWith('id')) {
    return 'string.uuid';
  }

  // Email
  if (lowerName.includes('email') || format === 'email') {
    return 'internet.email';
  }

  // Phone
  if (lowerName.includes('phone') || lowerName.includes('tel')) {
    return 'phone.number';
  }

  // Address fields
  if (lowerName.includes('street')) {
    return 'location.streetAddress';
  }
  if (lowerName.includes('city')) {
    return 'location.city';
  }
  if (lowerName.includes('state') || lowerName.includes('province')) {
    return 'location.state';
  }
  if (lowerName.includes('country')) {
    return 'location.country';
  }
  if (lowerName.includes('zip') || lowerName.includes('postal')) {
    return 'location.zipCode';
  }
  if (lowerName.includes('address')) {
    return 'location.streetAddress';
  }

  // Name fields
  if (lowerName === 'firstname' || lowerName === 'first_name') {
    return 'person.firstName';
  }
  if (lowerName === 'lastname' || lowerName === 'last_name') {
    return 'person.lastName';
  }
  if (lowerName === 'name' || lowerName === 'fullname') {
    return 'person.fullName';
  }
  if (lowerName.includes('company') || lowerName.includes('organization')) {
    return 'company.name';
  }

  // Web fields
  if (lowerName.includes('url') || lowerName.includes('website') || format === 'uri') {
    return 'internet.url';
  }
  if (lowerName.includes('username')) {
    return 'internet.username';
  }

  // Financial
  if (lowerName.includes('amount') || lowerName.includes('price') || lowerName.includes('total')) {
    return 'finance.amount';
  }
  if (lowerName.includes('currency')) {
    return 'finance.currencyCode';
  }

  // Dates
  if (type === 'date' || type === 'datetime') {
    return 'date.recent';
  }

  // Description/notes
  if (lowerName.includes('description') || lowerName.includes('note') || lowerName.includes('memo')) {
    return 'lorem.sentence';
  }

  // Status (return undefined to let enum handle it)
  if (lowerName.includes('status') || lowerName.includes('state')) {
    return undefined;
  }

  // Boolean
  if (type === 'boolean') {
    return 'datatype.boolean';
  }

  // Numbers
  if (type === 'number') {
    return 'number.int';
  }

  // Default string
  if (type === 'string') {
    return 'lorem.word';
  }

  return undefined;
}

// =============================================================================
// MAIN PARSER CLASS
// =============================================================================

/**
 * OpenAPI Parser
 *
 * Parses OpenAPI/Swagger specifications and extracts ConnectorSchema
 */
export class OpenAPIParser {
  private options: Required<OpenAPIParserOptions>;
  private warnings: string[] = [];

  constructor(options: OpenAPIParserOptions = {}) {
    this.options = {
      name: options.name || '',
      baseUrl: options.baseUrl || '/api',
      tablePrefix: options.tablePrefix || '',
      inferRelationships: options.inferRelationships ?? true,
      includeDeprecated: options.includeDeprecated ?? false,
    };
  }

  /**
   * Parse an OpenAPI specification from a file path or URL
   */
  async parse(input: string): Promise<OpenAPIParseResult> {
    this.warnings = [];

    // Parse the OpenAPI spec
    const api = await SwaggerParser.dereference(input);

    return this.parseDocument(api as OpenAPIV3.Document | OpenAPIV3_1.Document);
  }

  /**
   * Parse an OpenAPI document object
   */
  async parseDocument(
    api: OpenAPIV3.Document | OpenAPIV3_1.Document
  ): Promise<OpenAPIParseResult> {
    this.warnings = [];

    // Extract metadata
    const openApiVersion =
      (api as OpenAPIV3.Document).openapi || (api as unknown as { swagger?: string }).swagger || 'unknown';
    const title = api.info?.title || 'Unknown API';
    const description = api.info?.description;
    const servers = (api as OpenAPIV3.Document).servers?.map((s) => s.url);

    // Determine connector name
    const name = this.options.name || toSnakeCase(title);
    const tablePrefix = this.options.tablePrefix || `${name}_`;

    // Extract entities from schemas
    const entityMap = new Map<string, EntityDefinition>();
    const relationships: RelationshipDefinition[] = [];

    // First pass: extract entities from components/schemas
    if (api.components?.schemas) {
      for (const [schemaName, schemaObj] of Object.entries(api.components.schemas)) {
        const schema = schemaObj as OpenAPIV3.SchemaObject;

        // Skip non-object schemas
        if (schema.type !== 'object' && !schema.properties) {
          continue;
        }

        const entity = this.extractEntity(schemaName, schema, tablePrefix);
        if (entity) {
          entityMap.set(schemaName, entity);
        }
      }
    }

    // Second pass: extract endpoints and associate with entities
    if (api.paths) {
      for (const [path, pathItem] of Object.entries(api.paths)) {
        if (!pathItem) continue;

        const entityName = extractEntityNameFromPath(path);

        // Get or create entity
        let entity = entityMap.get(entityName);
        if (!entity) {
          entity = {
            name: entityName,
            tableName: `${tablePrefix}${toSnakeCase(entityName)}s`,
            endpoints: [],
            fields: [],
          };
          entityMap.set(entityName, entity);
        }

        // Extract endpoints from path methods
        const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;

        for (const method of methods) {
          const operation = pathItem[method] as OpenAPIV3.OperationObject | undefined;
          if (!operation) continue;

          // Skip deprecated if configured
          if (operation.deprecated && !this.options.includeDeprecated) {
            this.warnings.push(`Skipped deprecated endpoint: ${method.toUpperCase()} ${path}`);
            continue;
          }

          const httpMethod = mapHttpMethod(method);
          if (!httpMethod) continue;

          const endpoint: EndpointDefinition = {
            method: httpMethod,
            path: normalizePath(path),
            operation: inferOperation(httpMethod, path),
          };

          // Check for duplicate endpoints
          const isDuplicate = entity.endpoints.some(
            (e) => e.method === endpoint.method && e.path === endpoint.path
          );
          if (!isDuplicate) {
            entity.endpoints.push(endpoint);
          }

          // Extract fields from request body schema
          if (operation.requestBody) {
            const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
            const content = requestBody.content?.['application/json'];
            if (content?.schema) {
              const bodySchema = content.schema as OpenAPIV3.SchemaObject;
              this.extractFieldsFromSchema(entity, bodySchema, api);
            }
          }

          // Extract fields from response schema
          const successResponse = operation.responses?.['200'] || operation.responses?.['201'];
          if (successResponse) {
            const response = successResponse as OpenAPIV3.ResponseObject;
            const content = response.content?.['application/json'];
            if (content?.schema) {
              const responseSchema = content.schema as OpenAPIV3.SchemaObject;
              this.extractFieldsFromSchema(entity, responseSchema, api);
            }
          }
        }
      }
    }

    // Third pass: detect relationships from foreign key patterns
    if (this.options.inferRelationships) {
      for (const entity of entityMap.values()) {
        for (const field of entity.fields) {
          // Check if field looks like a foreign key
          if (
            field.name.endsWith('Id') ||
            field.name.endsWith('_id') ||
            field.foreignKey
          ) {
            const refEntityName = field.name
              .replace(/Id$/, '')
              .replace(/_id$/, '');
            const refEntity = entityMap.get(toPascalCase(refEntityName));

            if (refEntity && !field.foreignKey) {
              field.foreignKey = {
                entity: refEntity.name,
                field: 'id',
              };

              // Add relationship
              const relationExists = relationships.some(
                (r) =>
                  r.from === entity.name &&
                  r.to === refEntity.name &&
                  r.foreignKey === field.name
              );

              if (!relationExists) {
                relationships.push({
                  from: entity.name,
                  to: refEntity.name,
                  type: 'one-to-many',
                  foreignKey: field.name,
                });
              }
            }
          }
        }
      }
    }

    // Extract auth configuration
    const auth = this.extractAuthConfig(api);

    // Build final schema
    const entities = Array.from(entityMap.values()).filter(
      (e) => e.fields.length > 0 || e.endpoints.length > 0
    );

    // Ensure all entities have at least an id field and endpoints
    for (const entity of entities) {
      const hasId = entity.fields.some((f) => f.name === 'id');
      if (!hasId) {
        entity.fields.unshift({
          name: 'id',
          type: 'uuid',
          required: true,
          unique: true,
          faker: 'string.uuid',
        });
      }

      // Add default CRUD endpoints if none exist
      if (entity.endpoints.length === 0) {
        const basePath = `/${entity.name.toLowerCase()}s`;
        entity.endpoints.push(
          { method: 'GET', path: basePath, operation: 'list' },
          { method: 'GET', path: `${basePath}/:id`, operation: 'get' },
          { method: 'POST', path: basePath, operation: 'create' },
          { method: 'PATCH', path: `${basePath}/:id`, operation: 'update' },
          { method: 'DELETE', path: `${basePath}/:id`, operation: 'delete' }
        );
      }
    }

    const schema: ConnectorSchema = {
      name,
      version: toSemver(api.info?.version),
      baseUrl: this.options.baseUrl,
      auth,
      entities,
      relationships,
    };

    // Validate the schema
    const validated = validateSchema(schema);

    return {
      schema: validated,
      warnings: this.warnings,
      metadata: {
        openApiVersion,
        title,
        description,
        servers,
      },
    };
  }

  /**
   * Extract an entity from a schema definition
   */
  private extractEntity(
    schemaName: string,
    schema: OpenAPIV3.SchemaObject,
    tablePrefix: string
  ): EntityDefinition | null {
    const fields: FieldDefinition[] = [];

    // Extract fields from properties
    if (schema.properties) {
      const required = new Set(schema.required || []);

      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const prop = propSchema as OpenAPIV3.SchemaObject;
        const fieldType = mapOpenAPITypeToFieldType(prop);

        const field: FieldDefinition = {
          name: toCamelCase(propName),
          type: fieldType,
          required: required.has(propName),
        };

        // Check for unique constraint hints
        if (propName === 'id' || prop.description?.toLowerCase().includes('unique')) {
          field.unique = true;
        }

        // Extract enum values
        if (prop.enum) {
          field.enum = prop.enum.map(String);
        }

        // Infer faker method
        const faker = inferFakerMethod(propName, fieldType, prop.format);
        if (faker) {
          field.faker = faker;
        }

        fields.push(field);
      }
    }

    return {
      name: toPascalCase(schemaName),
      tableName: `${tablePrefix}${toSnakeCase(schemaName)}s`,
      endpoints: [],
      fields,
    };
  }

  /**
   * Extract fields from a schema and add to entity
   */
  private extractFieldsFromSchema(
    entity: EntityDefinition,
    schema: OpenAPIV3.SchemaObject,
    _api: OpenAPIV3.Document | OpenAPIV3_1.Document
  ): void {
    // Handle array schemas (unwrap to get item schema)
    let targetSchema = schema;
    if (schema.type === 'array' && schema.items) {
      targetSchema = schema.items as OpenAPIV3.SchemaObject;
    }

    // Handle allOf/oneOf/anyOf
    if (targetSchema.allOf) {
      for (const subSchema of targetSchema.allOf) {
        this.extractFieldsFromSchema(entity, subSchema as OpenAPIV3.SchemaObject, _api);
      }
      return;
    }

    // Extract from properties
    if (targetSchema.properties) {
      const required = new Set(targetSchema.required || []);
      const existingFields = new Set(entity.fields.map((f) => f.name));

      for (const [propName, propSchema] of Object.entries(targetSchema.properties)) {
        const fieldName = toCamelCase(propName);
        if (existingFields.has(fieldName)) {
          continue;
        }

        const prop = propSchema as OpenAPIV3.SchemaObject;
        const fieldType = mapOpenAPITypeToFieldType(prop);

        const field: FieldDefinition = {
          name: fieldName,
          type: fieldType,
          required: required.has(propName),
        };

        // Check for unique
        if (propName === 'id' || prop.description?.toLowerCase().includes('unique')) {
          field.unique = true;
        }

        // Extract enum
        if (prop.enum) {
          field.enum = prop.enum.map(String);
        }

        // Infer faker
        const faker = inferFakerMethod(propName, fieldType, prop.format);
        if (faker) {
          field.faker = faker;
        }

        entity.fields.push(field);
        existingFields.add(fieldName);
      }
    }
  }

  /**
   * Extract authentication configuration from security schemes
   */
  private extractAuthConfig(
    api: OpenAPIV3.Document | OpenAPIV3_1.Document
  ): AuthConfig {
    const securitySchemes = api.components?.securitySchemes;

    if (!securitySchemes) {
      return {
        type: 'apikey',
        fields: ['api_key'],
      };
    }

    // Check for OAuth2
    for (const [_name, scheme] of Object.entries(securitySchemes)) {
      const secScheme = scheme as OpenAPIV3.SecuritySchemeObject;

      if (secScheme.type === 'oauth2') {
        const flows = secScheme.flows as {
          clientCredentials?: { tokenUrl?: string };
          authorizationCode?: { tokenUrl?: string };
          password?: { tokenUrl?: string };
        };
        const tokenUrl =
          flows?.clientCredentials?.tokenUrl ||
          flows?.authorizationCode?.tokenUrl ||
          flows?.password?.tokenUrl;

        return {
          type: 'oauth2',
          fields: ['client_id', 'client_secret'],
          config: tokenUrl ? { tokenEndpoint: tokenUrl } : undefined,
        };
      }

      if (secScheme.type === 'http' && secScheme.scheme === 'basic') {
        return {
          type: 'basic',
          fields: ['username', 'password'],
        };
      }

      if (secScheme.type === 'apiKey') {
        return {
          type: 'apikey',
          fields: [secScheme.name || 'api_key'],
          config: {
            in: secScheme.in,
          },
        };
      }
    }

    // Default to API key
    return {
      type: 'apikey',
      fields: ['api_key'],
    };
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Parse an OpenAPI spec file or URL
 */
export async function parseOpenAPI(
  input: string,
  options?: OpenAPIParserOptions
): Promise<OpenAPIParseResult> {
  const parser = new OpenAPIParser(options);
  return parser.parse(input);
}

/**
 * Check if a string looks like an OpenAPI spec reference
 */
export function isOpenAPISpec(input: string): boolean {
  // Check file extension
  if (
    input.endsWith('.yaml') ||
    input.endsWith('.yml') ||
    input.endsWith('.json')
  ) {
    return true;
  }

  // Check if URL points to OpenAPI spec
  if (input.includes('openapi') || input.includes('swagger')) {
    return true;
  }

  // Try to parse as JSON/YAML and check for OpenAPI markers
  try {
    const parsed = JSON.parse(input);
    return !!(parsed.openapi || parsed.swagger);
  } catch {
    // Not JSON, could still be YAML file path
    return false;
  }
}

export { extractEntityNameFromPath as _extractEntityNameFromPath };
export default OpenAPIParser;
