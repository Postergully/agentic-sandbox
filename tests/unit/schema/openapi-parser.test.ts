/**
 * Tests for OpenAPI Parser
 */

import { OpenAPIParser, isOpenAPISpec } from '../../../src/schema/parsers/openapi-parser';
import type { OpenAPIV3 } from 'openapi-types';

describe('OpenAPIParser', () => {
  describe('isOpenAPISpec', () => {
    it('should detect YAML files', () => {
      expect(isOpenAPISpec('openapi.yaml')).toBe(true);
      expect(isOpenAPISpec('swagger.yml')).toBe(true);
    });

    it('should detect JSON files', () => {
      expect(isOpenAPISpec('openapi.json')).toBe(true);
    });

    it('should detect URLs with openapi/swagger', () => {
      expect(isOpenAPISpec('https://api.example.com/openapi.json')).toBe(true);
      expect(isOpenAPISpec('https://api.example.com/swagger.yaml')).toBe(true);
    });

    it('should detect inline JSON with openapi marker', () => {
      expect(isOpenAPISpec('{"openapi": "3.0.0"}')).toBe(true);
      expect(isOpenAPISpec('{"swagger": "2.0"}')).toBe(true);
    });

    it('should return false for non-OpenAPI inputs', () => {
      expect(isOpenAPISpec('https://example.com/docs')).toBe(false);
      expect(isOpenAPISpec('{"users": []}')).toBe(false);
    });
  });

  describe('parseDocument', () => {
    const parser = new OpenAPIParser({
      name: 'test_api',
      baseUrl: '/api/test',
      tablePrefix: 'test_',
    });

    it('should parse a minimal OpenAPI spec', async () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: {
          title: 'Test API',
          version: '1.0.0',
        },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            email: { type: 'string', format: 'email' },
                            name: { type: 'string' },
                          },
                          required: ['id', 'email'],
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        email: { type: 'string', format: 'email' },
                        name: { type: 'string' },
                      },
                      required: ['email'],
                    },
                  },
                },
              },
              responses: {
                '201': {
                  description: 'Created',
                },
              },
            },
          },
          '/users/{id}': {
            get: {
              responses: {
                '200': {
                  description: 'Success',
                },
              },
            },
          },
        },
      };

      const result = await parser.parseDocument(spec);

      expect(result.schema.name).toBe('test_api');
      expect(result.schema.version).toBe('1.0.0');
      expect(result.schema.baseUrl).toBe('/api/test');
      expect(result.metadata.openApiVersion).toBe('3.0.0');
      expect(result.metadata.title).toBe('Test API');

      // Check entity was created
      const userEntity = result.schema.entities.find((e) => e.name === 'User');
      expect(userEntity).toBeDefined();
      expect(userEntity?.tableName).toBe('test_users');

      // Check endpoints
      expect(userEntity?.endpoints).toContainEqual({
        method: 'GET',
        path: '/users',
        operation: 'list',
      });
      expect(userEntity?.endpoints).toContainEqual({
        method: 'POST',
        path: '/users',
        operation: 'create',
      });
      expect(userEntity?.endpoints).toContainEqual({
        method: 'GET',
        path: '/users/:id',
        operation: 'get',
      });

      // Check fields
      expect(userEntity?.fields).toContainEqual(
        expect.objectContaining({
          name: 'id',
          type: 'uuid',
          required: true,
        })
      );
      expect(userEntity?.fields).toContainEqual(
        expect.objectContaining({
          name: 'email',
          type: 'string',
          required: true,
          faker: 'internet.email',
        })
      );
    });

    it('should extract auth configuration from security schemes', async () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: {
          title: 'OAuth API',
          version: '1.0.0',
        },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          securitySchemes: {
            oauth2: {
              type: 'oauth2',
              flows: {
                clientCredentials: {
                  tokenUrl: '/oauth/token',
                  scopes: {},
                },
              },
            },
          },
        },
      };

      const result = await parser.parseDocument(spec);

      expect(result.schema.auth.type).toBe('oauth2');
      expect(result.schema.auth.fields).toContain('client_id');
      expect(result.schema.auth.fields).toContain('client_secret');
      expect(result.schema.auth.config?.tokenEndpoint).toBe('/oauth/token');
    });

    it('should extract entities from components/schemas', async () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: {
          title: 'Schema API',
          version: '1.0.0',
        },
        paths: {
          '/customers': {
            get: {
              responses: {
                '200': { description: 'Success' },
              },
            },
          },
        },
        components: {
          schemas: {
            Customer: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                companyName: { type: 'string' },
                email: { type: 'string', format: 'email' },
                status: {
                  type: 'string',
                  enum: ['ACTIVE', 'INACTIVE', 'PENDING'],
                },
              },
              required: ['id', 'companyName'],
            },
          },
        },
      };

      const result = await parser.parseDocument(spec);

      const customer = result.schema.entities.find((e) => e.name === 'Customer');
      expect(customer).toBeDefined();
      expect(customer?.tableName).toBe('test_customers');

      // Check enum field
      const statusField = customer?.fields.find((f) => f.name === 'status');
      expect(statusField?.enum).toEqual(['ACTIVE', 'INACTIVE', 'PENDING']);
    });

    it('should infer relationships from foreign key patterns', async () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: {
          title: 'Relational API',
          version: '1.0.0',
        },
        paths: {
          '/customers': {
            get: { responses: { '200': { description: 'Success' } } },
          },
          '/invoices': {
            get: { responses: { '200': { description: 'Success' } } },
          },
        },
        components: {
          schemas: {
            Customer: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
              },
            },
            Invoice: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                customerId: { type: 'string', format: 'uuid' },
                amount: { type: 'number' },
              },
            },
          },
        },
      };

      const result = await parser.parseDocument(spec);

      // Check relationship was inferred
      expect(result.schema.relationships).toContainEqual({
        from: 'Invoice',
        to: 'Customer',
        type: 'one-to-many',
        foreignKey: 'customerId',
      });

      // Check foreign key was added to field
      const invoice = result.schema.entities.find((e) => e.name === 'Invoice');
      const customerIdField = invoice?.fields.find((f) => f.name === 'customerId');
      expect(customerIdField?.foreignKey).toEqual({
        entity: 'Customer',
        field: 'id',
      });
    });

    it('should infer faker methods from field names', async () => {
      const spec: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: {
          title: 'Faker API',
          version: '1.0.0',
        },
        paths: {
          '/contacts': {
            get: { responses: { '200': { description: 'Success' } } },
          },
        },
        components: {
          schemas: {
            Contact: {
              type: 'object',
              properties: {
                email: { type: 'string' },
                phone: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                city: { type: 'string' },
                website: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
        },
      };

      const result = await parser.parseDocument(spec);

      const contact = result.schema.entities.find((e) => e.name === 'Contact');
      const fields = contact?.fields || [];

      expect(fields.find((f) => f.name === 'email')?.faker).toBe('internet.email');
      expect(fields.find((f) => f.name === 'phone')?.faker).toBe('phone.number');
      expect(fields.find((f) => f.name === 'firstName')?.faker).toBe('person.firstName');
      expect(fields.find((f) => f.name === 'lastName')?.faker).toBe('person.lastName');
      expect(fields.find((f) => f.name === 'city')?.faker).toBe('location.city');
      expect(fields.find((f) => f.name === 'website')?.faker).toBe('internet.url');
      expect(fields.find((f) => f.name === 'description')?.faker).toBe('lorem.sentence');
    });
  });
});
