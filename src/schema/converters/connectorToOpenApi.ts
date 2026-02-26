/**
 * ConnectorSchema to OpenAPI 3.0 Converter
 *
 * Converts our custom ConnectorSchema format to OpenAPI 3.0.3 specification
 * for use with WireMock and Specmatic.
 */

import * as fs from 'fs';
import * as yaml from 'js-yaml';

interface ConnectorField {
  name: string;
  type: string;
  required?: boolean;
  unique?: boolean;
  primaryKey?: boolean;
  description?: string;
  default?: unknown;
  foreignKey?: {
    table: string;
    column: string;
  };
}

interface ConnectorEntity {
  table: string;
  description?: string;
  snowflakeObjectName?: string;
  snowflakeTableName?: string;
  snowflakeSchema?: string;
  snowflakeDatabase?: string;
  fields: ConnectorField[];
}

interface ConnectorEndpoint {
  method: string;
  path: string;
  description?: string;
  pathParameters?: Record<string, { type: string; description?: string }>;
  queryParameters?: Record<string, { type: string; description?: string }>;
  requestBody?: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  response?: {
    type: string;
    properties: Record<string, unknown>;
  };
}

interface ConnectorSchema {
  connectorId: string;
  connectorName: string;
  connectorType: string;
  version: string;
  description: string;
  baseUrl: string;
  authentication: {
    type: string;
    endpoints: Record<string, string>;
  };
  entities: Record<string, ConnectorEntity>;
  endpoints: Record<string, Record<string, ConnectorEndpoint>>;
  errorCodes?: Record<string, { code: string; sqlState: string; message: string }>;
}

interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  paths: Record<string, unknown>;
  components: {
    schemas: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
  security?: Array<Record<string, string[]>>;
}

// Type mappings from ConnectorSchema to OpenAPI
const typeMapping: Record<string, { type: string; format?: string }> = {
  string: { type: 'string' },
  text: { type: 'string' },
  varchar: { type: 'string' },
  integer: { type: 'integer' },
  int: { type: 'integer' },
  number: { type: 'number' },
  decimal: { type: 'number', format: 'double' },
  float: { type: 'number', format: 'float' },
  double: { type: 'number', format: 'double' },
  boolean: { type: 'boolean' },
  date: { type: 'string', format: 'date' },
  datetime: { type: 'string', format: 'date-time' },
  timestamp: { type: 'string', format: 'date-time' },
  uuid: { type: 'string', format: 'uuid' },
  json: { type: 'object' },
  object: { type: 'object' },
  array: { type: 'array', format: undefined },
};

function mapFieldToOpenApiProperty(field: ConnectorField): Record<string, unknown> {
  const mapped = typeMapping[field.type] || { type: 'string' };
  const property: Record<string, unknown> = {
    type: mapped.type,
  };

  if (mapped.format) {
    property.format = mapped.format;
  }

  if (field.description) {
    property.description = field.description;
  }

  if (field.default !== undefined) {
    property.default = field.default;
  }

  return property;
}

function entityToSchema(entity: ConnectorEntity): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of entity.fields) {
    properties[field.name] = mapFieldToOpenApiProperty(field);

    if (field.required && !field.primaryKey) {
      required.push(field.name);
    }
  }

  return {
    type: 'object',
    description: entity.description || `${entity.table} entity`,
    properties,
    ...(required.length > 0 && { required }),
  };
}

function generateCrudPaths(
  entityName: string,
  _entity: ConnectorEntity,
  baseUrl: string
): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  const basePath = `${baseUrl}/${entityName}`;
  const itemPath = `${basePath}/{id}`;

  // GET list endpoint
  paths[basePath] = {
    get: {
      summary: `List all ${entityName}`,
      description: `Retrieve a list of ${entityName}`,
      operationId: `list${capitalize(entityName)}`,
      tags: [entityName],
      parameters: [
        {
          name: 'limit',
          in: 'query',
          description: 'Maximum number of results to return',
          schema: { type: 'integer', default: 100 },
        },
        {
          name: 'offset',
          in: 'query',
          description: 'Number of results to skip',
          schema: { type: 'integer', default: 0 },
        },
      ],
      responses: {
        '200': {
          description: `Successful response with list of ${entityName}`,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: { $ref: `#/components/schemas/${capitalize(entityName)}` },
                  },
                  pagination: {
                    type: 'object',
                    properties: {
                      total: { type: 'integer' },
                      limit: { type: 'integer' },
                      offset: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    post: {
      summary: `Create a ${entityName}`,
      description: `Create a new ${entityName} record`,
      operationId: `create${capitalize(entityName)}`,
      tags: [entityName],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${capitalize(entityName)}Input` },
          },
        },
      },
      responses: {
        '201': {
          description: `${capitalize(entityName)} created successfully`,
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${capitalize(entityName)}` },
            },
          },
        },
      },
    },
  };

  // GET, PUT, DELETE by ID endpoints
  paths[itemPath] = {
    get: {
      summary: `Get ${entityName} by ID`,
      description: `Retrieve a single ${entityName} by its ID`,
      operationId: `get${capitalize(entityName)}ById`,
      tags: [entityName],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: `ID of the ${entityName}`,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': {
          description: `Successful response with ${entityName} details`,
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${capitalize(entityName)}` },
            },
          },
        },
        '404': {
          description: `${capitalize(entityName)} not found`,
        },
      },
    },
    put: {
      summary: `Update ${entityName}`,
      description: `Update an existing ${entityName}`,
      operationId: `update${capitalize(entityName)}`,
      tags: [entityName],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: `ID of the ${entityName}`,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${capitalize(entityName)}Input` },
          },
        },
      },
      responses: {
        '200': {
          description: `${capitalize(entityName)} updated successfully`,
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${capitalize(entityName)}` },
            },
          },
        },
        '404': {
          description: `${capitalize(entityName)} not found`,
        },
      },
    },
    delete: {
      summary: `Delete ${entityName}`,
      description: `Delete a ${entityName} by its ID`,
      operationId: `delete${capitalize(entityName)}`,
      tags: [entityName],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: `ID of the ${entityName}`,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '204': {
          description: `${capitalize(entityName)} deleted successfully`,
        },
        '404': {
          description: `${capitalize(entityName)} not found`,
        },
      },
    },
  };

  return paths;
}

function generateInputSchema(entity: ConnectorEntity): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of entity.fields) {
    // Skip auto-generated fields for input schemas
    if (field.primaryKey || field.name === 'created_at' || field.name === 'updated_at') {
      continue;
    }

    properties[field.name] = mapFieldToOpenApiProperty(field);

    if (field.required) {
      required.push(field.name);
    }
  }

  return {
    type: 'object',
    description: `Input schema for creating/updating ${entity.table}`,
    properties,
    ...(required.length > 0 && { required }),
  };
}

function convertExplicitEndpoints(
  endpoints: Record<string, Record<string, ConnectorEndpoint>>
): Record<string, unknown> {
  const paths: Record<string, unknown> = {};

  for (const [category, categoryEndpoints] of Object.entries(endpoints)) {
    for (const [name, endpoint] of Object.entries(categoryEndpoints)) {
      const pathKey = endpoint.path;

      if (!paths[pathKey]) {
        paths[pathKey] = {};
      }

      const method = endpoint.method.toLowerCase();
      const operation: Record<string, unknown> = {
        summary: endpoint.description || name,
        operationId: name,
        tags: [category],
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: endpoint.response
                  ? convertSchemaObject(endpoint.response)
                  : { type: 'object' },
              },
            },
          },
        },
      };

      // Add path parameters
      if (endpoint.pathParameters) {
        operation.parameters = operation.parameters || [];
        for (const [paramName, paramDef] of Object.entries(endpoint.pathParameters)) {
          (operation.parameters as unknown[]).push({
            name: paramName,
            in: 'path',
            required: true,
            description: paramDef.description || paramName,
            schema: { type: paramDef.type || 'string' },
          });
        }
      }

      // Add query parameters
      if (endpoint.queryParameters) {
        operation.parameters = operation.parameters || [];
        for (const [paramName, paramDef] of Object.entries(endpoint.queryParameters)) {
          (operation.parameters as unknown[]).push({
            name: paramName,
            in: 'query',
            description: paramDef.description || paramName,
            schema: { type: paramDef.type || 'string' },
          });
        }
      }

      // Add request body
      if (endpoint.requestBody && (method === 'post' || method === 'put' || method === 'patch')) {
        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: convertSchemaObject(endpoint.requestBody),
            },
          },
        };
      }

      (paths[pathKey] as Record<string, unknown>)[method] = operation;
    }
  }

  return paths;
}

function convertSchemaObject(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.type === 'object' && schema.properties) {
    const properties: Record<string, unknown> = {};
    for (const [propName, propDef] of Object.entries(
      schema.properties as Record<string, unknown>
    )) {
      if (typeof propDef === 'object' && propDef !== null) {
        const typedPropDef = propDef as Record<string, unknown>;
        const prop: Record<string, unknown> = {
          type: typedPropDef.type || 'string',
        };
        if (typedPropDef.description) {
          prop.description = typedPropDef.description;
        }
        if (typedPropDef.enum) {
          prop.enum = typedPropDef.enum;
        }
        properties[propName] = prop;
      }
    }
    const result: Record<string, unknown> = {
      type: 'object',
      properties,
    };
    if (schema.required) {
      result.required = schema.required;
    }
    return result;
  }
  return { type: (schema.type as string) || 'object' };
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function convertConnectorSchemaToOpenApi(connectorSchema: ConnectorSchema): OpenApiSpec {
  const openApi: OpenApiSpec = {
    openapi: '3.0.3',
    info: {
      title: `${connectorSchema.connectorName} Mock API`,
      version: connectorSchema.version,
      description: connectorSchema.description,
    },
    servers: [
      {
        url: `http://localhost:8080${connectorSchema.baseUrl}`,
        description: 'WireMock Mock Server',
      },
    ],
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  };

  // Convert entities to schemas and generate CRUD paths
  for (const [entityName, entity] of Object.entries(connectorSchema.entities)) {
    // Add entity schema
    const schemaName = capitalize(entityName);
    openApi.components.schemas[schemaName] = entityToSchema(entity);

    // Add input schema (without auto-generated fields)
    openApi.components.schemas[`${schemaName}Input`] = generateInputSchema(entity);

    // Generate CRUD paths for entities
    const crudPaths = generateCrudPaths(entityName, entity, connectorSchema.baseUrl);
    openApi.paths = { ...openApi.paths, ...crudPaths };
  }

  // Convert explicit endpoints
  if (connectorSchema.endpoints) {
    const explicitPaths = convertExplicitEndpoints(connectorSchema.endpoints);
    // Merge explicit paths (they take precedence)
    for (const [pathKey, pathValue] of Object.entries(explicitPaths)) {
      const existingPath = openApi.paths[pathKey];
      const newPath = pathValue as Record<string, unknown>;
      if (existingPath && typeof existingPath === 'object') {
        openApi.paths[pathKey] = {
          ...existingPath,
          ...newPath,
        };
      } else {
        openApi.paths[pathKey] = newPath;
      }
    }
  }

  // Add error response schemas
  openApi.components.schemas['Error'] = {
    type: 'object',
    properties: {
      code: { type: 'string' },
      sqlState: { type: 'string' },
      message: { type: 'string' },
    },
  };

  return openApi;
}

export async function convertSchemaFile(
  inputPath: string,
  outputPath: string,
  format: 'yaml' | 'json' = 'yaml'
): Promise<void> {
  const inputContent = fs.readFileSync(inputPath, 'utf-8');
  const connectorSchema: ConnectorSchema = JSON.parse(inputContent);

  const openApiSpec = convertConnectorSchemaToOpenApi(connectorSchema);

  let output: string;
  if (format === 'yaml') {
    output = yaml.dump(openApiSpec, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    });
  } else {
    output = JSON.stringify(openApiSpec, null, 2);
  }

  fs.writeFileSync(outputPath, output);
  console.log(`Converted ${inputPath} to ${outputPath}`);
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: npx ts-node connectorToOpenApi.ts <input.json> <output.yaml|json>');
    process.exit(1);
  }

  const [input, output] = args;
  const format = output.endsWith('.json') ? 'json' : 'yaml';

  convertSchemaFile(input, output, format)
    .then(() => console.log('Conversion complete'))
    .catch((err) => {
      console.error('Conversion failed:', err);
      process.exit(1);
    });
}
