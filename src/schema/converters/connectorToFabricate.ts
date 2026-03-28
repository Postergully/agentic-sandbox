/**
 * ConnectorSchema to Tonic Fabricate Converter
 *
 * Converts ConnectorSchema format to Tonic Fabricate's database/entity
 * configuration format for data generation requests.
 */

import {
  ConnectorSchema,
  EntitySchema,
  FieldSchema,
  GenerationBrief,
  GenerationMetadata,
} from '../../types/dataGeneration';
import logger from '../../utils/logger';

// ============================================================================
// Fabricate Configuration Types
// ============================================================================

export interface FabricateDatabaseConfig {
  name: string;
  description?: string;
  tables: FabricateTableConfig[];
  relationships: FabricateRelationshipConfig[];
  context: FabricateContextConfig;
}

export interface FabricateTableConfig {
  name: string;
  displayName?: string;
  description?: string;
  rowCount: number;
  columns: FabricateColumnConfig[];
  constraints?: FabricateTableConstraint[];
}

export interface FabricateColumnConfig {
  name: string;
  displayName?: string;
  type: FabricateColumnType;
  nullable: boolean;
  unique?: boolean;
  primaryKey?: boolean;
  generator?: FabricateGeneratorConfig;
  constraints?: FabricateColumnConstraint[];
}

export type FabricateColumnType =
  | 'text'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'uuid'
  | 'json'
  | 'array';

export interface FabricateGeneratorConfig {
  type: 'pattern' | 'range' | 'list' | 'foreign_key' | 'sequence' | 'ai';
  config: Record<string, unknown>;
}

export interface FabricateColumnConstraint {
  type: 'regex' | 'range' | 'enum' | 'custom';
  value: string | number | string[];
}

export interface FabricateTableConstraint {
  type: 'unique_together' | 'check' | 'custom';
  columns?: string[];
  expression?: string;
}

export interface FabricateRelationshipConfig {
  name: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

export interface FabricateContextConfig {
  industry: string;
  companySize?: string;
  region?: string;
  vertical?: string;
  locale?: string;
  customInstructions?: string;
}

// ============================================================================
// Converter Class
// ============================================================================

export class ConnectorToFabricateConverter {
  /**
   * Convert a ConnectorSchema to a Fabricate database configuration
   */
  static convert(
    schema: ConnectorSchema,
    brief: GenerationBrief,
    entityVolumes?: Record<string, number>
  ): FabricateDatabaseConfig {
    const connectorSpec = brief.connectors.find((c) => c.name === schema.connectorId);

    // Build tables from entities
    const tables: FabricateTableConfig[] = [];
    const relationships: FabricateRelationshipConfig[] = [];

    for (const [entityName, entitySchema] of Object.entries(schema.entities)) {
      // Get volume from brief or use default
      const volume = entityVolumes?.[entityName] ||
        connectorSpec?.entities.find((e) => e.name === entityName)?.estimatedVolume ||
        100;

      const tableConfig = ConnectorToFabricateConverter.convertEntity(
        entityName,
        entitySchema,
        volume,
        schema.dataGenerationHints?.[entityName]
      );

      tables.push(tableConfig);

      // Extract relationships from foreign keys
      const tableRelationships = ConnectorToFabricateConverter.extractRelationships(
        entityName,
        entitySchema
      );
      relationships.push(...tableRelationships);
    }

    // Build context from brief metadata
    const context = ConnectorToFabricateConverter.buildContext(brief.metadata);

    return {
      name: `${schema.connectorId}_${brief.orgId}_${brief.jobId}`,
      description: schema.description,
      tables,
      relationships,
      context,
    };
  }

  /**
   * Convert a single entity to Fabricate table config
   */
  static convertEntity(
    entityName: string,
    entitySchema: EntitySchema,
    rowCount: number,
    hints?: Record<string, unknown>
  ): FabricateTableConfig {
    const columns = entitySchema.fields.map((field) =>
      ConnectorToFabricateConverter.convertField(field, hints)
    );

    // Extract unique constraints
    const uniqueFields = entitySchema.fields
      .filter((f) => f.unique && !f.primaryKey)
      .map((f) => f.name);

    const constraints: FabricateTableConstraint[] = [];
    if (uniqueFields.length > 0) {
      constraints.push({
        type: 'unique_together',
        columns: uniqueFields,
      });
    }

    return {
      name: entitySchema.table,
      displayName: entityName,
      description: entitySchema.description,
      rowCount,
      columns,
      constraints: constraints.length > 0 ? constraints : undefined,
    };
  }

  /**
   * Convert a field to Fabricate column config
   */
  static convertField(
    field: FieldSchema,
    hints?: Record<string, unknown>
  ): FabricateColumnConfig {
    const columnType = ConnectorToFabricateConverter.mapFieldType(field.type);

    const column: FabricateColumnConfig = {
      name: field.name,
      displayName: field.snowflakeName || field.name,
      type: columnType,
      nullable: !field.required,
      unique: field.unique,
      primaryKey: field.primaryKey,
    };

    // Build generator config
    column.generator = ConnectorToFabricateConverter.buildGenerator(field, hints);

    // Build constraints
    const constraints = ConnectorToFabricateConverter.buildConstraints(field, hints);
    if (constraints.length > 0) {
      column.constraints = constraints;
    }

    return column;
  }

  /**
   * Map ConnectorSchema field types to Fabricate types
   */
  static mapFieldType(fieldType: string): FabricateColumnType {
    const typeMap: Record<string, FabricateColumnType> = {
      uuid: 'uuid',
      string: 'text',
      text: 'text',
      varchar: 'text',
      integer: 'integer',
      int: 'integer',
      number: 'decimal',
      decimal: 'decimal',
      float: 'decimal',
      double: 'decimal',
      boolean: 'boolean',
      date: 'date',
      datetime: 'datetime',
      timestamp: 'datetime',
      json: 'json',
      object: 'json',
      array: 'array',
    };

    return typeMap[fieldType.toLowerCase()] || 'text';
  }

  /**
   * Build generator configuration for a field
   */
  static buildGenerator(
    field: FieldSchema,
    hints?: Record<string, unknown>
  ): FabricateGeneratorConfig {
    // Handle foreign keys
    if (field.foreignKey) {
      return {
        type: 'foreign_key',
        config: {
          table: field.foreignKey.table,
          column: field.foreignKey.column,
        },
      };
    }

    // Handle primary keys
    if (field.primaryKey && field.type === 'uuid') {
      return {
        type: 'sequence',
        config: { format: 'uuid' },
      };
    }

    // Handle fields with explicit faker config
    if (field.faker) {
      return ConnectorToFabricateConverter.fakerToFabricateGenerator(
        field.faker,
        field.fakerArgs
      );
    }

    // Handle static defaults
    if (field.default !== undefined) {
      return {
        type: 'list',
        config: { values: [field.default] },
      };
    }

    // Handle distribution hints
    if (hints) {
      const distribution = (hints as Record<string, unknown>)[`${field.name}Distribution`];
      if (distribution && typeof distribution === 'object') {
        return {
          type: 'list',
          config: {
            values: Object.keys(distribution as Record<string, number>),
            weights: Object.values(distribution as Record<string, number>),
          },
        };
      }
    }

    // Default to AI-based generation
    return {
      type: 'ai',
      config: {
        fieldName: field.name,
        fieldType: field.type,
        description: field.description,
      },
    };
  }

  /**
   * Convert Faker.js method to Fabricate generator
   */
  static fakerToFabricateGenerator(
    fakerMethod: string,
    fakerArgs?: unknown[]
  ): FabricateGeneratorConfig {
    // Map common faker methods to Fabricate generators
    const fakerMappings: Record<string, () => FabricateGeneratorConfig> = {
      'string.uuid': () => ({
        type: 'sequence',
        config: { format: 'uuid' },
      }),

      'helpers.arrayElement': () => ({
        type: 'list',
        config: {
          values: fakerArgs?.[0] as string[] || [],
        },
      }),

      'number.int': () => ({
        type: 'range',
        config: {
          min: (fakerArgs?.[0] as { min?: number })?.min || 0,
          max: (fakerArgs?.[0] as { max?: number })?.max || 1000,
          type: 'integer',
        },
      }),

      'number.float': () => ({
        type: 'range',
        config: {
          min: (fakerArgs?.[0] as { min?: number })?.min || 0,
          max: (fakerArgs?.[0] as { max?: number })?.max || 1000,
          precision: (fakerArgs?.[0] as { precision?: number })?.precision || 0.01,
          type: 'decimal',
        },
      }),

      'finance.amount': () => ({
        type: 'range',
        config: {
          min: (fakerArgs?.[0] as { min?: number })?.min || 0,
          max: (fakerArgs?.[0] as { max?: number })?.max || 10000,
          precision: 0.01,
          type: 'decimal',
        },
      }),

      'date.past': () => ({
        type: 'range',
        config: {
          min: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000 * 3).toISOString(),
          max: new Date().toISOString(),
          type: 'date',
        },
      }),

      'date.recent': () => ({
        type: 'range',
        config: {
          min: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          max: new Date().toISOString(),
          type: 'date',
        },
      }),

      'date.future': () => ({
        type: 'range',
        config: {
          min: new Date().toISOString(),
          max: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          type: 'date',
        },
      }),
    };

    const mapping = fakerMappings[fakerMethod];
    if (mapping) {
      return mapping();
    }

    // For unmapped faker methods, use AI generation with hint
    return {
      type: 'ai',
      config: {
        hint: `Generate data similar to faker.${fakerMethod}`,
        args: fakerArgs,
      },
    };
  }

  /**
   * Build constraints for a field
   */
  static buildConstraints(
    field: FieldSchema,
    hints?: Record<string, unknown>
  ): FabricateColumnConstraint[] {
    const constraints: FabricateColumnConstraint[] = [];

    // Check for distribution hints (enum constraint)
    if (hints) {
      const distribution = (hints as Record<string, Record<string, number>>)[
        `${field.name}Distribution`
      ];
      if (distribution) {
        constraints.push({
          type: 'enum',
          value: Object.keys(distribution),
        });
      }
    }

    // Handle array element arguments (enum)
    if (field.faker === 'helpers.arrayElement' && field.fakerArgs?.[0]) {
      constraints.push({
        type: 'enum',
        value: field.fakerArgs[0] as string[],
      });
    }

    return constraints;
  }

  /**
   * Extract relationships from entity foreign keys
   */
  static extractRelationships(
    entityName: string,
    entitySchema: EntitySchema
  ): FabricateRelationshipConfig[] {
    const relationships: FabricateRelationshipConfig[] = [];

    for (const field of entitySchema.fields) {
      if (field.foreignKey) {
        relationships.push({
          name: `${entitySchema.table}_${field.name}_fk`,
          fromTable: entitySchema.table,
          fromColumn: field.name,
          toTable: field.foreignKey.table,
          toColumn: field.foreignKey.column,
          type: 'many-to-many', // Default, could be inferred from schema
        });
      }
    }

    return relationships;
  }

  /**
   * Build context configuration from generation metadata
   */
  static buildContext(metadata: GenerationMetadata): FabricateContextConfig {
    return {
      industry: metadata.industry,
      companySize: metadata.companySize,
      region: metadata.region,
      vertical: metadata.vertical,
      locale: ConnectorToFabricateConverter.regionToLocale(metadata.region),
      customInstructions: metadata.customContext,
    };
  }

  /**
   * Map region to locale
   */
  static regionToLocale(region?: string): string {
    if (!region) return 'en_US';

    const localeMap: Record<string, string> = {
      US: 'en_US',
      UK: 'en_GB',
      GB: 'en_GB',
      DE: 'de_DE',
      FR: 'fr_FR',
      ES: 'es_ES',
      IT: 'it_IT',
      JP: 'ja_JP',
      CN: 'zh_CN',
      KR: 'ko_KR',
      BR: 'pt_BR',
      IN: 'en_IN',
      AU: 'en_AU',
      CA: 'en_CA',
      APAC: 'en_AU',
      EMEA: 'en_GB',
      LATAM: 'es_MX',
    };

    return localeMap[region.toUpperCase()] || 'en_US';
  }
}

/**
 * Utility function to convert and validate a schema for Fabricate
 */
export async function convertSchemaForFabricate(
  schema: ConnectorSchema,
  brief: GenerationBrief
): Promise<FabricateDatabaseConfig> {
  logger.info('Converting ConnectorSchema to Fabricate format', {
    connector: schema.connectorId,
    entityCount: Object.keys(schema.entities).length,
  });

  const config = ConnectorToFabricateConverter.convert(schema, brief);

  logger.debug('Fabricate config generated', {
    tableCount: config.tables.length,
    relationshipCount: config.relationships.length,
    totalColumns: config.tables.reduce((sum, t) => sum + t.columns.length, 0),
  });

  return config;
}

export default ConnectorToFabricateConverter;
