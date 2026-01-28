/**
 * Unit tests for ConnectorSchema validation and helper functions
 */

import {
  validateSchema,
  parseSchemaFromJSON,
  getEntityByName,
  getRelationshipsForEntity,
  getOutgoingRelationships,
  getIncomingRelationships,
  getForeignKeyFields,
  getRequiredFields,
  getFakerFields,
  getLLMGeneratedFields,
  getEndpointByOperation,
  topologicalSortEntities,
  validateForeignKeyReferences,
  isConnectorSchema,
  isEntityDefinition,
  SchemaValidationError,
  ConnectorSchema,
  EntityDefinition,
} from '../../../src/schema/connector-schema';

// =============================================================================
// TEST DATA
// =============================================================================

const validSchema: ConnectorSchema = {
  name: 'test-connector',
  version: '1.0.0',
  baseUrl: '/api/test',
  auth: {
    type: 'oauth2',
    fields: ['clientId', 'clientSecret'],
    config: {
      tokenEndpoint: '/oauth/token',
    },
  },
  entities: [
    {
      name: 'Customer',
      tableName: 'test_customers',
      endpoints: [
        { method: 'GET', path: '/customers', operation: 'list' },
        { method: 'GET', path: '/customers/:id', operation: 'get' },
        { method: 'POST', path: '/customers', operation: 'create' },
        { method: 'PATCH', path: '/customers/:id', operation: 'update' },
        { method: 'DELETE', path: '/customers/:id', operation: 'delete' },
      ],
      fields: [
        { name: 'id', type: 'uuid', required: true, unique: true },
        { name: 'companyName', type: 'string', required: true, faker: 'company.name' },
        { name: 'email', type: 'string', required: false, faker: 'internet.email' },
        { name: 'status', type: 'string', required: true, enum: ['ACTIVE', 'INACTIVE'] },
        { name: 'description', type: 'string', required: false, llmGenerate: 'Generate a business description' },
      ],
    },
    {
      name: 'Invoice',
      tableName: 'test_invoices',
      endpoints: [
        { method: 'GET', path: '/invoices', operation: 'list' },
        { method: 'GET', path: '/invoices/:id', operation: 'get' },
        { method: 'POST', path: '/invoices', operation: 'create' },
      ],
      fields: [
        { name: 'id', type: 'uuid', required: true, unique: true },
        { name: 'customerId', type: 'uuid', required: true, foreignKey: { entity: 'Customer', field: 'id' } },
        { name: 'amount', type: 'number', required: true },
        { name: 'dueDate', type: 'date', required: true, faker: 'date.future' },
      ],
    },
  ],
  relationships: [
    {
      from: 'Invoice',
      to: 'Customer',
      type: 'one-to-many',
      foreignKey: 'customerId',
    },
  ],
};

const validSchemaJSON = JSON.stringify(validSchema);

// =============================================================================
// VALIDATION TESTS
// =============================================================================

describe('ConnectorSchema Validation', () => {
  describe('validateSchema', () => {
    it('should validate a correct schema', () => {
      const result = validateSchema(validSchema);
      expect(result).toEqual(validSchema);
    });

    it('should throw SchemaValidationError for invalid schema', () => {
      const invalidSchema = { name: '' };
      expect(() => validateSchema(invalidSchema)).toThrow(SchemaValidationError);
    });

    it('should throw SchemaValidationError for missing required fields', () => {
      const schemaWithoutVersion = { ...validSchema, version: undefined };
      expect(() => validateSchema(schemaWithoutVersion)).toThrow(SchemaValidationError);
    });

    it('should validate version format', () => {
      const invalidVersion = { ...validSchema, version: 'invalid' };
      expect(() => validateSchema(invalidVersion)).toThrow(SchemaValidationError);
    });

    it('should validate auth type', () => {
      const invalidAuth = { ...validSchema, auth: { type: 'invalid', fields: ['key'] } };
      expect(() => validateSchema(invalidAuth)).toThrow(SchemaValidationError);
    });

    it('should provide formatted errors on validation failure', () => {
      try {
        validateSchema({ name: '' });
      } catch (error) {
        if (error instanceof SchemaValidationError) {
          const formatted = error.getFormattedErrors();
          expect(Array.isArray(formatted)).toBe(true);
          expect(formatted.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('parseSchemaFromJSON', () => {
    it('should parse valid JSON', () => {
      const result = parseSchemaFromJSON(validSchemaJSON);
      expect(result.name).toBe('test-connector');
    });

    it('should throw SyntaxError for invalid JSON', () => {
      expect(() => parseSchemaFromJSON('invalid json')).toThrow(SyntaxError);
    });

    it('should throw SchemaValidationError for valid JSON but invalid schema', () => {
      expect(() => parseSchemaFromJSON('{}')).toThrow(SchemaValidationError);
    });
  });

  describe('Type Guards', () => {
    it('isConnectorSchema should return true for valid schema', () => {
      expect(isConnectorSchema(validSchema)).toBe(true);
    });

    it('isConnectorSchema should return false for invalid schema', () => {
      expect(isConnectorSchema({})).toBe(false);
      expect(isConnectorSchema(null)).toBe(false);
      expect(isConnectorSchema('string')).toBe(false);
    });

    it('isEntityDefinition should return true for valid entity', () => {
      expect(isEntityDefinition(validSchema.entities[0])).toBe(true);
    });

    it('isEntityDefinition should return false for invalid entity', () => {
      expect(isEntityDefinition({})).toBe(false);
    });
  });
});

// =============================================================================
// HELPER FUNCTION TESTS
// =============================================================================

describe('Helper Functions', () => {
  describe('getEntityByName', () => {
    it('should find entity by exact name', () => {
      const entity = getEntityByName(validSchema, 'Customer');
      expect(entity).toBeDefined();
      expect(entity?.name).toBe('Customer');
    });

    it('should find entity by case-insensitive name', () => {
      const entity = getEntityByName(validSchema, 'customer');
      expect(entity).toBeDefined();
      expect(entity?.name).toBe('Customer');
    });

    it('should return undefined for non-existent entity', () => {
      const entity = getEntityByName(validSchema, 'NonExistent');
      expect(entity).toBeUndefined();
    });
  });

  describe('getRelationshipsForEntity', () => {
    it('should find relationships where entity is source', () => {
      const rels = getRelationshipsForEntity(validSchema, 'Invoice');
      expect(rels.length).toBe(1);
      expect(rels[0].from).toBe('Invoice');
    });

    it('should find relationships where entity is target', () => {
      const rels = getRelationshipsForEntity(validSchema, 'Customer');
      expect(rels.length).toBe(1);
      expect(rels[0].to).toBe('Customer');
    });

    it('should return empty array for entity with no relationships', () => {
      const schemaWithoutRels = { ...validSchema, relationships: [] };
      const rels = getRelationshipsForEntity(schemaWithoutRels, 'Customer');
      expect(rels.length).toBe(0);
    });
  });

  describe('getOutgoingRelationships', () => {
    it('should get relationships where entity is source', () => {
      const rels = getOutgoingRelationships(validSchema, 'Invoice');
      expect(rels.length).toBe(1);
      expect(rels[0].from).toBe('Invoice');
    });

    it('should not include relationships where entity is target', () => {
      const rels = getOutgoingRelationships(validSchema, 'Customer');
      expect(rels.length).toBe(0);
    });
  });

  describe('getIncomingRelationships', () => {
    it('should get relationships where entity is target', () => {
      const rels = getIncomingRelationships(validSchema, 'Customer');
      expect(rels.length).toBe(1);
      expect(rels[0].to).toBe('Customer');
    });

    it('should not include relationships where entity is source', () => {
      const rels = getIncomingRelationships(validSchema, 'Invoice');
      expect(rels.length).toBe(0);
    });
  });

  describe('Field Helper Functions', () => {
    let customerEntity: EntityDefinition;

    beforeEach(() => {
      customerEntity = validSchema.entities[0];
    });

    it('getForeignKeyFields should return FK field names', () => {
      const invoiceEntity = validSchema.entities[1];
      const fkFields = getForeignKeyFields(invoiceEntity);
      expect(fkFields).toContain('customerId');
    });

    it('getRequiredFields should return required fields', () => {
      const requiredFields = getRequiredFields(customerEntity);
      expect(requiredFields.length).toBeGreaterThan(0);
      expect(requiredFields.every((f) => f.required)).toBe(true);
    });

    it('getFakerFields should return fields with faker config', () => {
      const fakerFields = getFakerFields(customerEntity);
      expect(fakerFields.length).toBeGreaterThan(0);
      expect(fakerFields.every((f) => f.faker !== undefined)).toBe(true);
    });

    it('getLLMGeneratedFields should return fields with llmGenerate', () => {
      const llmFields = getLLMGeneratedFields(customerEntity);
      expect(llmFields.length).toBe(1);
      expect(llmFields[0].name).toBe('description');
    });
  });

  describe('getEndpointByOperation', () => {
    it('should find endpoint by operation', () => {
      const endpoint = getEndpointByOperation(validSchema.entities[0], 'list');
      expect(endpoint).toBeDefined();
      expect(endpoint?.method).toBe('GET');
      expect(endpoint?.path).toBe('/customers');
    });

    it('should return undefined for non-existent operation', () => {
      const endpoint = getEndpointByOperation(validSchema.entities[0], 'search');
      expect(endpoint).toBeUndefined();
    });
  });
});

// =============================================================================
// ANALYSIS FUNCTION TESTS
// =============================================================================

describe('Analysis Functions', () => {
  describe('topologicalSortEntities', () => {
    it('should sort entities in dependency order', () => {
      const sorted = topologicalSortEntities(validSchema);
      const customerIndex = sorted.indexOf('Customer');
      const invoiceIndex = sorted.indexOf('Invoice');
      // Customer should come before Invoice (Invoice depends on Customer)
      expect(customerIndex).toBeLessThan(invoiceIndex);
    });

    it('should handle schema with no dependencies', () => {
      const noDepsSchema = {
        ...validSchema,
        entities: [
          {
            name: 'Independent',
            tableName: 'independent',
            endpoints: [{ method: 'GET' as const, path: '/', operation: 'list' as const }],
            fields: [{ name: 'id', type: 'uuid' as const, required: true }],
          },
        ],
        relationships: [],
      };
      const sorted = topologicalSortEntities(noDepsSchema);
      expect(sorted).toContain('Independent');
    });

    it('should detect circular dependencies', () => {
      const circularSchema: ConnectorSchema = {
        ...validSchema,
        entities: [
          {
            name: 'A',
            tableName: 'a',
            endpoints: [{ method: 'GET', path: '/', operation: 'list' }],
            fields: [
              { name: 'id', type: 'uuid', required: true },
              { name: 'bId', type: 'uuid', required: true, foreignKey: { entity: 'B', field: 'id' } },
            ],
          },
          {
            name: 'B',
            tableName: 'b',
            endpoints: [{ method: 'GET', path: '/', operation: 'list' }],
            fields: [
              { name: 'id', type: 'uuid', required: true },
              { name: 'aId', type: 'uuid', required: true, foreignKey: { entity: 'A', field: 'id' } },
            ],
          },
        ],
        relationships: [],
      };
      expect(() => topologicalSortEntities(circularSchema)).toThrow(/Circular dependency/);
    });
  });

  describe('validateForeignKeyReferences', () => {
    it('should return empty array for valid references', () => {
      const errors = validateForeignKeyReferences(validSchema);
      expect(errors.length).toBe(0);
    });

    it('should detect invalid entity references in fields', () => {
      const invalidSchema: ConnectorSchema = {
        ...validSchema,
        entities: [
          {
            name: 'Invoice',
            tableName: 'invoices',
            endpoints: [{ method: 'GET', path: '/', operation: 'list' }],
            fields: [
              { name: 'id', type: 'uuid', required: true },
              { name: 'customerId', type: 'uuid', required: true, foreignKey: { entity: 'NonExistent', field: 'id' } },
            ],
          },
        ],
        relationships: [],
      };
      const errors = validateForeignKeyReferences(invalidSchema);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('NonExistent');
    });

    it('should detect invalid entity references in relationships', () => {
      const invalidSchema: ConnectorSchema = {
        ...validSchema,
        relationships: [
          {
            from: 'NonExistent',
            to: 'Customer',
            type: 'one-to-many',
            foreignKey: 'id',
          },
        ],
      };
      const errors = validateForeignKeyReferences(invalidSchema);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('NonExistent');
    });
  });
});

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

describe('Edge Cases', () => {
  it('should handle schema with single entity and no relationships', () => {
    const minimalSchema: ConnectorSchema = {
      name: 'minimal',
      version: '1.0.0',
      baseUrl: '/api',
      auth: { type: 'apikey', fields: ['apiKey'] },
      entities: [
        {
          name: 'Item',
          tableName: 'items',
          endpoints: [{ method: 'GET', path: '/items', operation: 'list' }],
          fields: [{ name: 'id', type: 'uuid', required: true }],
        },
      ],
      relationships: [],
    };
    expect(validateSchema(minimalSchema)).toEqual(minimalSchema);
  });

  it('should handle all auth types', () => {
    const authTypes = ['oauth2', 'apikey', 'tba', 'basic'] as const;
    for (const authType of authTypes) {
      const schema = {
        ...validSchema,
        auth: { type: authType, fields: ['field1'] },
      };
      expect(() => validateSchema(schema)).not.toThrow();
    }
  });

  it('should handle all field types', () => {
    const fieldTypes = ['string', 'number', 'boolean', 'date', 'datetime', 'json', 'uuid'] as const;
    for (const fieldType of fieldTypes) {
      const schema: ConnectorSchema = {
        ...validSchema,
        entities: [
          {
            name: 'Test',
            tableName: 'test',
            endpoints: [{ method: 'GET', path: '/', operation: 'list' }],
            fields: [{ name: 'testField', type: fieldType, required: true }],
          },
        ],
        relationships: [],
      };
      expect(() => validateSchema(schema)).not.toThrow();
    }
  });

  it('should handle all HTTP methods', () => {
    const methods = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const;
    for (const method of methods) {
      const schema: ConnectorSchema = {
        ...validSchema,
        entities: [
          {
            name: 'Test',
            tableName: 'test',
            endpoints: [{ method, path: '/', operation: 'list' }],
            fields: [{ name: 'id', type: 'uuid', required: true }],
          },
        ],
        relationships: [],
      };
      expect(() => validateSchema(schema)).not.toThrow();
    }
  });

  it('should handle all operation types', () => {
    const operations = ['list', 'get', 'create', 'update', 'delete', 'search'] as const;
    for (const operation of operations) {
      const schema: ConnectorSchema = {
        ...validSchema,
        entities: [
          {
            name: 'Test',
            tableName: 'test',
            endpoints: [{ method: 'GET', path: '/', operation }],
            fields: [{ name: 'id', type: 'uuid', required: true }],
          },
        ],
        relationships: [],
      };
      expect(() => validateSchema(schema)).not.toThrow();
    }
  });

  it('should handle all relationship types', () => {
    const relTypes = ['one-to-one', 'one-to-many', 'many-to-many'] as const;
    for (const relType of relTypes) {
      const schema: ConnectorSchema = {
        ...validSchema,
        relationships: [
          {
            from: 'Invoice',
            to: 'Customer',
            type: relType,
            foreignKey: 'customerId',
          },
        ],
      };
      expect(() => validateSchema(schema)).not.toThrow();
    }
  });
});
