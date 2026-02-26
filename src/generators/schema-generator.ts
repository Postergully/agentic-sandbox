/**
 * Schema Generator
 *
 * Generates PostgreSQL migrations from ConnectorSchema.
 * Accepts output from any infer-schema parser (OpenAPI, LLM, JSON, Large Docs).
 *
 * @module generators/schema-generator
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ConnectorSchema,
  EntityDefinition,
  FieldDefinition,
  FieldType,
  topologicalSortEntities,
  validateSchema,
} from '../schema/connector-schema';
import { SchemaParseResult } from '../schema/parsers';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Type mapping from ConnectorSchema to PostgreSQL
 */
export interface TypeMapping {
  sqlType: string;
  defaultValue?: string;
  constraints?: string[];
}

/**
 * Options for schema generation
 */
export interface SchemaGeneratorOptions {
  /** Include DROP TABLE statements */
  includeDrop?: boolean;
  /** Include timestamp triggers */
  includeTimestamps?: boolean;
  /** Include indexes for foreign keys */
  includeFkIndexes?: boolean;
  /** Include created_at/updated_at columns */
  includeAuditColumns?: boolean;
  /** Schema name (e.g., 'public') */
  schemaName?: string;
  /** Use IF NOT EXISTS for table creation */
  ifNotExists?: boolean;
  /** Add comments to tables and columns */
  includeComments?: boolean;
}

/**
 * Result from schema generation
 */
export interface SchemaGeneratorResult {
  /** Generated SQL migration */
  sql: string;
  /** Table names created */
  tables: string[];
  /** Foreign key constraints */
  foreignKeys: { table: string; column: string; references: string }[];
  /** Indexes created */
  indexes: string[];
  /** Warnings during generation */
  warnings: string[];
}

// =============================================================================
// TYPE MAPPING
// =============================================================================

/**
 * Map ConnectorSchema field types to PostgreSQL types
 */
export function mapTypeToSQL(field: FieldDefinition): TypeMapping {
  const baseMapping: Record<FieldType, TypeMapping> = {
    string: { sqlType: 'VARCHAR(255)' },
    number: { sqlType: 'NUMERIC' },
    boolean: { sqlType: 'BOOLEAN', defaultValue: 'FALSE' },
    date: { sqlType: 'DATE' },
    datetime: { sqlType: 'TIMESTAMP WITH TIME ZONE' },
    json: { sqlType: 'JSONB' },
    uuid: { sqlType: 'UUID' },
  };

  const mapping = { ...baseMapping[field.type] };

  // Handle string length hints from field name
  if (field.type === 'string') {
    const name = field.name.toLowerCase();

    // Long text fields
    if (
      name.includes('description') ||
      name.includes('comment') ||
      name.includes('notes') ||
      name.includes('memo') ||
      name.includes('message') ||
      name.includes('body') ||
      name.includes('content')
    ) {
      mapping.sqlType = 'TEXT';
    }

    // Email fields
    if (name.includes('email')) {
      mapping.sqlType = 'VARCHAR(320)';
    }

    // URL fields
    if (name.includes('url') || name.includes('link') || name.includes('href')) {
      mapping.sqlType = 'VARCHAR(2048)';
    }

    // Phone fields
    if (name.includes('phone') || name.includes('fax') || name.includes('mobile')) {
      mapping.sqlType = 'VARCHAR(50)';
    }

    // Code/identifier fields
    if (
      name.includes('code') ||
      name.includes('number') ||
      name.includes('sku') ||
      name.endsWith('id')
    ) {
      mapping.sqlType = 'VARCHAR(100)';
    }
  }

  // Handle number precision hints
  if (field.type === 'number') {
    const name = field.name.toLowerCase();

    // Currency/price fields
    if (
      name.includes('price') ||
      name.includes('cost') ||
      name.includes('amount') ||
      name.includes('total') ||
      name.includes('rate') ||
      name.includes('tax') ||
      name.includes('balance')
    ) {
      mapping.sqlType = 'NUMERIC(18, 2)';
    }

    // Quantity fields
    if (
      name.includes('quantity') ||
      name.includes('qty') ||
      name.includes('count')
    ) {
      mapping.sqlType = 'NUMERIC(18, 4)';
    }

    // Percentage fields
    if (name.includes('percent') || name.includes('ratio')) {
      mapping.sqlType = 'NUMERIC(5, 2)';
    }

    // Integer-like fields
    if (
      name.includes('sequence') ||
      name.includes('order') ||
      name.includes('line') ||
      name.includes('position')
    ) {
      mapping.sqlType = 'INTEGER';
    }
  }

  // Add constraints
  mapping.constraints = [];

  if (field.unique) {
    mapping.constraints.push('UNIQUE');
  }

  // Handle enum as CHECK constraint
  if (field.enum && field.enum.length > 0) {
    const enumValues = field.enum.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');
    mapping.constraints.push(`CHECK (${toSnakeCase(field.name)} IN (${enumValues}))`);
  }

  return mapping;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert camelCase to snake_case
 */
function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

/**
 * Escape SQL identifier
 */
function escapeIdentifier(name: string): string {
  // PostgreSQL reserved words that need quoting
  const reserved = [
    'user', 'order', 'group', 'table', 'index', 'column', 'select', 'from',
    'where', 'and', 'or', 'not', 'null', 'true', 'false', 'primary', 'key',
    'foreign', 'references', 'check', 'unique', 'default', 'constraint',
    'create', 'drop', 'alter', 'insert', 'update', 'delete', 'grant',
    'all', 'any', 'as', 'between', 'by', 'case', 'current', 'desc', 'distinct',
    'end', 'exists', 'for', 'full', 'having', 'in', 'inner', 'into', 'is',
    'join', 'left', 'like', 'limit', 'natural', 'new', 'offset', 'on', 'outer',
    'right', 'row', 'rows', 'set', 'some', 'then', 'to', 'union', 'using',
    'when', 'with', 'class', 'type', 'date', 'time', 'timestamp',
  ];

  const snakeName = toSnakeCase(name);

  if (reserved.includes(snakeName.toLowerCase())) {
    return `"${snakeName}"`;
  }

  return snakeName;
}

/**
 * Generate column definition SQL
 */
function generateColumnDef(
  field: FieldDefinition,
  _options: SchemaGeneratorOptions
): string {
  const colName = escapeIdentifier(field.name);
  const mapping = mapTypeToSQL(field);

  const parts = [colName, mapping.sqlType];

  // Add NOT NULL constraint
  if (field.required) {
    parts.push('NOT NULL');
  }

  // Add UNIQUE constraint (inline for simple cases)
  if (field.unique && (!mapping.constraints || !mapping.constraints.includes('UNIQUE'))) {
    parts.push('UNIQUE');
  }

  // Add default value
  if (field.default !== undefined) {
    const defaultVal =
      typeof field.default === 'string'
        ? `'${field.default.replace(/'/g, "''")}'`
        : String(field.default);
    parts.push(`DEFAULT ${defaultVal}`);
  } else if (mapping.defaultValue && !field.required) {
    parts.push(`DEFAULT ${mapping.defaultValue}`);
  }

  return parts.join(' ');
}

/**
 * Generate table comment
 */
function generateTableComment(
  tableName: string,
  entityName: string
): string {
  return `COMMENT ON TABLE ${tableName} IS '${entityName} entity - auto-generated from ConnectorSchema';`;
}

// =============================================================================
// MAIN GENERATOR CLASS
// =============================================================================

export class SchemaGenerator {
  private options: Required<SchemaGeneratorOptions>;

  constructor(options: SchemaGeneratorOptions = {}) {
    this.options = {
      includeDrop: options.includeDrop ?? false,
      includeTimestamps: options.includeTimestamps ?? true,
      includeFkIndexes: options.includeFkIndexes ?? true,
      includeAuditColumns: options.includeAuditColumns ?? true,
      schemaName: options.schemaName ?? 'public',
      ifNotExists: options.ifNotExists ?? true,
      includeComments: options.includeComments ?? true,
    };
  }

  /**
   * Generate SQL migration from ConnectorSchema
   */
  generate(schema: ConnectorSchema): SchemaGeneratorResult {
    const warnings: string[] = [];
    const tables: string[] = [];
    const foreignKeys: { table: string; column: string; references: string }[] = [];
    const indexes: string[] = [];
    const sqlParts: string[] = [];

    // Header comment
    sqlParts.push(this.generateHeader(schema));

    // Sort entities by dependencies (topological sort)
    let sortedEntityNames: string[];
    try {
      sortedEntityNames = topologicalSortEntities(schema);
    } catch (error) {
      warnings.push(`Dependency sort warning: ${error}`);
      sortedEntityNames = schema.entities.map(e => e.name);
    }

    // Generate DROP statements if requested
    if (this.options.includeDrop) {
      sqlParts.push(this.generateDropStatements(schema, sortedEntityNames));
    }

    // Generate CREATE TABLE statements
    for (const entityName of sortedEntityNames) {
      const entity = schema.entities.find(
        e => e.name.toLowerCase() === entityName.toLowerCase()
      );
      if (!entity) continue;

      const { sql, fks, idxs, warns } = this.generateTable(entity, schema);
      sqlParts.push(sql);
      tables.push(entity.tableName);
      foreignKeys.push(...fks);
      indexes.push(...idxs);
      warnings.push(...warns);
    }

    // Generate foreign key constraints (deferred)
    const fkSql = this.generateForeignKeyConstraints(schema, foreignKeys);
    if (fkSql) {
      sqlParts.push(fkSql);
    }

    // Generate indexes
    if (this.options.includeFkIndexes) {
      const idxSql = this.generateIndexes(foreignKeys);
      if (idxSql) {
        sqlParts.push(idxSql);
        indexes.push(...foreignKeys.map(fk => `idx_${fk.table}_${fk.column}`));
      }
    }

    // Generate timestamp trigger function
    if (this.options.includeTimestamps && this.options.includeAuditColumns) {
      sqlParts.push(this.generateTimestampTrigger());
      sqlParts.push(this.generateTimestampTriggers(tables));
    }

    // Generate comments
    if (this.options.includeComments) {
      sqlParts.push(this.generateComments(schema));
    }

    return {
      sql: sqlParts.join('\n\n'),
      tables,
      foreignKeys,
      indexes,
      warnings,
    };
  }

  /**
   * Generate from SchemaParseResult (output of any infer-schema parser)
   */
  generateFromParseResult(result: SchemaParseResult): SchemaGeneratorResult {
    return this.generate(result.schema);
  }

  /**
   * Generate and save to file
   */
  generateAndSave(
    schema: ConnectorSchema,
    outputPath: string
  ): SchemaGeneratorResult {
    const result = this.generate(schema);

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, result.sql, 'utf8');
    return result;
  }

  // =============================================================================
  // PRIVATE GENERATION METHODS
  // =============================================================================

  private generateHeader(schema: ConnectorSchema): string {
    const lines = [
      '-- =============================================================================',
      `-- ${schema.name.toUpperCase()} SCHEMA MIGRATION`,
      '-- =============================================================================',
      `-- Generated from ConnectorSchema v${schema.version}`,
      `-- Generated at: ${new Date().toISOString()}`,
      '-- ',
      '-- This file was auto-generated by schema-generator.ts',
      '-- Do not edit manually unless you know what you are doing.',
      '-- =============================================================================',
      '',
      '-- Enable UUID extension if not already enabled',
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
    ];
    return lines.join('\n');
  }

  private generateDropStatements(
    schema: ConnectorSchema,
    sortedEntityNames: string[]
  ): string {
    const lines = [
      '-- =============================================================================',
      '-- DROP EXISTING TABLES (in reverse dependency order)',
      '-- =============================================================================',
    ];

    // Drop in reverse order to handle dependencies
    const reversed = [...sortedEntityNames].reverse();
    for (const entityName of reversed) {
      const entity = schema.entities.find(
        e => e.name.toLowerCase() === entityName.toLowerCase()
      );
      if (entity) {
        lines.push(`DROP TABLE IF EXISTS ${entity.tableName} CASCADE;`);
      }
    }

    return lines.join('\n');
  }

  private generateTable(
    entity: EntityDefinition,
    schema: ConnectorSchema
  ): {
    sql: string;
    fks: { table: string; column: string; references: string }[];
    idxs: string[];
    warns: string[];
  } {
    const warnings: string[] = [];
    const foreignKeys: { table: string; column: string; references: string }[] = [];
    const lines: string[] = [];

    lines.push('-- -----------------------------------------------------------------------------');
    lines.push(`-- Table: ${entity.tableName}`);
    lines.push('-- -----------------------------------------------------------------------------');

    const ifNotExists = this.options.ifNotExists ? 'IF NOT EXISTS ' : '';
    lines.push(`CREATE TABLE ${ifNotExists}${entity.tableName} (`);

    const columnDefs: string[] = [];

    // Generate columns
    for (const field of entity.fields) {
      // Handle primary key specially
      if (field.name === 'id' && field.type === 'uuid') {
        columnDefs.push(
          `  ${escapeIdentifier(field.name)} UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
        );
        continue;
      }

      // Track foreign keys for deferred constraints
      if (field.foreignKey) {
        const refEntity = schema.entities.find(
          e => e.name.toLowerCase() === field.foreignKey!.entity.toLowerCase()
        );
        if (refEntity) {
          foreignKeys.push({
            table: entity.tableName,
            column: toSnakeCase(field.name),
            references: `${refEntity.tableName}(${escapeIdentifier(field.foreignKey.field)})`,
          });
        } else {
          warnings.push(
            `Foreign key reference to non-existent entity: ${field.foreignKey.entity}`
          );
        }
      }

      columnDefs.push(`  ${generateColumnDef(field, this.options)}`);
    }

    // Add audit columns
    if (this.options.includeAuditColumns) {
      columnDefs.push('  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP');
      columnDefs.push('  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP');
    }

    lines.push(columnDefs.join(',\n'));
    lines.push(');');

    // Generate CHECK constraints from enums
    for (const field of entity.fields) {
      if (field.enum && field.enum.length > 0) {
        const colName = escapeIdentifier(field.name);
        const enumValues = field.enum.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');
        lines.push('');
        lines.push(
          `ALTER TABLE ${entity.tableName} ADD CONSTRAINT chk_${entity.tableName}_${toSnakeCase(field.name)} CHECK (${colName} IN (${enumValues}));`
        );
      }
    }

    return {
      sql: lines.join('\n'),
      fks: foreignKeys,
      idxs: [],
      warns: warnings,
    };
  }

  private generateForeignKeyConstraints(
    _schema: ConnectorSchema,
    foreignKeys: { table: string; column: string; references: string }[]
  ): string {
    if (foreignKeys.length === 0) return '';

    const lines = [
      '-- =============================================================================',
      '-- FOREIGN KEY CONSTRAINTS',
      '-- =============================================================================',
    ];

    for (const fk of foreignKeys) {
      const constraintName = `fk_${fk.table}_${fk.column}`;
      lines.push(
        `ALTER TABLE ${fk.table} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${escapeIdentifier(fk.column)}) REFERENCES ${fk.references} ON DELETE SET NULL;`
      );
    }

    return lines.join('\n');
  }

  private generateIndexes(
    foreignKeys: { table: string; column: string; references: string }[]
  ): string {
    if (foreignKeys.length === 0) return '';

    const lines = [
      '-- =============================================================================',
      '-- INDEXES',
      '-- =============================================================================',
    ];

    for (const fk of foreignKeys) {
      const indexName = `idx_${fk.table}_${fk.column}`;
      lines.push(
        `CREATE INDEX IF NOT EXISTS ${indexName} ON ${fk.table} (${escapeIdentifier(fk.column)});`
      );
    }

    return lines.join('\n');
  }

  private generateTimestampTrigger(): string {
    return `-- =============================================================================
-- TIMESTAMP TRIGGER FUNCTION
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';`;
  }

  private generateTimestampTriggers(tables: string[]): string {
    const lines = [
      '-- =============================================================================',
      '-- TIMESTAMP TRIGGERS',
      '-- =============================================================================',
    ];

    for (const table of tables) {
      const triggerName = `trg_${table}_updated_at`;
      lines.push(`DROP TRIGGER IF EXISTS ${triggerName} ON ${table};`);
      lines.push(
        `CREATE TRIGGER ${triggerName} BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`
      );
    }

    return lines.join('\n');
  }

  private generateComments(schema: ConnectorSchema): string {
    const lines = [
      '-- =============================================================================',
      '-- TABLE COMMENTS',
      '-- =============================================================================',
    ];

    for (const entity of schema.entities) {
      lines.push(generateTableComment(entity.tableName, entity.name));
    }

    return lines.join('\n');
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Generate SQL migration from ConnectorSchema (convenience function)
 */
export function generateMigration(
  schema: ConnectorSchema,
  options?: SchemaGeneratorOptions
): string {
  const generator = new SchemaGenerator(options);
  return generator.generate(schema).sql;
}

/**
 * Generate SQL migration from SchemaParseResult
 */
export function generateMigrationFromParseResult(
  result: SchemaParseResult,
  options?: SchemaGeneratorOptions
): string {
  const generator = new SchemaGenerator(options);
  return generator.generateFromParseResult(result).sql;
}

/**
 * Generate and save migration to file
 */
export function generateAndSaveMigration(
  schema: ConnectorSchema,
  outputPath: string,
  options?: SchemaGeneratorOptions
): SchemaGeneratorResult {
  const generator = new SchemaGenerator(options);
  return generator.generateAndSave(schema, outputPath);
}

/**
 * Load schema from file and generate migration
 */
export function generateMigrationFromFile(
  schemaPath: string,
  outputPath?: string,
  options?: SchemaGeneratorOptions
): SchemaGeneratorResult {
  const content = fs.readFileSync(schemaPath, 'utf8');
  const schema = validateSchema(JSON.parse(content));

  const generator = new SchemaGenerator(options);

  if (outputPath) {
    return generator.generateAndSave(schema, outputPath);
  }

  return generator.generate(schema);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default SchemaGenerator;
