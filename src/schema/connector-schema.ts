/**
 * ConnectorSchema - Core data contract for the Building Block System
 *
 * This module defines the unified schema format that all parsers produce
 * and all generators consume. It includes TypeScript interfaces for type safety
 * and Zod schemas for runtime validation.
 *
 * @module connector-schema
 * @version 1.0.0
 */

import { z } from 'zod';

// =============================================================================
// FIELD TYPE DEFINITIONS
// =============================================================================

/**
 * Supported field types for schema definitions
 */
export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'json'
  | 'uuid';

/**
 * Supported authentication types
 */
export type AuthType = 'oauth2' | 'apikey' | 'tba' | 'basic';

/**
 * Supported HTTP methods for endpoints
 */
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Supported CRUD operations
 */
export type Operation = 'list' | 'get' | 'create' | 'update' | 'delete' | 'search';

/**
 * Relationship cardinality types
 */
export type RelationshipType = 'one-to-one' | 'one-to-many' | 'many-to-many';

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

/**
 * Zod schema for field type validation
 */
export const FieldTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'date',
  'datetime',
  'json',
  'uuid',
]);

/**
 * Zod schema for authentication type validation
 */
export const AuthTypeSchema = z.enum(['oauth2', 'apikey', 'tba', 'basic']);

/**
 * Zod schema for HTTP method validation
 */
export const HttpMethodSchema = z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Zod schema for operation type validation
 */
export const OperationSchema = z.enum(['list', 'get', 'create', 'update', 'delete', 'search']);

/**
 * Zod schema for relationship type validation
 */
export const RelationshipTypeSchema = z.enum(['one-to-one', 'one-to-many', 'many-to-many']);

/**
 * Zod schema for foreign key reference
 */
export const ForeignKeySchema = z.object({
  entity: z.string().min(1, 'Foreign key entity name is required'),
  field: z.string().min(1, 'Foreign key field name is required'),
});

/**
 * Zod schema for field definition
 */
export const FieldDefinitionSchema = z.object({
  name: z.string().min(1, 'Field name is required'),
  type: FieldTypeSchema,
  required: z.boolean(),
  unique: z.boolean().optional(),
  faker: z.string().optional(), // e.g., 'company.name', 'internet.email'
  enum: z.array(z.string()).optional(),
  foreignKey: ForeignKeySchema.optional(),
  llmGenerate: z.string().optional(), // Prompt for Claude Haiku
  default: z.unknown().optional(),
});

/**
 * Zod schema for endpoint definition
 */
export const EndpointDefinitionSchema = z.object({
  method: HttpMethodSchema,
  path: z.string().min(1, 'Endpoint path is required'),
  operation: OperationSchema,
  responseTransform: z.string().optional(), // Name of transform function
});

/**
 * Zod schema for entity definition
 */
export const EntityDefinitionSchema = z.object({
  name: z.string().min(1, 'Entity name is required'),
  tableName: z.string().min(1, 'Table name is required'),
  endpoints: z.array(EndpointDefinitionSchema).min(1, 'At least one endpoint is required'),
  fields: z.array(FieldDefinitionSchema).min(1, 'At least one field is required'),
});

/**
 * Zod schema for relationship definition
 */
export const RelationshipDefinitionSchema = z.object({
  from: z.string().min(1, 'Source entity name is required'),
  to: z.string().min(1, 'Target entity name is required'),
  type: RelationshipTypeSchema,
  foreignKey: z.string().min(1, 'Foreign key field name is required'),
});

/**
 * Zod schema for authentication configuration
 */
export const AuthConfigSchema = z.object({
  type: AuthTypeSchema,
  fields: z.array(z.string()).min(1, 'At least one auth field is required'),
  config: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Zod schema for the complete connector schema
 */
export const ConnectorSchemaSchema = z.object({
  name: z.string().min(1, 'Connector name is required'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be in semver format (e.g., 1.0.0)'),
  baseUrl: z.string().min(1, 'Base URL is required'),
  auth: AuthConfigSchema,
  entities: z.array(EntityDefinitionSchema).min(1, 'At least one entity is required'),
  relationships: z.array(RelationshipDefinitionSchema),
});

// =============================================================================
// TYPESCRIPT INTERFACES
// =============================================================================

/**
 * Foreign key reference configuration
 */
export interface ForeignKey {
  /** Referenced entity name */
  entity: string;
  /** Referenced field name */
  field: string;
}

/**
 * Field definition for an entity
 */
export interface FieldDefinition {
  /** Field name (camelCase, e.g., 'companyName') */
  name: string;
  /** Data type */
  type: FieldType;
  /** Whether the field is required */
  required: boolean;
  /** Whether the field must be unique */
  unique?: boolean;
  /** Faker.js method for data generation (e.g., 'company.name', 'internet.email') */
  faker?: string;
  /** Enum values for constrained fields */
  enum?: string[];
  /** Foreign key reference to another entity */
  foreignKey?: ForeignKey;
  /** Prompt for LLM-based data generation (Claude Haiku) */
  llmGenerate?: string;
  /** Default value for the field */
  default?: unknown;
}

/**
 * Endpoint definition for an entity
 */
export interface EndpointDefinition {
  /** HTTP method */
  method: HttpMethod;
  /** URL path pattern (e.g., '/customer', '/customer/:id') */
  path: string;
  /** CRUD operation type */
  operation: Operation;
  /** Name of response transform function */
  responseTransform?: string;
}

/**
 * Entity (table/resource) definition
 */
export interface EntityDefinition {
  /** Entity name (PascalCase, e.g., 'Customer') */
  name: string;
  /** Database table name (snake_case, e.g., 'netsuite_customers') */
  tableName: string;
  /** API endpoints for this entity */
  endpoints: EndpointDefinition[];
  /** Field definitions */
  fields: FieldDefinition[];
}

/**
 * Relationship definition between entities
 */
export interface RelationshipDefinition {
  /** Source entity name */
  from: string;
  /** Target entity name */
  to: string;
  /** Relationship cardinality */
  type: RelationshipType;
  /** Foreign key field name in the source entity */
  foreignKey: string;
}

/**
 * Authentication configuration
 */
export interface AuthConfig {
  /** Authentication type */
  type: AuthType;
  /** Required authentication fields */
  fields: string[];
  /** Additional authentication configuration */
  config?: Record<string, unknown>;
}

/**
 * Main connector schema - the unified data contract
 */
export interface ConnectorSchema {
  /** Connector name (lowercase, e.g., 'netsuite', 'hubspot') */
  name: string;
  /** Schema version in semver format */
  version: string;
  /** Base URL path for API endpoints */
  baseUrl: string;
  /** Authentication configuration */
  auth: AuthConfig;
  /** Entity definitions */
  entities: EntityDefinition[];
  /** Relationship definitions */
  relationships: RelationshipDefinition[];
}

// =============================================================================
// VALIDATION ERROR CLASS
// =============================================================================

/**
 * Custom error class for schema validation errors
 */
export class SchemaValidationError extends Error {
  public readonly issues: z.ZodIssue[];

  constructor(message: string, issues: z.ZodIssue[]) {
    super(message);
    this.name = 'SchemaValidationError';
    this.issues = issues;
  }

  /**
   * Get formatted error messages
   */
  getFormattedErrors(): string[] {
    return this.issues.map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    });
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Validates a schema object and returns a typed ConnectorSchema
 *
 * @param schema - Unknown object to validate
 * @returns Validated ConnectorSchema
 * @throws SchemaValidationError if validation fails
 *
 * @example
 * ```typescript
 * const schema = validateSchema(rawData);
 * console.log(schema.name); // Type-safe access
 * ```
 */
export function validateSchema(schema: unknown): ConnectorSchema {
  const result = ConnectorSchemaSchema.safeParse(schema);

  if (!result.success) {
    throw new SchemaValidationError(
      'Invalid connector schema',
      result.error.issues
    );
  }

  return result.data;
}

/**
 * Parses a JSON string into a validated ConnectorSchema
 *
 * @param json - JSON string to parse
 * @returns Validated ConnectorSchema
 * @throws SyntaxError if JSON is invalid
 * @throws SchemaValidationError if schema validation fails
 *
 * @example
 * ```typescript
 * const schema = parseSchemaFromJSON(jsonString);
 * ```
 */
export function parseSchemaFromJSON(json: string): ConnectorSchema {
  const parsed = JSON.parse(json);
  return validateSchema(parsed);
}

/**
 * Gets an entity definition by name
 *
 * @param schema - Connector schema
 * @param name - Entity name to find (case-insensitive)
 * @returns EntityDefinition or undefined if not found
 *
 * @example
 * ```typescript
 * const customer = getEntityByName(schema, 'customer');
 * if (customer) {
 *   console.log(customer.tableName);
 * }
 * ```
 */
export function getEntityByName(
  schema: ConnectorSchema,
  name: string
): EntityDefinition | undefined {
  const normalizedName = name.toLowerCase();
  return schema.entities.find(
    (entity) => entity.name.toLowerCase() === normalizedName
  );
}

/**
 * Gets all relationships where the given entity is either the source or target
 *
 * @param schema - Connector schema
 * @param entityName - Entity name to find relationships for
 * @returns Array of RelationshipDefinition
 *
 * @example
 * ```typescript
 * const relations = getRelationshipsForEntity(schema, 'invoice');
 * // Returns relationships where invoice is 'from' or 'to'
 * ```
 */
export function getRelationshipsForEntity(
  schema: ConnectorSchema,
  entityName: string
): RelationshipDefinition[] {
  const normalizedName = entityName.toLowerCase();
  return schema.relationships.filter(
    (rel) =>
      rel.from.toLowerCase() === normalizedName ||
      rel.to.toLowerCase() === normalizedName
  );
}

/**
 * Gets outgoing relationships (where entity is the source)
 *
 * @param schema - Connector schema
 * @param entityName - Entity name
 * @returns Array of relationships where entity is the 'from' side
 */
export function getOutgoingRelationships(
  schema: ConnectorSchema,
  entityName: string
): RelationshipDefinition[] {
  const normalizedName = entityName.toLowerCase();
  return schema.relationships.filter(
    (rel) => rel.from.toLowerCase() === normalizedName
  );
}

/**
 * Gets incoming relationships (where entity is the target)
 *
 * @param schema - Connector schema
 * @param entityName - Entity name
 * @returns Array of relationships where entity is the 'to' side
 */
export function getIncomingRelationships(
  schema: ConnectorSchema,
  entityName: string
): RelationshipDefinition[] {
  const normalizedName = entityName.toLowerCase();
  return schema.relationships.filter(
    (rel) => rel.to.toLowerCase() === normalizedName
  );
}

/**
 * Gets all field names that are foreign keys in an entity
 *
 * @param entity - Entity definition
 * @returns Array of field names that are foreign keys
 */
export function getForeignKeyFields(entity: EntityDefinition): string[] {
  return entity.fields
    .filter((field) => field.foreignKey !== undefined)
    .map((field) => field.name);
}

/**
 * Gets required fields for an entity
 *
 * @param entity - Entity definition
 * @returns Array of required field definitions
 */
export function getRequiredFields(entity: EntityDefinition): FieldDefinition[] {
  return entity.fields.filter((field) => field.required);
}

/**
 * Gets fields with Faker.js configuration for data generation
 *
 * @param entity - Entity definition
 * @returns Array of fields with faker configuration
 */
export function getFakerFields(entity: EntityDefinition): FieldDefinition[] {
  return entity.fields.filter((field) => field.faker !== undefined);
}

/**
 * Gets fields with LLM generation configuration
 *
 * @param entity - Entity definition
 * @returns Array of fields with llmGenerate configuration
 */
export function getLLMGeneratedFields(entity: EntityDefinition): FieldDefinition[] {
  return entity.fields.filter((field) => field.llmGenerate !== undefined);
}

/**
 * Gets the endpoint for a specific operation
 *
 * @param entity - Entity definition
 * @param operation - Operation type
 * @returns EndpointDefinition or undefined
 */
export function getEndpointByOperation(
  entity: EntityDefinition,
  operation: Operation
): EndpointDefinition | undefined {
  return entity.endpoints.find((ep) => ep.operation === operation);
}

/**
 * Performs topological sort on entities based on foreign key dependencies
 * Returns entities in order where dependencies come first
 *
 * @param schema - Connector schema
 * @returns Array of entity names in dependency order
 * @throws Error if circular dependency is detected
 */
export function topologicalSortEntities(schema: ConnectorSchema): string[] {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const result: string[] = [];

  // Build dependency map
  const dependencies = new Map<string, string[]>();
  for (const entity of schema.entities) {
    const deps: string[] = [];
    for (const field of entity.fields) {
      if (field.foreignKey) {
        deps.push(field.foreignKey.entity);
      }
    }
    dependencies.set(entity.name.toLowerCase(), deps);
  }

  function visit(name: string): void {
    const normalizedName = name.toLowerCase();

    if (visited.has(normalizedName)) {
      return;
    }

    if (visiting.has(normalizedName)) {
      throw new Error(`Circular dependency detected involving entity: ${name}`);
    }

    visiting.add(normalizedName);

    const deps = dependencies.get(normalizedName) || [];
    for (const dep of deps) {
      visit(dep);
    }

    visiting.delete(normalizedName);
    visited.add(normalizedName);

    // Find original case entity name
    const entity = schema.entities.find(
      (e) => e.name.toLowerCase() === normalizedName
    );
    if (entity) {
      result.push(entity.name);
    }
  }

  for (const entity of schema.entities) {
    visit(entity.name);
  }

  return result;
}

/**
 * Validates that all foreign key references point to existing entities
 *
 * @param schema - Connector schema
 * @returns Array of validation error messages (empty if valid)
 */
export function validateForeignKeyReferences(schema: ConnectorSchema): string[] {
  const errors: string[] = [];
  const entityNames = new Set(
    schema.entities.map((e) => e.name.toLowerCase())
  );

  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if (field.foreignKey) {
        const refEntity = field.foreignKey.entity.toLowerCase();
        if (!entityNames.has(refEntity)) {
          errors.push(
            `Entity "${entity.name}" field "${field.name}" references non-existent entity "${field.foreignKey.entity}"`
          );
        }
      }
    }
  }

  // Also validate relationships
  for (const rel of schema.relationships) {
    if (!entityNames.has(rel.from.toLowerCase())) {
      errors.push(
        `Relationship from non-existent entity "${rel.from}"`
      );
    }
    if (!entityNames.has(rel.to.toLowerCase())) {
      errors.push(
        `Relationship to non-existent entity "${rel.to}"`
      );
    }
  }

  return errors;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard to check if an object is a valid ConnectorSchema
 */
export function isConnectorSchema(obj: unknown): obj is ConnectorSchema {
  return ConnectorSchemaSchema.safeParse(obj).success;
}

/**
 * Type guard to check if an object is a valid EntityDefinition
 */
export function isEntityDefinition(obj: unknown): obj is EntityDefinition {
  return EntityDefinitionSchema.safeParse(obj).success;
}

/**
 * Type guard to check if an object is a valid FieldDefinition
 */
export function isFieldDefinition(obj: unknown): obj is FieldDefinition {
  return FieldDefinitionSchema.safeParse(obj).success;
}

// =============================================================================
// EXPORTS SUMMARY
// =============================================================================

// Re-export all for convenience
export default {
  // Validation
  validateSchema,
  parseSchemaFromJSON,
  isConnectorSchema,
  isEntityDefinition,
  isFieldDefinition,

  // Entity helpers
  getEntityByName,
  getRequiredFields,
  getForeignKeyFields,
  getFakerFields,
  getLLMGeneratedFields,
  getEndpointByOperation,

  // Relationship helpers
  getRelationshipsForEntity,
  getOutgoingRelationships,
  getIncomingRelationships,

  // Analysis
  topologicalSortEntities,
  validateForeignKeyReferences,

  // Zod schemas
  ConnectorSchemaSchema,
  EntityDefinitionSchema,
  FieldDefinitionSchema,
  EndpointDefinitionSchema,
  RelationshipDefinitionSchema,
  AuthConfigSchema,

  // Error class
  SchemaValidationError,
};
