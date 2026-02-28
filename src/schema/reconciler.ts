/**
 * Schema Reconciler
 *
 * LLM-powered merge of multiple ConnectorSchemas from different sources
 * into a single high-quality unified schema.
 *
 * 2-pass approach:
 *   Pass 1: Analyze + merge schemas from all sources
 *   Pass 2: Enrich with faker hints and validate
 *
 * @module schema/reconciler
 */

import Anthropic from '@anthropic-ai/sdk';
import logger from '../utils/logger';
import {
  ConnectorSchema,
  FieldDefinition,
  EntityDefinition,
  AuthConfig,
} from './connector-schema';
import { RawSourceSchema } from './sources/multi-source-fetcher';
import { getKeyEntitiesForCategory } from './sources/verticals';
import { CONNECTOR_TO_APIDECK_API } from './sources/registry';

// =============================================================================
// TYPES
// =============================================================================

export interface ReconciliationResult {
  schema: ConnectorSchema;
  sourcesUsed: string[];
  confidence: number;
  warnings: string[];
  metadata: {
    pass1DurationMs: number;
    pass2DurationMs: number;
    totalDurationMs: number;
    tokensUsed: number;
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_SCHEMA_CHARS = 40_000;

const SYSTEM_PROMPT = `You are an expert API schema architect specializing in enterprise SaaS integrations.
Your job is to analyze raw API schemas harvested from multiple public sources for a given connector,
and produce a single unified ConnectorSchema JSON object.

The output must conform to this TypeScript interface:
{
  name: string;           // lowercase connector name (e.g. "netsuite")
  version: "1.0.0";
  baseUrl: string;        // base API path (e.g. "/api/v2")
  auth: {
    type: "oauth2" | "apikey" | "tba" | "basic";
    fields: string[];     // required auth fields
    config?: {};           // additional auth config
  };
  entities: Array<{
    name: string;         // PascalCase entity name
    tableName: string;    // snake_case table name
    endpoints: Array<{
      method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
      path: string;
      operation: "list" | "get" | "create" | "update" | "delete" | "search";
    }>;
    fields: Array<{
      name: string;       // camelCase field name
      type: "string" | "number" | "boolean" | "date" | "datetime" | "json" | "uuid";
      required: boolean;
      unique?: boolean;
      faker?: string;     // e.g. "company.name", "finance.amount"
      enum?: string[];
      foreignKey?: { entity: string; field: string };
    }>;
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: "one-to-one" | "one-to-many" | "many-to-many";
    foreignKey: string;
  }>;
}

Rules:
1. MERGE conflicting field definitions — prefer the most specific/typed version
2. USE realistic field formats: dates as "datetime", monetary as "number", IDs as "string"
3. PRESERVE connector-specific terminology (e.g. NetSuite uses "tranId" not "transaction_id")
4. AUTH: reproduce the exact auth pattern the real connector uses
5. Set faker hints for data generation on every field where applicable
6. Mark required fields based on consensus across sources
7. OUTPUT: Return ONLY valid JSON. No markdown, no explanation, no code fences.`;

// =============================================================================
// FAKER HINT INFERENCE
// =============================================================================

/** Infer faker hint from field name and type */
function inferFakerHint(fieldName: string, fieldType: string): string | undefined {
  const name = fieldName.toLowerCase();

  // ID fields
  if (name === 'id' || name.endsWith('id') || name.endsWith('_id')) return 'string.uuid';

  // Name fields
  if (name === 'name' || name === 'fullname' || name === 'full_name') return 'person.fullName';
  if (name === 'firstname' || name === 'first_name') return 'person.firstName';
  if (name === 'lastname' || name === 'last_name') return 'person.lastName';
  if (name === 'companyname' || name === 'company_name' || name === 'company') return 'company.name';
  if (name === 'displayname' || name === 'display_name') return 'person.fullName';

  // Contact fields
  if (name === 'email' || name.includes('email')) return 'internet.email';
  if (name === 'phone' || name.includes('phone')) return 'phone.number';
  if (name === 'url' || name === 'website') return 'internet.url';

  // Address fields
  if (name.includes('address') || name === 'street') return 'location.streetAddress';
  if (name === 'city') return 'location.city';
  if (name === 'state') return 'location.state';
  if (name === 'country') return 'location.country';
  if (name === 'zip' || name === 'zipcode' || name === 'postalcode' || name === 'postal_code') return 'location.zipCode';

  // Financial fields
  if (name.includes('amount') || name.includes('total') || name.includes('price') || name.includes('balance')) return 'finance.amount';
  if (name.includes('currency') || name === 'currencycode') return 'finance.currencyCode';
  if (name.includes('account') && name.includes('number')) return 'finance.accountNumber';

  // Date fields
  if (fieldType === 'date' || fieldType === 'datetime') return 'date.recent';

  // Description / notes
  if (name === 'description' || name === 'notes' || name === 'memo') return 'lorem.sentence';

  // Status fields
  if (name === 'status' || name === 'state') return undefined; // usually enum

  // Boolean fields
  if (fieldType === 'boolean') return 'datatype.boolean';

  // Number fields
  if (name.includes('quantity') || name === 'qty') return 'number.int';
  if (name.includes('rate') || name.includes('percentage')) return 'number.float';

  return undefined;
}

// =============================================================================
// RECONCILER
// =============================================================================

/**
 * Reconcile multiple raw source schemas into a single ConnectorSchema.
 *
 * If only 1 source is available, performs a simpler single-source conversion.
 * If 2+ sources, uses LLM to intelligently merge.
 */
export async function reconcileSchemas(
  connector: string,
  rawSchemas: RawSourceSchema[],
  options: { apiKey?: string; verbose?: boolean } = {}
): Promise<ReconciliationResult> {
  const startTime = Date.now();
  const warnings: string[] = [];

  if (rawSchemas.length === 0) {
    throw new Error(`No source schemas available for ${connector}`);
  }

  // For a single source, do a direct conversion without LLM
  if (rawSchemas.length === 1) {
    const result = convertSingleSource(connector, rawSchemas[0]);
    return {
      schema: result,
      sourcesUsed: [rawSchemas[0].source],
      confidence: 0.6,
      warnings: ['Only one source available — reconciliation skipped'],
      metadata: {
        pass1DurationMs: Date.now() - startTime,
        pass2DurationMs: 0,
        totalDurationMs: Date.now() - startTime,
        tokensUsed: 0,
      },
    };
  }

  // Multi-source: use LLM reconciliation
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fall back to deterministic merge without LLM
    warnings.push('No ANTHROPIC_API_KEY — using deterministic merge instead of LLM reconciliation');
    const result = deterministicMerge(connector, rawSchemas);
    return {
      schema: result,
      sourcesUsed: rawSchemas.map((s) => s.source),
      confidence: 0.65,
      warnings,
      metadata: {
        pass1DurationMs: Date.now() - startTime,
        pass2DurationMs: 0,
        totalDurationMs: Date.now() - startTime,
        tokensUsed: 0,
      },
    };
  }

  const client = new Anthropic({ apiKey });
  let tokensUsed = 0;

  // Prepare source summary
  const sourceSummary = prepareSourceSummary(rawSchemas);

  // Get vertical context
  const apiCategory = CONNECTOR_TO_APIDECK_API[connector];
  const keyEntities = apiCategory ? getKeyEntitiesForCategory(apiCategory) : [];
  const verticalContext = keyEntities.length > 0
    ? `Key entities for this connector: ${keyEntities.join(', ')}`
    : '';

  // Pass 1: Merge and reconcile
  const pass1Start = Date.now();
  logger.info(`[reconciler] Pass 1: merging ${rawSchemas.length} sources for ${connector}`);

  const pass1Result = await llmCall(client, connector, sourceSummary, `
Analyze the schemas from all sources for the '${connector}' connector.
${verticalContext}
Produce a unified ConnectorSchema JSON with:
- All key entities merged and deduplicated
- Realistic field types with faker hints
- The correct auth scheme for this connector
- At minimum these operations per entity: list, get, create, update, delete
- Proper relationships between entities inferred from foreign key patterns
`);

  const pass1Duration = Date.now() - pass1Start;
  tokensUsed += pass1Result.tokensUsed;

  if (!pass1Result.parsed) {
    warnings.push('LLM reconciliation failed — falling back to deterministic merge');
    const result = deterministicMerge(connector, rawSchemas);
    return {
      schema: result,
      sourcesUsed: rawSchemas.map((s) => s.source),
      confidence: 0.5,
      warnings,
      metadata: {
        pass1DurationMs: pass1Duration,
        pass2DurationMs: 0,
        totalDurationMs: Date.now() - startTime,
        tokensUsed,
      },
    };
  }

  // Pass 2: Enrich with faker hints
  const pass2Start = Date.now();
  logger.info(`[reconciler] Pass 2: enriching with faker hints`);

  const pass2Result = await llmCall(
    client,
    connector,
    JSON.stringify(pass1Result.parsed, null, 2).slice(0, MAX_SCHEMA_CHARS),
    `
Review this ConnectorSchema for '${connector}' and:
1. Add faker hints to every field (e.g. "company.name", "finance.amount", "internet.email")
2. Ensure all field types are correct
3. Verify auth configuration matches the real ${connector} API
4. Add any missing relationships between entities
Return the complete improved schema as JSON only (ConnectorSchema format).
`
  );
  const pass2Duration = Date.now() - pass2Start;
  tokensUsed += pass2Result.tokensUsed;

  const finalSchema = (pass2Result.parsed || pass1Result.parsed) as ConnectorSchema;

  // Ensure minimum required fields
  if (!finalSchema.name) finalSchema.name = connector;
  if (!finalSchema.version) finalSchema.version = '1.0.0';
  if (!finalSchema.baseUrl) finalSchema.baseUrl = '/api/v1';
  if (!finalSchema.auth) {
    finalSchema.auth = { type: 'oauth2', fields: ['clientId', 'clientSecret'] };
  }
  if (!finalSchema.entities || !Array.isArray(finalSchema.entities)) {
    finalSchema.entities = [];
  }
  if (!finalSchema.relationships) {
    finalSchema.relationships = [];
  }

  // Normalize entity structure to satisfy Zod validation
  const VALID_FIELD_TYPES = ['string', 'number', 'boolean', 'date', 'datetime', 'json', 'uuid'];
  for (const entity of finalSchema.entities) {
    // Ensure tableName
    if (!entity.tableName) {
      entity.tableName = `${connector}_${toSnakeCase(entity.name)}`;
    }
    // Ensure endpoints exist — add default CRUD if missing
    if (!entity.endpoints || entity.endpoints.length === 0) {
      const basePath = `/${entity.name.toLowerCase()}`;
      entity.endpoints = [
        { method: 'GET', path: basePath, operation: 'list' },
        { method: 'GET', path: `${basePath}/:id`, operation: 'get' },
        { method: 'POST', path: basePath, operation: 'create' },
        { method: 'PATCH', path: `${basePath}/:id`, operation: 'update' },
        { method: 'DELETE', path: `${basePath}/:id`, operation: 'delete' },
      ];
    }
    // Ensure fields have valid types and required flag
    for (const field of entity.fields || []) {
      if (!VALID_FIELD_TYPES.includes(field.type)) field.type = 'string' as FieldDefinition['type'];
      if (field.required === undefined) field.required = false;
    }
  }
  // Remove entities that still have no fields
  finalSchema.entities = finalSchema.entities.filter(e => e.fields?.length > 0);
  // Ensure auth.fields has at least 1 item
  if (!finalSchema.auth.fields || finalSchema.auth.fields.length === 0) {
    finalSchema.auth.fields = ['clientId', 'clientSecret'];
  }

  // Normalize relationship types to valid enum values
  // LLM may produce types like "many-to-one" that aren't in the Zod enum
  const VALID_REL_TYPES = new Set(['one-to-one', 'one-to-many', 'many-to-many']);
  for (const rel of finalSchema.relationships) {
    const relType = rel.type as string;
    if (!VALID_REL_TYPES.has(relType)) {
      rel.type = 'one-to-many';
    }
  }

  // Apply faker hints to any fields that are still missing them
  for (const entity of finalSchema.entities) {
    for (const field of entity.fields) {
      if (!field.faker) {
        field.faker = inferFakerHint(field.name, field.type);
      }
    }
  }

  return {
    schema: finalSchema,
    sourcesUsed: rawSchemas.map((s) => s.source),
    confidence: rawSchemas.length >= 3 ? 0.85 : 0.75,
    warnings,
    metadata: {
      pass1DurationMs: pass1Duration,
      pass2DurationMs: pass2Duration,
      totalDurationMs: Date.now() - startTime,
      tokensUsed,
    },
  };
}

// =============================================================================
// LLM CALL
// =============================================================================

async function llmCall(
  client: Anthropic,
  connector: string,
  sourceContext: string,
  instruction: string
): Promise<{ parsed: unknown; tokensUsed: number }> {
  const prompt = `Connector: ${connector}\n\nSource schemas:\n${sourceContext.slice(0, MAX_SCHEMA_CHARS)}\n\nTask: ${instruction}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const tokensUsed =
      (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    let raw =
      response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Strip markdown fences
    if (raw.startsWith('```')) {
      raw = raw.split('```')[1];
      if (raw.startsWith('json')) raw = raw.slice(4);
    }
    raw = raw.replace(/```$/g, '').trim();

    const parsed = JSON.parse(raw);
    return { parsed, tokensUsed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[reconciler] LLM call failed: ${msg}`);
    return { parsed: null, tokensUsed: 0 };
  }
}

// =============================================================================
// SOURCE SUMMARY
// =============================================================================

function prepareSourceSummary(rawSchemas: RawSourceSchema[]): string {
  const parts = rawSchemas.map((schema) => ({
    source: schema.source,
    schemas_available: Object.keys(schema.schemas).slice(0, 30),
    paths_available: Object.keys(schema.paths).slice(0, 20),
    auth_types: Object.keys(schema.authSchemes),
    sample_schema: sampleSchemas(schema.schemas, 3),
  }));
  return JSON.stringify(parts, null, 2);
}

function sampleSchemas(schemas: Record<string, unknown>, count: number): Record<string, unknown> {
  const sample: Record<string, unknown> = {};
  let i = 0;
  for (const [k, v] of Object.entries(schemas)) {
    if (i >= count) break;
    sample[k] = v;
    i++;
  }
  return sample;
}

// =============================================================================
// SINGLE SOURCE CONVERSION
// =============================================================================

/**
 * Convert a single RawSourceSchema to ConnectorSchema without LLM.
 * Best-effort extraction from OpenAPI-like structure.
 */
function convertSingleSource(connector: string, raw: RawSourceSchema): ConnectorSchema {
  const entities: EntityDefinition[] = [];
  const entityNames = new Set<string>();

  // Extract entities from schemas
  for (const [schemaName, schemaDef] of Object.entries(raw.schemas)) {
    const schema = schemaDef as Record<string, unknown>;
    if (schema.type !== 'object' || !schema.properties) continue;

    const entityName = toPascalCase(schemaName);
    if (entityNames.has(entityName)) continue;
    entityNames.add(entityName);

    const properties = schema.properties as Record<string, Record<string, unknown>>;
    const requiredFields = (schema.required as string[]) || [];

    const fields: FieldDefinition[] = Object.entries(properties).map(
      ([fieldName, fieldDef]) => {
        const type = mapOpenApiType(fieldDef.type as string, fieldDef.format as string);
        return {
          name: toCamelCase(fieldName),
          type,
          required: requiredFields.includes(fieldName),
          faker: inferFakerHint(fieldName, type),
          ...(fieldDef.enum ? { enum: fieldDef.enum as string[] } : {}),
        };
      }
    );

    // Build endpoints from paths
    const endpoints = buildEndpoints(entityName, raw.paths);

    if (fields.length > 0 && endpoints.length > 0) {
      entities.push({
        name: entityName,
        tableName: `${connector}_${toSnakeCase(schemaName)}`,
        endpoints,
        fields,
      });
    }
  }

  // Infer auth
  const auth = inferAuth(raw.authSchemes, connector);

  // Infer relationships
  const relationships = inferRelationships(entities);

  return {
    name: connector,
    version: '1.0.0',
    baseUrl: '/api/v1',
    auth,
    entities,
    relationships,
  };
}

// =============================================================================
// DETERMINISTIC MERGE
// =============================================================================

/**
 * Merge multiple raw schemas without LLM — union of all entities and fields.
 */
function deterministicMerge(connector: string, rawSchemas: RawSourceSchema[]): ConnectorSchema {
  const entityMap = new Map<string, { fields: Map<string, FieldDefinition>; paths: Record<string, unknown> }>();

  for (const raw of rawSchemas) {
    for (const [schemaName, schemaDef] of Object.entries(raw.schemas)) {
      const schema = schemaDef as Record<string, unknown>;
      if (schema.type !== 'object' || !schema.properties) continue;

      const entityName = toPascalCase(schemaName);
      if (!entityMap.has(entityName)) {
        entityMap.set(entityName, { fields: new Map(), paths: {} });
      }

      const entity = entityMap.get(entityName)!;
      const properties = schema.properties as Record<string, Record<string, unknown>>;
      const requiredFields = (schema.required as string[]) || [];

      for (const [fieldName, fieldDef] of Object.entries(properties)) {
        const camelName = toCamelCase(fieldName);
        if (!entity.fields.has(camelName)) {
          const type = mapOpenApiType(fieldDef.type as string, fieldDef.format as string);
          entity.fields.set(camelName, {
            name: camelName,
            type,
            required: requiredFields.includes(fieldName),
            faker: inferFakerHint(fieldName, type),
            ...(fieldDef.enum ? { enum: fieldDef.enum as string[] } : {}),
          });
        }
      }

      // Merge paths
      Object.assign(entity.paths, raw.paths);
    }
  }

  const entities: EntityDefinition[] = [];
  for (const [entityName, data] of entityMap.entries()) {
    const endpoints = buildEndpoints(entityName, data.paths);
    if (data.fields.size > 0 && endpoints.length > 0) {
      entities.push({
        name: entityName,
        tableName: `${connector}_${toSnakeCase(entityName)}`,
        endpoints,
        fields: [...data.fields.values()],
      });
    }
  }

  // Use auth from first source that has it
  let auth: AuthConfig = { type: 'oauth2', fields: ['clientId', 'clientSecret'] };
  for (const raw of rawSchemas) {
    if (Object.keys(raw.authSchemes).length > 0) {
      auth = inferAuth(raw.authSchemes, connector);
      break;
    }
  }

  return {
    name: connector,
    version: '1.0.0',
    baseUrl: '/api/v1',
    auth,
    entities,
    relationships: inferRelationships(entities),
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function mapOpenApiType(openApiType: string | undefined, format?: string): FieldDefinition['type'] {
  if (!openApiType) return 'string';
  switch (openApiType) {
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'string':
      if (format === 'date') return 'date';
      if (format === 'date-time') return 'datetime';
      if (format === 'uuid') return 'uuid';
      return 'string';
    case 'object':
      return 'json';
    case 'array':
      return 'json';
    default:
      return 'string';
  }
}

function buildEndpoints(
  entityName: string,
  paths: Record<string, unknown>
): EntityDefinition['endpoints'] {
  const entityLower = entityName.toLowerCase();
  const endpoints: EntityDefinition['endpoints'] = [];

  // Try to find matching paths
  for (const [pathStr, methods] of Object.entries(paths)) {
    if (!pathStr.toLowerCase().includes(entityLower)) continue;
    const ops = methods as Record<string, unknown>;

    for (const method of Object.keys(ops)) {
      const httpMethod = method.toUpperCase() as 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
      const hasIdParam = pathStr.includes('{') || pathStr.includes(':');

      let operation: EntityDefinition['endpoints'][0]['operation'];
      if (httpMethod === 'GET' && !hasIdParam) operation = 'list';
      else if (httpMethod === 'GET' && hasIdParam) operation = 'get';
      else if (httpMethod === 'POST') operation = 'create';
      else if (httpMethod === 'PATCH' || httpMethod === 'PUT') operation = 'update';
      else if (httpMethod === 'DELETE') operation = 'delete';
      else continue;

      endpoints.push({ method: httpMethod, path: pathStr, operation });
    }
  }

  // Generate default CRUD endpoints if none found from paths
  if (endpoints.length === 0) {
    const basePath = `/${entityLower}`;
    endpoints.push(
      { method: 'GET', path: basePath, operation: 'list' },
      { method: 'GET', path: `${basePath}/:id`, operation: 'get' },
      { method: 'POST', path: basePath, operation: 'create' },
      { method: 'PATCH', path: `${basePath}/:id`, operation: 'update' },
      { method: 'DELETE', path: `${basePath}/:id`, operation: 'delete' }
    );
  }

  return endpoints;
}

function inferAuth(authSchemes: Record<string, unknown>, connector: string): AuthConfig {
  for (const [, scheme] of Object.entries(authSchemes)) {
    const s = scheme as Record<string, unknown>;
    const type = (s.type as string || '').toLowerCase();

    if (type === 'oauth2') {
      return { type: 'oauth2', fields: ['clientId', 'clientSecret', 'tokenUrl'] };
    }
    if (type === 'apikey' || type === 'apiKey') {
      return { type: 'apikey', fields: ['apiKey'] };
    }
    if (type === 'http' && s.scheme === 'basic') {
      return { type: 'basic', fields: ['username', 'password'] };
    }
  }

  // Default based on connector conventions
  if (['netsuite'].includes(connector)) {
    return { type: 'tba', fields: ['consumerKey', 'consumerSecret', 'tokenId', 'tokenSecret', 'accountId'] };
  }
  return { type: 'oauth2', fields: ['clientId', 'clientSecret'] };
}

function inferRelationships(entities: EntityDefinition[]): ConnectorSchema['relationships'] {
  const relationships: ConnectorSchema['relationships'] = [];
  const entityNames = new Set(entities.map((e) => e.name.toLowerCase()));

  for (const entity of entities) {
    for (const field of entity.fields) {
      // Detect foreign keys by naming convention: *Id, *_id
      const match = field.name.match(/^(.+?)(?:Id|_id)$/i);
      if (match) {
        const refName = toPascalCase(match[1]);
        if (entityNames.has(refName.toLowerCase()) && refName !== entity.name) {
          // Set foreign key on the field
          field.foreignKey = { entity: refName, field: 'id' };

          relationships.push({
            from: entity.name,
            to: refName,
            type: 'one-to-many',
            foreignKey: field.name,
          });
        }
      }
    }
  }

  return relationships;
}

function toPascalCase(str: string): string {
  return str
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase();
}
