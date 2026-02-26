/**
 * Faker.js Generator
 *
 * Zero-cost fallback data generation engine using Faker.js.
 * Fast, local, no API calls required. Good for simple fields
 * and development/testing scenarios.
 */

import { faker } from '@faker-js/faker';
import logger from '../utils/logger';
import {
  DataGenerator,
  TableGenerationPlan,
  GenerationContext,
  GeneratedTableData,
  FieldGenerationPlan,
  FakerEngineConfig,
  FieldSchema,
} from '../types/dataGeneration';

export class FakerGenerator implements DataGenerator {
  name: 'faker' = 'faker';

  async isAvailable(): Promise<boolean> {
    // Faker.js is always available as it's a local library
    return true;
  }

  async generateTable(
    plan: TableGenerationPlan,
    context: GenerationContext
  ): Promise<GeneratedTableData> {
    const startTime = Date.now();

    logger.info('Generating table with Faker.js', {
      tableName: plan.tableName,
      rowCount: plan.rowCount,
      jobId: context.jobId,
    });

    // Set seed for reproducibility if provided
    const seed = this.getSeed(context);
    if (seed !== undefined) {
      faker.seed(seed);
    }

    // Set locale based on region
    this.setLocale(context.brief.metadata.region);

    const rows: Record<string, unknown>[] = [];

    // Generate rows
    for (let i = 0; i < plan.rowCount; i++) {
      const row = this.generateRow(plan, context, i);
      rows.push(row);
    }

    const endTime = Date.now();

    return {
      tableName: plan.tableName,
      entityName: plan.entityName,
      columns: plan.fields.map((f) => f.fieldName),
      rows,
      metadata: {
        generatedAt: new Date().toISOString(),
        generator: 'faker',
        rowCount: rows.length,
        generationTimeMs: endTime - startTime,
      },
    };
  }

  async generateField(
    fieldPlan: FieldGenerationPlan,
    rowCount: number,
    context: GenerationContext
  ): Promise<unknown[]> {
    logger.debug('Generating single field with Faker', {
      fieldName: fieldPlan.fieldName,
      rowCount,
    });

    const values: unknown[] = [];
    const uniqueValues = new Set<unknown>();

    for (let i = 0; i < rowCount; i++) {
      let value = this.generateFieldValue(fieldPlan, context, i);

      // Handle unique constraint
      if (fieldPlan.unique) {
        let attempts = 0;
        while (uniqueValues.has(value) && attempts < 100) {
          value = this.generateFieldValue(fieldPlan, context, i + attempts * 1000);
          attempts++;
        }
        uniqueValues.add(value);
      }

      values.push(value);
    }

    return values;
  }

  private generateRow(
    plan: TableGenerationPlan,
    context: GenerationContext,
    rowIndex: number
  ): Record<string, unknown> {
    const row: Record<string, unknown> = {};

    for (const field of plan.fields) {
      row[field.fieldName] = this.generateFieldValue(field, context, rowIndex);
    }

    return row;
  }

  private generateFieldValue(
    field: FieldGenerationPlan,
    context: GenerationContext,
    _rowIndex: number
  ): unknown {
    // Handle foreign keys - get value from referenced table
    if (field.foreignKey) {
      return this.generateForeignKeyValue(field, context);
    }

    // Handle primary keys
    if (field.primaryKey && field.fieldType === 'uuid') {
      return faker.string.uuid();
    }

    // Handle Faker engine config
    if (field.engineConfig.type === 'faker') {
      return this.executeFakerMethod(field.engineConfig);
    }

    // Handle static values
    if (field.engineConfig.type === 'static') {
      return field.engineConfig.value;
    }

    // Fallback to type-based generation
    return this.generateByType(field);
  }

  private generateForeignKeyValue(
    field: FieldGenerationPlan,
    context: GenerationContext
  ): unknown {
    if (!field.foreignKey) return null;

    const referencedTable = context.generatedTables.get(field.foreignKey.table);
    if (!referencedTable || referencedTable.rows.length === 0) {
      // If referenced table not yet generated, return a placeholder UUID
      logger.warn('Referenced table not found for FK', {
        field: field.fieldName,
        referencedTable: field.foreignKey.table,
      });
      return faker.string.uuid();
    }

    // Pick a random value from the referenced table
    const randomRow = faker.helpers.arrayElement(referencedTable.rows);
    return randomRow[field.foreignKey.column];
  }

  private executeFakerMethod(config: FakerEngineConfig): unknown {
    const { method, args = [], locale } = config;

    // Set locale temporarily if specified
    if (locale) {
      this.setLocale(locale);
    }

    try {
      // Parse the method path (e.g., "person.firstName" or "helpers.arrayElement")
      const parts = method.split('.');

      // Navigate to the faker method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let fn: any = faker;
      for (const part of parts) {
        fn = fn[part];
        if (fn === undefined) {
          throw new Error(`Invalid faker method: ${method}`);
        }
      }

      // Call the method with arguments
      if (typeof fn === 'function') {
        return fn(...args);
      }

      return fn;
    } catch (error) {
      logger.warn('Faker method execution failed', { method, args, error });
      return null;
    }
  }

  private generateByType(field: FieldGenerationPlan): unknown {
    const type = field.fieldType.toLowerCase();

    switch (type) {
      case 'uuid':
        return faker.string.uuid();

      case 'string':
      case 'text':
      case 'varchar':
        return this.generateStringByFieldName(field.fieldName);

      case 'integer':
      case 'int':
        return faker.number.int({ min: 1, max: 10000 });

      case 'number':
      case 'decimal':
      case 'float':
      case 'double':
        return parseFloat(faker.finance.amount({ min: 0, max: 10000, dec: 2 }));

      case 'boolean':
        return faker.datatype.boolean();

      case 'date':
        return faker.date.past().toISOString().split('T')[0];

      case 'datetime':
      case 'timestamp':
        return faker.date.past().toISOString();

      case 'json':
      case 'object':
        return {};

      case 'array':
        return [];

      default:
        return faker.lorem.word();
    }
  }

  /**
   * Generate contextually appropriate string based on field name
   */
  private generateStringByFieldName(fieldName: string): string {
    const name = fieldName.toLowerCase();

    // Person names
    if (name.includes('firstname') || name === 'first_name') {
      return faker.person.firstName();
    }
    if (name.includes('lastname') || name === 'last_name') {
      return faker.person.lastName();
    }
    if (name === 'name' || name.includes('fullname') || name === 'full_name') {
      return faker.person.fullName();
    }

    // Contact info
    if (name.includes('email')) {
      return faker.internet.email();
    }
    if (name.includes('phone') || name.includes('mobile') || name.includes('tel')) {
      return faker.phone.number();
    }

    // Address components
    if (name.includes('address') || name.includes('street')) {
      return faker.location.streetAddress();
    }
    if (name === 'city') {
      return faker.location.city();
    }
    if (name === 'state' || name === 'province') {
      return faker.location.state();
    }
    if (name.includes('zip') || name.includes('postal')) {
      return faker.location.zipCode();
    }
    if (name === 'country') {
      return faker.location.country();
    }
    if (name.includes('country_code') || name === 'countrycode') {
      return faker.location.countryCode();
    }

    // Company/Organization
    if (name.includes('company') || name.includes('organization') || name === 'org') {
      return faker.company.name();
    }
    if (name.includes('department') || name.includes('dept')) {
      return faker.commerce.department();
    }
    if (name.includes('industry')) {
      return faker.helpers.arrayElement([
        'Technology',
        'Healthcare',
        'Finance',
        'Retail',
        'Manufacturing',
        'Education',
        'Media',
        'Energy',
      ]);
    }

    // Products/Commerce
    if (name.includes('product') && name.includes('name')) {
      return faker.commerce.productName();
    }
    if (name.includes('sku')) {
      return faker.string.alphanumeric({ length: 10, casing: 'upper' });
    }
    if (name.includes('category')) {
      return faker.commerce.department();
    }
    if (name.includes('brand')) {
      return faker.company.name();
    }
    if (name.includes('description') || name.includes('desc')) {
      return faker.commerce.productDescription();
    }

    // Financial
    if (name.includes('currency')) {
      return faker.finance.currencyCode();
    }
    if (name.includes('account')) {
      return faker.finance.accountNumber();
    }

    // Identifiers
    if (name.includes('id') && !name.includes('uuid')) {
      return faker.string.alphanumeric({ length: 10, casing: 'upper' });
    }

    // Status fields
    if (name.includes('status')) {
      return faker.helpers.arrayElement(['ACTIVE', 'INACTIVE', 'PENDING', 'COMPLETED']);
    }

    // URLs
    if (name.includes('url') || name.includes('website') || name.includes('link')) {
      return faker.internet.url();
    }

    // Notes/Comments
    if (name.includes('note') || name.includes('comment') || name.includes('memo')) {
      return faker.lorem.sentence();
    }

    // Owner/User references
    if (name.includes('owner') || name.includes('created_by') || name.includes('user')) {
      return faker.person.fullName();
    }

    // Default: lorem word
    return faker.lorem.words(2);
  }

  private getSeed(_context: GenerationContext): number | undefined {
    // Could add seed to EntitySpec in future to enable repeatable generation
    return undefined;
  }

  private setLocale(region?: string): void {
    if (!region) return;

    // Map regions to Faker locales
    const localeMap: Record<string, string> = {
      US: 'en_US',
      UK: 'en_GB',
      GB: 'en_GB',
      DE: 'de',
      FR: 'fr',
      ES: 'es',
      IT: 'it',
      JP: 'ja',
      CN: 'zh_CN',
      KR: 'ko',
      BR: 'pt_BR',
      IN: 'en_IN',
      AU: 'en_AU',
      CA: 'en_CA',
      APAC: 'en_AU',
      EMEA: 'en_GB',
      LATAM: 'es',
    };

    const locale = localeMap[region.toUpperCase()];
    if (locale) {
      // Note: @faker-js/faker v8+ uses faker.setLocale() differently
      // For simplicity, we just use the default locale
      logger.debug('Locale setting requested', { region, locale });
    }
  }
}

/**
 * Helper class for building Faker configurations from ConnectorSchema
 */
export class FakerConfigBuilder {
  /**
   * Convert a FieldSchema (from ConnectorSchema) to a FieldGenerationPlan with Faker config
   */
  static fieldSchemaToFakerPlan(field: FieldSchema): FieldGenerationPlan {
    const plan: FieldGenerationPlan = {
      fieldName: field.name,
      fieldType: field.type,
      engine: 'faker',
      required: field.required,
      unique: field.unique || false,
      primaryKey: field.primaryKey || false,
      foreignKey: field.foreignKey,
      engineConfig: {
        type: 'faker',
        method: field.faker || FakerConfigBuilder.inferFakerMethod(field),
        args: field.fakerArgs,
      },
      postProcessing: [],
    };

    // Handle default values
    if (field.default !== undefined && !field.faker) {
      plan.engineConfig = {
        type: 'static',
        value: field.default,
      };
    }

    return plan;
  }

  /**
   * Infer the best Faker method based on field name and type
   */
  static inferFakerMethod(field: FieldSchema): string {
    const name = field.name.toLowerCase();
    const type = field.type.toLowerCase();

    // UUID types
    if (type === 'uuid' || name.includes('uuid')) {
      return 'string.uuid';
    }

    // Boolean types
    if (type === 'boolean') {
      return 'datatype.boolean';
    }

    // Date/time types
    if (type === 'date' || type === 'datetime' || type === 'timestamp') {
      if (name.includes('created') || name.includes('start')) {
        return 'date.past';
      }
      if (name.includes('updated') || name.includes('modified') || name.includes('recent')) {
        return 'date.recent';
      }
      if (name.includes('future') || name.includes('due') || name.includes('expire')) {
        return 'date.future';
      }
      return 'date.past';
    }

    // Number types
    if (type === 'integer' || type === 'int') {
      if (name.includes('count') || name.includes('quantity') || name.includes('qty')) {
        return 'number.int';
      }
      if (name.includes('age')) {
        return 'number.int';
      }
      return 'number.int';
    }

    if (type === 'decimal' || type === 'float' || type === 'number' || type === 'double') {
      if (
        name.includes('amount') ||
        name.includes('price') ||
        name.includes('cost') ||
        name.includes('total') ||
        name.includes('revenue')
      ) {
        return 'finance.amount';
      }
      if (name.includes('percent') || name.includes('rate')) {
        return 'number.float';
      }
      return 'number.float';
    }

    // String types - use context from field name
    if (name.includes('email')) return 'internet.email';
    if (name.includes('phone') || name.includes('mobile')) return 'phone.number';
    if (name.includes('firstname') || name === 'first_name') return 'person.firstName';
    if (name.includes('lastname') || name === 'last_name') return 'person.lastName';
    if (name === 'name' && !name.includes('product')) return 'person.fullName';
    if (name.includes('company') || name.includes('organization')) return 'company.name';
    if (name.includes('address') || name.includes('street')) return 'location.streetAddress';
    if (name === 'city') return 'location.city';
    if (name === 'state' || name === 'province') return 'location.state';
    if (name.includes('zip') || name.includes('postal')) return 'location.zipCode';
    if (name === 'country') return 'location.country';
    if (name.includes('url') || name.includes('website')) return 'internet.url';
    if (name.includes('description') || name.includes('desc')) return 'lorem.paragraph';
    if (name.includes('comment') || name.includes('note') || name.includes('memo'))
      return 'lorem.sentence';
    if (name.includes('product') && name.includes('name')) return 'commerce.productName';
    if (name.includes('category') || name.includes('department')) return 'commerce.department';
    if (name.includes('sku')) return 'string.alphanumeric';
    if (name.includes('currency')) return 'finance.currencyCode';

    // Default
    return 'lorem.words';
  }
}

// Export singleton instance
export const fakerGenerator = new FakerGenerator();
export default fakerGenerator;
