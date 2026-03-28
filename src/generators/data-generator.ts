/**
 * Data Generator
 *
 * Generates synthetic data from ConnectorSchema using Faker.js.
 * Handles foreign key dependencies through topological sorting.
 *
 * @module generators/data-generator
 */

import * as fs from 'fs';
import * as path from 'path';
import { faker } from '@faker-js/faker';
import {
  ConnectorSchema,
  EntityDefinition,
  FieldDefinition,
  topologicalSortEntities,
  validateSchema,
} from '../schema/connector-schema';
import { SchemaParseResult } from '../schema/parsers';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Options for data generation
 */
export interface DataGeneratorOptions {
  /** Default number of records per entity */
  defaultCount?: number;
  /** Per-entity record counts */
  entityCounts?: Record<string, number>;
  /** Seed for reproducible data */
  seed?: number;
  /** Locale for faker */
  locale?: string;
  /** Generate SQL INSERT statements */
  outputFormat?: 'json' | 'sql' | 'seed-script';
  /** Include timestamps in generated data */
  includeTimestamps?: boolean;
}

/**
 * Generated data for a single entity
 */
export interface EntityData {
  entityName: string;
  tableName: string;
  records: Record<string, unknown>[];
}

/**
 * Result from data generation
 */
export interface DataGeneratorResult {
  /** Generated data by entity */
  data: EntityData[];
  /** Total records generated */
  totalRecords: number;
  /** Entity generation order (topological) */
  generationOrder: string[];
  /** ID mappings for FK relationships */
  idMappings: Record<string, string[]>;
  /** Warnings during generation */
  warnings: string[];
}

// =============================================================================
// FAKER MAPPING
// =============================================================================

/**
 * Map faker hint strings to faker functions
 */
function resolveFakerMethod(fakerHint: string): () => unknown {
  const [category, method] = fakerHint.split('.');

  // Handle common faker categories
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fakerAny = faker as any;

  if (category && method && fakerAny[category] && typeof fakerAny[category][method] === 'function') {
    return () => fakerAny[category][method]();
  }

  // Fallback mappings for common patterns
  const fallbackMappings: Record<string, () => unknown> = {
    'string.uuid': () => faker.string.uuid(),
    'company.name': () => faker.company.name(),
    'person.firstName': () => faker.person.firstName(),
    'person.lastName': () => faker.person.lastName(),
    'person.fullName': () => faker.person.fullName(),
    'internet.email': () => faker.internet.email(),
    'internet.url': () => faker.internet.url(),
    'phone.number': () => faker.phone.number(),
    'location.streetAddress': () => faker.location.streetAddress(),
    'location.city': () => faker.location.city(),
    'location.state': () => faker.location.state(),
    'location.zipCode': () => faker.location.zipCode(),
    'location.country': () => faker.location.country(),
    'finance.amount': () => faker.finance.amount(),
    'finance.accountNumber': () => faker.finance.accountNumber(),
    'finance.currencyCode': () => faker.finance.currencyCode(),
    'date.past': () => faker.date.past(),
    'date.future': () => faker.date.future(),
    'date.recent': () => faker.date.recent(),
    'number.int': () => faker.number.int({ min: 1, max: 10000 }),
    'number.float': () => faker.number.float({ min: 0, max: 10000, fractionDigits: 2 }),
    'lorem.sentence': () => faker.lorem.sentence(),
    'lorem.paragraph': () => faker.lorem.paragraph(),
    'lorem.words': () => faker.lorem.words(3),
    'datatype.boolean': () => faker.datatype.boolean(),
    'helpers.arrayElement': () => faker.helpers.arrayElement(['A', 'B', 'C']),
  };

  return fallbackMappings[fakerHint] || (() => faker.lorem.word());
}

/**
 * Generate value for a field based on its type and hints
 */
function generateFieldValue(
  field: FieldDefinition,
  idMappings: Record<string, string[]>
): unknown {
  // Handle foreign key references
  if (field.foreignKey) {
    const refEntityKey = field.foreignKey.entity.toLowerCase();
    const availableIds = idMappings[refEntityKey];

    if (availableIds && availableIds.length > 0) {
      return faker.helpers.arrayElement(availableIds);
    }

    // Return null if referenced entity has no records yet
    return null;
  }

  // Handle enum fields
  if (field.enum && field.enum.length > 0) {
    return faker.helpers.arrayElement(field.enum);
  }

  // Handle faker hint
  if (field.faker) {
    const fakerFn = resolveFakerMethod(field.faker);
    return fakerFn();
  }

  // Generate based on field type and name hints
  return generateByTypeAndName(field);
}

/**
 * Generate value based on field type and name patterns
 */
function generateByTypeAndName(field: FieldDefinition): unknown {
  const name = field.name.toLowerCase();

  switch (field.type) {
    case 'uuid':
      return faker.string.uuid();

    case 'string':
      // Name patterns
      if (name.includes('email')) return faker.internet.email();
      if (name.includes('phone') || name.includes('fax')) return faker.phone.number();
      if (name.includes('url') || name.includes('link')) return faker.internet.url();
      if (name.includes('address')) return faker.location.streetAddress();
      if (name.includes('city')) return faker.location.city();
      if (name.includes('state')) return faker.location.state();
      if (name.includes('zip') || name.includes('postal')) return faker.location.zipCode();
      if (name.includes('country')) return faker.location.country();
      if (name.includes('company') || name.includes('entity')) return faker.company.name();
      if (name.includes('firstname') || name === 'first_name') return faker.person.firstName();
      if (name.includes('lastname') || name === 'last_name') return faker.person.lastName();
      if (name.includes('name')) return faker.person.fullName();
      if (name.includes('description') || name.includes('memo') || name.includes('note')) {
        return faker.lorem.paragraph();
      }
      if (name.includes('code') || name.includes('number') || name.includes('id')) {
        return faker.string.alphanumeric(10).toUpperCase();
      }
      if (name.includes('status')) {
        return faker.helpers.arrayElement(['active', 'inactive', 'pending', 'completed']);
      }
      if (name.includes('type')) {
        return faker.helpers.arrayElement(['standard', 'premium', 'basic', 'custom']);
      }
      return faker.lorem.words(2);

    case 'number':
      if (name.includes('price') || name.includes('cost') || name.includes('amount') || name.includes('total')) {
        return parseFloat(faker.finance.amount({ min: 10, max: 10000 }));
      }
      if (name.includes('quantity') || name.includes('qty') || name.includes('count')) {
        return faker.number.int({ min: 1, max: 100 });
      }
      if (name.includes('percent') || name.includes('rate')) {
        return faker.number.float({ min: 0, max: 100, fractionDigits: 2 });
      }
      if (name.includes('sequence') || name.includes('order') || name.includes('line')) {
        return faker.number.int({ min: 1, max: 999 });
      }
      return faker.number.int({ min: 1, max: 1000 });

    case 'boolean':
      return faker.datatype.boolean();

    case 'date':
      return faker.date.past().toISOString().split('T')[0];

    case 'datetime':
      return faker.date.past().toISOString();

    case 'json':
      // Generate simple JSON objects based on name hints
      if (name.includes('list') || name.includes('items')) {
        return [];
      }
      if (name.includes('config') || name.includes('settings')) {
        return { enabled: true, options: {} };
      }
      if (name.includes('address')) {
        return {
          street: faker.location.streetAddress(),
          city: faker.location.city(),
          state: faker.location.state(),
          zip: faker.location.zipCode(),
        };
      }
      return {};

    default:
      return null;
  }
}

// =============================================================================
// MAIN GENERATOR CLASS
// =============================================================================

export class DataGenerator {
  private options: Required<DataGeneratorOptions>;

  constructor(options: DataGeneratorOptions = {}) {
    this.options = {
      defaultCount: options.defaultCount ?? 10,
      entityCounts: options.entityCounts ?? {},
      seed: options.seed ?? Math.floor(Math.random() * 1000000),
      locale: options.locale ?? 'en',
      outputFormat: options.outputFormat ?? 'json',
      includeTimestamps: options.includeTimestamps ?? true,
    };

    // Set faker seed for reproducibility
    faker.seed(this.options.seed);
  }

  /**
   * Generate synthetic data from ConnectorSchema
   */
  generate(schema: ConnectorSchema): DataGeneratorResult {
    const warnings: string[] = [];
    const data: EntityData[] = [];
    const idMappings: Record<string, string[]> = {};

    // Sort entities by dependencies
    let generationOrder: string[];
    try {
      generationOrder = topologicalSortEntities(schema);
    } catch (error) {
      warnings.push(`Dependency sort warning: ${error}`);
      generationOrder = schema.entities.map(e => e.name);
    }

    // Generate data for each entity in dependency order
    for (const entityName of generationOrder) {
      const entity = schema.entities.find(
        e => e.name.toLowerCase() === entityName.toLowerCase()
      );
      if (!entity) continue;

      const count = this.options.entityCounts[entity.name] ?? this.options.defaultCount;
      const records: Record<string, unknown>[] = [];
      const entityIds: string[] = [];

      for (let i = 0; i < count; i++) {
        const record = this.generateRecord(entity, idMappings);
        records.push(record);

        // Track IDs for FK references
        if (record.id) {
          entityIds.push(record.id as string);
        }
      }

      // Store IDs for this entity
      idMappings[entity.name.toLowerCase()] = entityIds;

      data.push({
        entityName: entity.name,
        tableName: entity.tableName,
        records,
      });
    }

    const totalRecords = data.reduce((sum, d) => sum + d.records.length, 0);

    return {
      data,
      totalRecords,
      generationOrder,
      idMappings,
      warnings,
    };
  }

  /**
   * Generate a single record for an entity
   */
  private generateRecord(
    entity: EntityDefinition,
    idMappings: Record<string, string[]>
  ): Record<string, unknown> {
    const record: Record<string, unknown> = {};

    for (const field of entity.fields) {
      // Skip optional fields sometimes (30% chance)
      if (!field.required && Math.random() < 0.3) {
        continue;
      }

      record[field.name] = generateFieldValue(field, idMappings);
    }

    // Add timestamps if requested
    if (this.options.includeTimestamps) {
      const createdAt = faker.date.past();
      record.created_at = createdAt.toISOString();
      record.updated_at = faker.date.between({ from: createdAt, to: new Date() }).toISOString();
    }

    return record;
  }

  /**
   * Generate from SchemaParseResult
   */
  generateFromParseResult(result: SchemaParseResult): DataGeneratorResult {
    return this.generate(result.schema);
  }

  /**
   * Generate and output in specified format
   */
  generateAndFormat(schema: ConnectorSchema): string {
    const result = this.generate(schema);

    switch (this.options.outputFormat) {
      case 'sql':
        return this.formatAsSQL(result, schema);
      case 'seed-script':
        return this.formatAsSeedScript(result, schema);
      case 'json':
      default:
        return JSON.stringify(result.data, null, 2);
    }
  }

  /**
   * Format data as SQL INSERT statements
   */
  private formatAsSQL(result: DataGeneratorResult, schema: ConnectorSchema): string {
    const lines: string[] = [
      '-- =============================================================================',
      `-- ${schema.name.toUpperCase()} SEED DATA`,
      '-- =============================================================================',
      `-- Generated at: ${new Date().toISOString()}`,
      `-- Seed: ${this.options.seed}`,
      `-- Total records: ${result.totalRecords}`,
      '-- =============================================================================',
      '',
    ];

    for (const entityData of result.data) {
      if (entityData.records.length === 0) continue;

      lines.push(`-- ${entityData.entityName} (${entityData.records.length} records)`);

      for (const record of entityData.records) {
        const columns = Object.keys(record);
        const values = columns.map(col => this.formatSQLValue(record[col]));

        lines.push(
          `INSERT INTO ${entityData.tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`
        );
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format value for SQL
   */
  private formatSQLValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'object') {
      return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
    }
    // String - escape single quotes
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  /**
   * Format data as TypeScript seed script
   */
  private formatAsSeedScript(result: DataGeneratorResult, schema: ConnectorSchema): string {
    const lines: string[] = [
      `/**`,
      ` * ${schema.name} Seed Script`,
      ` *`,
      ` * Auto-generated seed data for ${schema.name} connector.`,
      ` * Run with: npx ts-node scripts/seed-${schema.name}.ts`,
      ` *`,
      ` * @generated ${new Date().toISOString()}`,
      ` * @seed ${this.options.seed}`,
      ` */`,
      ``,
      `import pool from '../src/config/database';`,
      ``,
      `async function seed() {`,
      `  console.log('Seeding ${schema.name} database...');`,
      `  const client = await pool.connect();`,
      ``,
      `  try {`,
      `    await client.query('BEGIN');`,
      ``,
    ];

    for (const entityData of result.data) {
      if (entityData.records.length === 0) continue;

      lines.push(`    // Seed ${entityData.entityName}`);
      lines.push(`    console.log('Inserting ${entityData.records.length} ${entityData.entityName} records...');`);

      for (const record of entityData.records) {
        const columns = Object.keys(record);
        const placeholders = columns.map((_, i) => `$${i + 1}`);
        const values = columns.map(col => {
          const val = record[col];
          if (val === null || val === undefined) return 'null';
          if (typeof val === 'object') return JSON.stringify(val);
          return JSON.stringify(val);
        });

        lines.push(`    await client.query(`);
        lines.push(`      'INSERT INTO ${entityData.tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})',`);
        lines.push(`      [${values.join(', ')}]`);
        lines.push(`    );`);
      }

      lines.push(``);
    }

    lines.push(`    await client.query('COMMIT');`);
    lines.push(`    console.log('Seeding complete! Total records: ${result.totalRecords}');`);
    lines.push(`  } catch (error) {`);
    lines.push(`    await client.query('ROLLBACK');`);
    lines.push(`    console.error('Seeding failed:', error);`);
    lines.push(`    throw error;`);
    lines.push(`  } finally {`);
    lines.push(`    client.release();`);
    lines.push(`  }`);
    lines.push(`}`);
    lines.push(``);
    lines.push(`seed()`);
    lines.push(`  .then(() => process.exit(0))`);
    lines.push(`  .catch(() => process.exit(1));`);

    return lines.join('\n');
  }

  /**
   * Generate and save to file
   */
  generateAndSave(schema: ConnectorSchema, outputPath: string): DataGeneratorResult {
    const result = this.generate(schema);
    const formatted = this.generateAndFormat(schema);

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, formatted, 'utf8');
    return result;
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Generate synthetic data from ConnectorSchema
 */
export function generateData(
  schema: ConnectorSchema,
  options?: DataGeneratorOptions
): DataGeneratorResult {
  const generator = new DataGenerator(options);
  return generator.generate(schema);
}

/**
 * Generate data from SchemaParseResult
 */
export function generateDataFromParseResult(
  result: SchemaParseResult,
  options?: DataGeneratorOptions
): DataGeneratorResult {
  const generator = new DataGenerator(options);
  return generator.generateFromParseResult(result);
}

/**
 * Generate and save data to file
 */
export function generateAndSaveData(
  schema: ConnectorSchema,
  outputPath: string,
  options?: DataGeneratorOptions
): DataGeneratorResult {
  const generator = new DataGenerator(options);
  return generator.generateAndSave(schema, outputPath);
}

/**
 * Load schema from file and generate data
 */
export function generateDataFromFile(
  schemaPath: string,
  outputPath?: string,
  options?: DataGeneratorOptions
): DataGeneratorResult {
  const content = fs.readFileSync(schemaPath, 'utf8');
  const schema = validateSchema(JSON.parse(content));

  const generator = new DataGenerator(options);

  if (outputPath) {
    return generator.generateAndSave(schema, outputPath);
  }

  return generator.generate(schema);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default DataGenerator;
