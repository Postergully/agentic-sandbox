/**
 * Schema Assembler
 *
 * Assembles ConnectorSchema from parsed records and fields.
 * Handles entity creation, relationship detection, and endpoint generation.
 *
 * @module large-docs-parser/schema-assembler
 */

import {
  ConnectorSchema,
  EntityDefinition,
  FieldDefinition,
  EndpointDefinition,
  RelationshipDefinition,
  AuthConfig,
} from '../../connector-schema';
import { ParsedRecord, ParsedField, RecordIndexEntry } from './types';
import { FieldMapper } from './field-mapper';

// =============================================================================
// ASSEMBLER OPTIONS
// =============================================================================

export interface SchemaAssemblerOptions {
  /** Connector name */
  name: string;
  /** Schema version */
  version?: string;
  /** Base URL for endpoints */
  baseUrl?: string;
  /** Table name prefix */
  tablePrefix?: string;
  /** Authentication configuration */
  auth?: AuthConfig;
  /** Whether to include CRUD endpoints */
  includeEndpoints?: boolean;
  /** Whether to detect relationships */
  detectRelationships?: boolean;
}

// =============================================================================
// ASSEMBLER CLASS
// =============================================================================

export class SchemaAssembler {
  private options: Required<SchemaAssemblerOptions>;
  private fieldMapper: FieldMapper;

  constructor(options: SchemaAssemblerOptions) {
    this.options = {
      name: options.name,
      version: this.normalizeVersion(options.version || '1.0.0'),
      baseUrl: options.baseUrl || '/api/v1',
      tablePrefix: options.tablePrefix || options.name.toLowerCase(),
      auth: options.auth || this.defaultAuth(),
      includeEndpoints: options.includeEndpoints ?? true,
      detectRelationships: options.detectRelationships ?? true,
    };
    this.fieldMapper = new FieldMapper();
  }

  /**
   * Assemble ConnectorSchema from parsed records
   */
  assemble(
    parsedRecords: ParsedRecord[],
    indexEntries: RecordIndexEntry[]
  ): ConnectorSchema {
    // Build entity map for relationship detection
    const entityMap = new Map<string, EntityDefinition>();
    const recordMap = new Map<string, RecordIndexEntry>();

    for (const entry of indexEntries) {
      const name = entry.schemaName || entry.scriptName || entry.key;
      recordMap.set(name.toLowerCase(), entry);
    }

    // Create entities from parsed records
    const entities: EntityDefinition[] = [];
    for (const record of parsedRecords) {
      const entity = this.createEntity(record, recordMap.get(record.name.toLowerCase()));
      entities.push(entity);
      entityMap.set(entity.name.toLowerCase(), entity);
    }

    // Detect relationships if enabled
    let relationships: RelationshipDefinition[] = [];
    if (this.options.detectRelationships) {
      relationships = this.detectRelationships(entities, parsedRecords);
    }

    return {
      name: this.options.name,
      version: this.options.version,
      baseUrl: this.options.baseUrl,
      auth: this.options.auth,
      entities,
      relationships,
    };
  }

  /**
   * Create a single entity from a parsed record
   */
  createEntity(record: ParsedRecord, _indexEntry?: RecordIndexEntry): EntityDefinition {
    const entityName = this.normalizeEntityName(record.name);
    const tableName = this.createTableName(entityName);

    // Convert parsed fields to field definitions
    const fields = record.fields.map(f => this.createField(f, entityName));

    // Ensure id field exists
    if (!fields.some(f => f.name === 'id')) {
      fields.unshift({
        name: 'id',
        type: 'uuid',
        required: true,
        unique: true,
        faker: 'string.uuid',
      });
    }

    // Generate endpoints if enabled
    const endpoints: EndpointDefinition[] = this.options.includeEndpoints
      ? this.createEndpoints(entityName)
      : [];

    return {
      name: entityName,
      tableName,
      endpoints,
      fields,
    };
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private createField(parsed: ParsedField, _entityName: string): FieldDefinition {
    const mapped = this.fieldMapper.mapField(parsed);

    const field: FieldDefinition = {
      name: this.normalizeFieldName(parsed.name),
      type: mapped.type,
      required: parsed.required,
    };

    // Add faker hint if available
    if (mapped.faker) {
      field.faker = mapped.faker;
    }

    // Add foreign key if this is a reference
    if (mapped.isReference && mapped.referencedEntity) {
      field.foreignKey = {
        entity: mapped.referencedEntity,
        field: 'id',
      };
    }

    return field;
  }

  private createEndpoints(entityName: string): EndpointDefinition[] {
    const basePath = `/${entityName.toLowerCase()}`;

    return [
      { method: 'GET', path: basePath, operation: 'list' },
      { method: 'GET', path: `${basePath}/:id`, operation: 'get' },
      { method: 'POST', path: basePath, operation: 'create' },
      { method: 'PATCH', path: `${basePath}/:id`, operation: 'update' },
      { method: 'DELETE', path: `${basePath}/:id`, operation: 'delete' },
    ];
  }

  private detectRelationships(
    entities: EntityDefinition[],
    parsedRecords: ParsedRecord[]
  ): RelationshipDefinition[] {
    const relationships: RelationshipDefinition[] = [];
    const entityNames = new Set(entities.map(e => e.name.toLowerCase()));

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const parsedRecord = parsedRecords[i];

      for (const field of parsedRecord.fields) {
        const mapped = this.fieldMapper.mapField(field);

        if (mapped.isReference && mapped.referencedEntity) {
          const targetName = mapped.referencedEntity.toLowerCase();

          // Only create relationship if target entity exists
          if (entityNames.has(targetName)) {
            // Determine relationship type from cardinality
            const relType = this.cardinalityToRelationType(field.cardinality);

            relationships.push({
              from: entity.name,
              to: this.normalizeEntityName(mapped.referencedEntity),
              type: relType,
              foreignKey: this.normalizeFieldName(field.name),
            });
          }
        }
      }
    }

    return relationships;
  }

  private cardinalityToRelationType(
    cardinality: string
  ): 'one-to-one' | 'one-to-many' | 'many-to-many' {
    if (cardinality.includes('*') || cardinality.includes('n')) {
      return 'one-to-many';
    }
    return 'one-to-one';
  }

  private normalizeEntityName(name: string): string {
    // Remove common prefixes and convert to PascalCase
    let normalized = name
      .replace(/^record__/, '')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');

    return normalized;
  }

  private normalizeFieldName(name: string): string {
    // Convert to camelCase
    return name.charAt(0).toLowerCase() + name.slice(1);
  }

  private createTableName(entityName: string): string {
    // Convert to snake_case with prefix
    const snakeCase = entityName
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');

    return `${this.options.tablePrefix}_${snakeCase}s`;
  }

  private defaultAuth(): AuthConfig {
    return {
      type: 'tba', // Token-Based Authentication for NetSuite
      fields: ['accountId', 'consumerKey', 'consumerSecret', 'tokenId', 'tokenSecret'],
      config: {
        signatureMethod: 'HMAC-SHA256',
        realm: 'account_id',
      },
    };
  }

  /**
   * Normalize version to semver format (x.y.z)
   */
  private normalizeVersion(version: string): string {
    // Check if already valid semver
    if (/^\d+\.\d+\.\d+$/.test(version)) {
      return version;
    }

    // Handle formats like "2025.2" -> "2025.2.0"
    const parts = version.split('.');
    while (parts.length < 3) {
      parts.push('0');
    }

    // Return only first 3 parts
    return parts.slice(0, 3).join('.');
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Assemble schema from parsed records (convenience function)
 */
export function assembleSchema(
  parsedRecords: ParsedRecord[],
  indexEntries: RecordIndexEntry[],
  options: SchemaAssemblerOptions
): ConnectorSchema {
  const assembler = new SchemaAssembler(options);
  return assembler.assemble(parsedRecords, indexEntries);
}

export default SchemaAssembler;
