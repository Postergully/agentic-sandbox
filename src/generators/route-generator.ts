/**
 * Route Generator
 *
 * Generates Express routes from ConnectorSchema.
 * Accepts output from any infer-schema parser (OpenAPI, LLM, JSON, Large Docs).
 *
 * @module generators/route-generator
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ConnectorSchema,
  EntityDefinition,
  FieldDefinition,
  Operation,
  validateSchema,
  getRequiredFields,
} from '../schema/connector-schema';
import { SchemaParseResult } from '../schema/parsers';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Options for route generation
 */
export interface RouteGeneratorOptions {
  /** Include authentication middleware */
  includeAuth?: boolean;
  /** Include request validation */
  includeValidation?: boolean;
  /** Include logging */
  includeLogging?: boolean;
  /** Service import path (relative to routes file) */
  serviceImportPath?: string;
  /** Generate service stubs */
  generateServiceStubs?: boolean;
  /** Max items per page for list endpoints */
  maxPageSize?: number;
  /** Default items per page */
  defaultPageSize?: number;
}

/**
 * Result from route generation
 */
export interface RouteGeneratorResult {
  /** Generated route file content */
  routeCode: string;
  /** Generated service stub content (if requested) */
  serviceCode?: string;
  /** Entity names with routes */
  entities: string[];
  /** Endpoints generated */
  endpoints: { entity: string; method: string; path: string; operation: Operation }[];
  /** Warnings during generation */
  warnings: string[];
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert to camelCase
 */
function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Convert to PascalCase
 */
function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert to kebab-case
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
}

/**
 * Pluralize entity name (simple version)
 */
function pluralize(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('s') || lower.endsWith('x') || lower.endsWith('ch') || lower.endsWith('sh')) {
    return name + 'es';
  }
  if (lower.endsWith('y') && !['a', 'e', 'i', 'o', 'u'].includes(lower.charAt(lower.length - 2))) {
    return name.slice(0, -1) + 'ies';
  }
  return name + 's';
}

/**
 * Get URL path for entity
 */
function getEntityPath(entity: EntityDefinition): string {
  // Check if entity has custom paths defined
  if (entity.endpoints.length > 0) {
    const listEndpoint = entity.endpoints.find(e => e.operation === 'list');
    if (listEndpoint) {
      return listEndpoint.path.split('/:')[0];
    }
  }
  return '/' + toKebabCase(pluralize(entity.name)).toLowerCase();
}

/**
 * Get required field names for validation
 */
function getRequiredFieldNames(entity: EntityDefinition): string[] {
  return getRequiredFields(entity)
    .filter(f => f.name !== 'id') // Exclude id, it's auto-generated
    .map(f => f.name);
}

// =============================================================================
// CODE GENERATION FUNCTIONS
// =============================================================================

/**
 * Generate imports section
 */
function generateImports(
  schema: ConnectorSchema,
  options: Required<RouteGeneratorOptions>
): string {
  const lines = [
    "import { Router, Response } from 'express';",
    "import { AuthRequest, ApiResponse, QueryParams } from '../types';",
  ];

  if (options.includeAuth) {
    lines.push("import { authenticate } from '../middleware/auth';");
  }

  lines.push("import { asyncHandler, AppError } from '../middleware/errorHandler';");

  if (options.includeLogging) {
    lines.push("import logger from '../utils/logger';");
  }

  // Service import
  const serviceName = toCamelCase(schema.name) + 'Service';
  lines.push(`import ${serviceName} from '${options.serviceImportPath}';`);

  return lines.join('\n');
}

/**
 * Generate list endpoint
 */
function generateListEndpoint(
  entity: EntityDefinition,
  entityPath: string,
  serviceName: string,
  options: Required<RouteGeneratorOptions>
): string {
  const methodName = `get${toPascalCase(pluralize(entity.name))}`;

  const lines = [
    `// GET ${entityPath} - List ${entity.name.toLowerCase()}s`,
    `router.get('${entityPath}', asyncHandler(async (req: AuthRequest, res: Response) => {`,
    `  const queryParams: QueryParams = {`,
    `    page: parseInt(req.query.page as string) || 1,`,
    `    limit: Math.min(parseInt(req.query.limit as string) || ${options.defaultPageSize}, ${options.maxPageSize}),`,
    `    sort: (req.query.sort as string) || 'created_at',`,
    `    order: (req.query.order as 'asc' | 'desc') || 'desc',`,
    `    search: req.query.search as string,`,
    `  };`,
    ``,
    `  const { data, total } = await ${serviceName}.${methodName}(queryParams);`,
    ``,
    `  const response: ApiResponse = {`,
    `    success: true,`,
    `    data,`,
    `    meta: {`,
    `      page: queryParams.page,`,
    `      limit: queryParams.limit,`,
    `      total,`,
    `      timestamp: new Date().toISOString(),`,
    `    },`,
    `  };`,
    ``,
    `  res.json(response);`,
    `}));`,
  ];

  return lines.join('\n');
}

/**
 * Generate get by ID endpoint
 */
function generateGetEndpoint(
  entity: EntityDefinition,
  entityPath: string,
  serviceName: string,
  _options: Required<RouteGeneratorOptions>
): string {
  const entityVar = toCamelCase(entity.name);
  const methodName = `get${toPascalCase(entity.name)}ById`;
  const errorCode = `${entity.name.toUpperCase()}_NOT_FOUND`;

  const lines = [
    `// GET ${entityPath}/:id - Get ${entity.name.toLowerCase()} by ID`,
    `router.get('${entityPath}/:id', asyncHandler(async (req: AuthRequest, res: Response) => {`,
    `  const { id } = req.params;`,
    ``,
    `  const ${entityVar} = await ${serviceName}.${methodName}(id);`,
    ``,
    `  if (!${entityVar}) {`,
    `    throw new AppError('${entity.name} not found', 404, '${errorCode}');`,
    `  }`,
    ``,
    `  const response: ApiResponse = {`,
    `    success: true,`,
    `    data: ${entityVar},`,
    `  };`,
    ``,
    `  res.json(response);`,
    `}));`,
  ];

  return lines.join('\n');
}

/**
 * Generate create endpoint
 */
function generateCreateEndpoint(
  entity: EntityDefinition,
  entityPath: string,
  serviceName: string,
  options: Required<RouteGeneratorOptions>
): string {
  const entityVar = toCamelCase(entity.name);
  const methodName = `create${toPascalCase(entity.name)}`;
  const requiredFields = getRequiredFieldNames(entity);

  const lines = [
    `// POST ${entityPath} - Create ${entity.name.toLowerCase()}`,
    `router.post('${entityPath}', asyncHandler(async (req: AuthRequest, res: Response) => {`,
  ];

  // Add validation if there are required fields
  if (options.includeValidation && requiredFields.length > 0) {
    const fieldList = requiredFields.join(', ');
    lines.push(`  const { ${fieldList}, ...rest } = req.body;`);
    lines.push(``);

    // Generate validation check
    const checks = requiredFields.map(f => `!${f}`).join(' || ');
    lines.push(`  if (${checks}) {`);
    lines.push(`    throw new AppError(`);
    lines.push(`      'Required fields: ${requiredFields.join(', ')}',`);
    lines.push(`      400,`);
    lines.push(`      'VALIDATION_ERROR'`);
    lines.push(`    );`);
    lines.push(`  }`);
    lines.push(``);
    lines.push(`  const ${entityVar} = await ${serviceName}.${methodName}({`);
    lines.push(`    ${fieldList},`);
    lines.push(`    ...rest,`);
    lines.push(`  });`);
  } else {
    lines.push(`  const ${entityVar} = await ${serviceName}.${methodName}(req.body);`);
  }

  if (options.includeLogging) {
    lines.push(``);
    lines.push(`  logger.info(\`${entity.name} created by user \${req.user?.id}: \${${entityVar}.id}\`);`);
  }

  lines.push(``);
  lines.push(`  const response: ApiResponse = {`);
  lines.push(`    success: true,`);
  lines.push(`    data: ${entityVar},`);
  lines.push(`  };`);
  lines.push(``);
  lines.push(`  res.status(201).json(response);`);
  lines.push(`}));`);

  return lines.join('\n');
}

/**
 * Generate update endpoint
 */
function generateUpdateEndpoint(
  entity: EntityDefinition,
  entityPath: string,
  serviceName: string,
  options: Required<RouteGeneratorOptions>
): string {
  const entityVar = toCamelCase(entity.name);
  const methodName = `update${toPascalCase(entity.name)}`;
  const errorCode = `${entity.name.toUpperCase()}_NOT_FOUND`;

  const lines = [
    `// PATCH ${entityPath}/:id - Update ${entity.name.toLowerCase()}`,
    `router.patch('${entityPath}/:id', asyncHandler(async (req: AuthRequest, res: Response) => {`,
    `  const { id } = req.params;`,
    ``,
    `  const ${entityVar} = await ${serviceName}.${methodName}(id, req.body);`,
    ``,
    `  if (!${entityVar}) {`,
    `    throw new AppError('${entity.name} not found', 404, '${errorCode}');`,
    `  }`,
  ];

  if (options.includeLogging) {
    lines.push(``);
    lines.push(`  logger.info(\`${entity.name} updated by user \${req.user?.id}: \${id}\`);`);
  }

  lines.push(``);
  lines.push(`  const response: ApiResponse = {`);
  lines.push(`    success: true,`);
  lines.push(`    data: ${entityVar},`);
  lines.push(`  };`);
  lines.push(``);
  lines.push(`  res.json(response);`);
  lines.push(`}));`);

  return lines.join('\n');
}

/**
 * Generate delete endpoint
 */
function generateDeleteEndpoint(
  entity: EntityDefinition,
  entityPath: string,
  serviceName: string,
  options: Required<RouteGeneratorOptions>
): string {
  const methodName = `delete${toPascalCase(entity.name)}`;
  const errorCode = `${entity.name.toUpperCase()}_NOT_FOUND`;

  const lines = [
    `// DELETE ${entityPath}/:id - Delete ${entity.name.toLowerCase()}`,
    `router.delete('${entityPath}/:id', asyncHandler(async (req: AuthRequest, res: Response) => {`,
    `  const { id } = req.params;`,
    ``,
    `  const deleted = await ${serviceName}.${methodName}(id);`,
    ``,
    `  if (!deleted) {`,
    `    throw new AppError('${entity.name} not found', 404, '${errorCode}');`,
    `  }`,
  ];

  if (options.includeLogging) {
    lines.push(``);
    lines.push(`  logger.info(\`${entity.name} deleted by user \${req.user?.id}: \${id}\`);`);
  }

  lines.push(``);
  lines.push(`  const response: ApiResponse = {`);
  lines.push(`    success: true,`);
  lines.push(`    data: { id, deleted: true },`);
  lines.push(`  };`);
  lines.push(``);
  lines.push(`  res.json(response);`);
  lines.push(`}));`);

  return lines.join('\n');
}

/**
 * Generate service stub
 */
function generateServiceStub(
  schema: ConnectorSchema,
  _options: Required<RouteGeneratorOptions>
): string {
  const serviceName = toPascalCase(schema.name) + 'Service';
  const lines: string[] = [
    `/**`,
    ` * ${schema.name} Service`,
    ` *`,
    ` * Auto-generated service stub for ${schema.name} connector.`,
    ` * Implement the database queries in each method.`,
    ` *`,
    ` * @module services/${toCamelCase(schema.name)}Service`,
    ` */`,
    ``,
    `import pool from '../config/database';`,
    `import { QueryParams } from '../types';`,
    ``,
  ];

  // Generate interface for each entity
  for (const entity of schema.entities) {
    const interfaceName = toPascalCase(entity.name);
    lines.push(`export interface ${interfaceName} {`);
    for (const field of entity.fields) {
      const tsType = mapFieldTypeToTS(field);
      const optional = field.required ? '' : '?';
      lines.push(`  ${field.name}${optional}: ${tsType};`);
    }
    lines.push(`}`);
    lines.push(``);
  }

  // Generate service class
  lines.push(`class ${serviceName} {`);

  for (const entity of schema.entities) {
    const entityName = toPascalCase(entity.name);
    const pluralName = pluralize(entity.name);
    const tableName = entity.tableName;

    // List method
    lines.push(`  async get${toPascalCase(pluralName)}(params: QueryParams): Promise<{ data: ${entityName}[]; total: number }> {`);
    lines.push(`    const { page, limit, sort, order, search } = params;`);
    lines.push(`    const offset = (page - 1) * limit;`);
    lines.push(``);
    lines.push(`    // TODO: Implement database query`);
    lines.push(`    const countResult = await pool.query('SELECT COUNT(*) FROM ${tableName}');`);
    lines.push(`    const total = parseInt(countResult.rows[0].count);`);
    lines.push(``);
    lines.push(`    const result = await pool.query(`);
    lines.push(`      \`SELECT * FROM ${tableName} ORDER BY \${sort} \${order} LIMIT $1 OFFSET $2\`,`);
    lines.push(`      [limit, offset]`);
    lines.push(`    );`);
    lines.push(``);
    lines.push(`    return { data: result.rows, total };`);
    lines.push(`  }`);
    lines.push(``);

    // Get by ID method
    lines.push(`  async get${entityName}ById(id: string): Promise<${entityName} | null> {`);
    lines.push(`    const result = await pool.query('SELECT * FROM ${tableName} WHERE id = $1', [id]);`);
    lines.push(`    return result.rows[0] || null;`);
    lines.push(`  }`);
    lines.push(``);

    // Create method
    lines.push(`  async create${entityName}(data: Partial<${entityName}>): Promise<${entityName}> {`);
    lines.push(`    // TODO: Implement insert query with proper field mapping`);
    lines.push(`    const result = await pool.query(`);
    lines.push(`      'INSERT INTO ${tableName} (id) VALUES (uuid_generate_v4()) RETURNING *'`);
    lines.push(`    );`);
    lines.push(`    return result.rows[0];`);
    lines.push(`  }`);
    lines.push(``);

    // Update method
    lines.push(`  async update${entityName}(id: string, data: Partial<${entityName}>): Promise<${entityName} | null> {`);
    lines.push(`    // TODO: Implement update query with proper field mapping`);
    lines.push(`    const result = await pool.query(`);
    lines.push(`      'UPDATE ${tableName} SET updated_at = NOW() WHERE id = $1 RETURNING *',`);
    lines.push(`      [id]`);
    lines.push(`    );`);
    lines.push(`    return result.rows[0] || null;`);
    lines.push(`  }`);
    lines.push(``);

    // Delete method
    lines.push(`  async delete${entityName}(id: string): Promise<boolean> {`);
    lines.push(`    const result = await pool.query('DELETE FROM ${tableName} WHERE id = $1', [id]);`);
    lines.push(`    return (result.rowCount ?? 0) > 0;`);
    lines.push(`  }`);
    lines.push(``);
  }

  lines.push(`}`);
  lines.push(``);
  lines.push(`export default new ${serviceName}();`);

  return lines.join('\n');
}

/**
 * Map field type to TypeScript type
 */
function mapFieldTypeToTS(field: FieldDefinition): string {
  switch (field.type) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
    case 'datetime':
      return 'Date | string';
    case 'json':
      return 'Record<string, unknown>';
    case 'uuid':
      return 'string';
    default:
      return 'unknown';
  }
}

// =============================================================================
// MAIN GENERATOR CLASS
// =============================================================================

export class RouteGenerator {
  private options: Required<RouteGeneratorOptions>;

  constructor(options: RouteGeneratorOptions = {}) {
    this.options = {
      includeAuth: options.includeAuth ?? true,
      includeValidation: options.includeValidation ?? true,
      includeLogging: options.includeLogging ?? true,
      serviceImportPath: options.serviceImportPath ?? '../services/connectorService',
      generateServiceStubs: options.generateServiceStubs ?? true,
      maxPageSize: options.maxPageSize ?? 100,
      defaultPageSize: options.defaultPageSize ?? 50,
    };
  }

  /**
   * Generate Express routes from ConnectorSchema
   */
  generate(schema: ConnectorSchema): RouteGeneratorResult {
    const warnings: string[] = [];
    const entities: string[] = [];
    const endpoints: { entity: string; method: string; path: string; operation: Operation }[] = [];
    const routeParts: string[] = [];

    const serviceName = toCamelCase(schema.name) + 'Service';

    // Generate imports
    routeParts.push(generateImports(schema, this.options));
    routeParts.push('');

    // Router setup
    routeParts.push('const router = Router();');
    routeParts.push('');

    // Authentication middleware
    if (this.options.includeAuth) {
      routeParts.push(`// All ${schema.name} routes require authentication`);
      routeParts.push('router.use(authenticate);');
      routeParts.push('');
    }

    // Generate routes for each entity
    for (const entity of schema.entities) {
      const entityPath = getEntityPath(entity);
      entities.push(entity.name);

      routeParts.push(`// ${'='.repeat(70)}`);
      routeParts.push(`// ${entity.name.toUpperCase()} ENDPOINTS`);
      routeParts.push(`// ${'='.repeat(70)}`);
      routeParts.push('');

      // Determine which operations to generate
      const operations = new Set(entity.endpoints.map(e => e.operation));

      // Default to all CRUD if no endpoints specified
      if (operations.size === 0) {
        operations.add('list');
        operations.add('get');
        operations.add('create');
        operations.add('update');
        operations.add('delete');
      }

      // Generate endpoints based on operations
      if (operations.has('list')) {
        routeParts.push(generateListEndpoint(entity, entityPath, serviceName, this.options));
        routeParts.push('');
        endpoints.push({ entity: entity.name, method: 'GET', path: entityPath, operation: 'list' });
      }

      if (operations.has('get')) {
        routeParts.push(generateGetEndpoint(entity, entityPath, serviceName, this.options));
        routeParts.push('');
        endpoints.push({ entity: entity.name, method: 'GET', path: `${entityPath}/:id`, operation: 'get' });
      }

      if (operations.has('create')) {
        routeParts.push(generateCreateEndpoint(entity, entityPath, serviceName, this.options));
        routeParts.push('');
        endpoints.push({ entity: entity.name, method: 'POST', path: entityPath, operation: 'create' });
      }

      if (operations.has('update')) {
        routeParts.push(generateUpdateEndpoint(entity, entityPath, serviceName, this.options));
        routeParts.push('');
        endpoints.push({ entity: entity.name, method: 'PATCH', path: `${entityPath}/:id`, operation: 'update' });
      }

      if (operations.has('delete')) {
        routeParts.push(generateDeleteEndpoint(entity, entityPath, serviceName, this.options));
        routeParts.push('');
        endpoints.push({ entity: entity.name, method: 'DELETE', path: `${entityPath}/:id`, operation: 'delete' });
      }
    }

    // Export router
    routeParts.push('export default router;');

    // Generate service stub if requested
    let serviceCode: string | undefined;
    if (this.options.generateServiceStubs) {
      serviceCode = generateServiceStub(schema, this.options);
    }

    return {
      routeCode: routeParts.join('\n'),
      serviceCode,
      entities,
      endpoints,
      warnings,
    };
  }

  /**
   * Generate from SchemaParseResult (output of any infer-schema parser)
   */
  generateFromParseResult(result: SchemaParseResult): RouteGeneratorResult {
    return this.generate(result.schema);
  }

  /**
   * Generate and save to files
   */
  generateAndSave(
    schema: ConnectorSchema,
    routeOutputPath: string,
    serviceOutputPath?: string
  ): RouteGeneratorResult {
    const result = this.generate(schema);

    // Save routes
    const routeDir = path.dirname(routeOutputPath);
    if (!fs.existsSync(routeDir)) {
      fs.mkdirSync(routeDir, { recursive: true });
    }
    fs.writeFileSync(routeOutputPath, result.routeCode, 'utf8');

    // Save service stub if generated and path provided
    if (result.serviceCode && serviceOutputPath) {
      const serviceDir = path.dirname(serviceOutputPath);
      if (!fs.existsSync(serviceDir)) {
        fs.mkdirSync(serviceDir, { recursive: true });
      }
      fs.writeFileSync(serviceOutputPath, result.serviceCode, 'utf8');
    }

    return result;
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Generate routes from ConnectorSchema (convenience function)
 */
export function generateRoutes(
  schema: ConnectorSchema,
  options?: RouteGeneratorOptions
): string {
  const generator = new RouteGenerator(options);
  return generator.generate(schema).routeCode;
}

/**
 * Generate routes from SchemaParseResult
 */
export function generateRoutesFromParseResult(
  result: SchemaParseResult,
  options?: RouteGeneratorOptions
): string {
  const generator = new RouteGenerator(options);
  return generator.generateFromParseResult(result).routeCode;
}

/**
 * Generate and save routes to file
 */
export function generateAndSaveRoutes(
  schema: ConnectorSchema,
  routeOutputPath: string,
  serviceOutputPath?: string,
  options?: RouteGeneratorOptions
): RouteGeneratorResult {
  const generator = new RouteGenerator(options);
  return generator.generateAndSave(schema, routeOutputPath, serviceOutputPath);
}

/**
 * Load schema from file and generate routes
 */
export function generateRoutesFromFile(
  schemaPath: string,
  routeOutputPath?: string,
  serviceOutputPath?: string,
  options?: RouteGeneratorOptions
): RouteGeneratorResult {
  const content = fs.readFileSync(schemaPath, 'utf8');
  const schema = validateSchema(JSON.parse(content));

  const generator = new RouteGenerator(options);

  if (routeOutputPath) {
    return generator.generateAndSave(schema, routeOutputPath, serviceOutputPath);
  }

  return generator.generate(schema);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default RouteGenerator;
