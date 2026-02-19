/**
 * Tests for Schema Quality Validator
 */

import { validateSchemaQuality, QualityReport } from '../../../src/schema/parsers/schema-quality-validator';
import { ConnectorSchema, EntityDefinition } from '../../../src/schema/connector-schema';

function makeEntity(name: string, fieldCount: number, endpointCount: number = 3): EntityDefinition {
  const fields = Array.from({ length: fieldCount }, (_, i) => ({
    name: i === 0 ? 'id' : `field${i}`,
    type: 'string' as const,
    required: i === 0,
  }));

  const endpoints = Array.from({ length: endpointCount }, (_, i) => ({
    method: 'GET' as const,
    path: `/${name.toLowerCase()}s${i > 0 ? '/:id' : ''}`,
    operation: (i === 0 ? 'list' : 'get') as 'list' | 'get',
  }));

  return {
    name,
    tableName: `test_${name.toLowerCase()}s`,
    fields,
    endpoints,
  };
}

function makeSchema(entities: EntityDefinition[]): ConnectorSchema {
  return {
    name: 'test_api',
    version: '1.0.0',
    baseUrl: '/api',
    auth: { type: 'apikey', fields: ['api_key'] },
    entities,
    relationships: [],
  };
}

describe('validateSchemaQuality', () => {
  it('should pass with a normal schema (10 entities, 5+ fields each)', () => {
    const entities = Array.from({ length: 10 }, (_, i) =>
      makeEntity(`Entity${i}`, 6)
    );
    const schema = makeSchema(entities);
    const report = validateSchemaQuality(schema);

    expect(report.isShallow).toBe(false);
    expect(report.score).toBeGreaterThanOrEqual(50);
    expect(report.warnings).toHaveLength(0);
  });

  it('should flag when all entity names match /^V\\d/', () => {
    const entities = [
      makeEntity('V1', 5),
      makeEntity('V2', 5),
      makeEntity('V3', 5),
    ];
    const schema = makeSchema(entities);
    const report = validateSchemaQuality(schema);

    expect(report.warnings.some((w) => w.includes('version prefix'))).toBe(true);
  });

  it('should flag when any entity has <3 fields', () => {
    const entities = [
      makeEntity('Customer', 6),
      makeEntity('Order', 2), // shallow
      makeEntity('Product', 6),
    ];
    const schema = makeSchema(entities);
    const report = validateSchemaQuality(schema);

    expect(report.warnings.some((w) => w.includes('Order') && w.includes('field'))).toBe(true);
  });

  it('should flag when endpoint:entity ratio > 10:1', () => {
    // 2 entities with 25 endpoints each = 50 endpoints / 2 entities = 25:1
    const entities = [
      makeEntity('Customer', 5, 25),
      makeEntity('Order', 5, 25),
    ];
    const schema = makeSchema(entities);
    const report = validateSchemaQuality(schema);

    expect(report.warnings.some((w) => w.includes('endpoint') && w.includes('ratio'))).toBe(true);
  });

  it('should set isShallow=true when score < 50', () => {
    // 2 entities, 1 field each, version-like names
    const entities = [
      makeEntity('V1', 1),
      makeEntity('V2', 1),
    ];
    const schema = makeSchema(entities);
    const report = validateSchemaQuality(schema);

    expect(report.isShallow).toBe(true);
    expect(report.score).toBeLessThan(50);
  });

  it('should not flag a schema with sufficient entities and fields', () => {
    const entities = [
      makeEntity('Customer', 8),
      makeEntity('Order', 6),
      makeEntity('Product', 5),
      makeEntity('Invoice', 7),
      makeEntity('Payment', 5),
    ];
    const schema = makeSchema(entities);
    const report = validateSchemaQuality(schema);

    expect(report.isShallow).toBe(false);
    expect(report.warnings).toHaveLength(0);
  });

  it('should flag schema with very few entities', () => {
    const entities = [makeEntity('Item', 5)];
    const schema = makeSchema(entities);
    const report = validateSchemaQuality(schema);

    expect(report.warnings.some((w) => w.includes('entit'))).toBe(true);
  });

  it('should return details with entity count, avg fields, and endpoint ratio', () => {
    const entities = [
      makeEntity('Customer', 4, 3),
      makeEntity('Order', 6, 5),
    ];
    const schema = makeSchema(entities);
    const report = validateSchemaQuality(schema);

    expect(report.details.entityCount).toBe(2);
    expect(report.details.avgFieldCount).toBe(5); // (4+6)/2
    expect(report.details.endpointEntityRatio).toBe(4); // (3+5)/2
  });
});
