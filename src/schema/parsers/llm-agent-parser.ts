/**
 * LLM Agent Parser
 *
 * Agentic LLM parser that iteratively explores a document using workspace tools
 * and self-validates. Layer 2 of the self-healing pipeline.
 *
 * Uses Anthropic tool_use to give the LLM 4 workspace tools for navigating
 * the document, then loops until a valid ConnectorSchema is produced or
 * the budget is exhausted.
 *
 * @module llm-agent-parser
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  ConnectorSchema,
  ConnectorSchemaSchema,
  FieldType,
  HttpMethod,
  Operation,
  RelationshipType,
} from '../connector-schema';
import config from '../../config';

// =============================================================================
// TYPES
// =============================================================================

export interface LLMAgentParserOptions {
  /** Anthropic API key */
  apiKey?: string;
  /** Model to use */
  model?: string;
  /** Max agentic iterations (each = 1 API round-trip) */
  maxIterations?: number;
  /** Total token budget across all iterations */
  maxTokens?: number;
  /** Wall-clock timeout in ms */
  timeoutMs?: number;
  /** Connector name */
  name?: string;
  /** Base URL for endpoints */
  baseUrl?: string;
  /** Table prefix for database tables */
  tablePrefix?: string;
  /** Enable verbose logging */
  verbose?: boolean;
}

export interface LLMAgentParseResult {
  schema: ConnectorSchema;
  confidence: number;
  warnings: string[];
  metadata: {
    model: string;
    tokensUsed: number;
    iterations: number;
    inferenceTime: number;
    toolCalls: number;
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_MAX_TOKENS = 30_000;
const DEFAULT_TIMEOUT_MS = 60_000;
const QUERY_SECTION_MAX_BYTES = 1024;
const LIST_KEYS_MAX_BYTES = 512;

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_summary',
    description:
      'Get a pre-computed structural summary of the entire document (~3KB). Use this first to understand the document layout before drilling into specific sections.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'query_section',
    description:
      'Retrieve the content at a specific JSON path in the document. Use dot notation for nested paths (e.g., "resources.files.methods"). Returns up to 1KB of content at that path, truncated if larger.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Dot-notation path to the section (e.g., "schemas.File", "resources.files.methods.list")',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_keys',
    description:
      'List the key names at a specific path in the document. Use this to discover what sections exist without retrieving their full content. Returns key names up to the specified depth.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Dot-notation path to list keys at (e.g., "schemas", "resources"). Use empty string for root.',
        },
        depth: {
          type: 'number',
          description: 'How many levels deep to list (default 1, max 2)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'validate_schema',
    description:
      'Validate a ConnectorSchema object against the Zod schema. Returns validation result with specific error messages if invalid. Use this before returning your final answer to ensure correctness.',
    input_schema: {
      type: 'object' as const,
      properties: {
        schema: {
          type: 'object',
          description: 'The ConnectorSchema object to validate',
        },
      },
      required: ['schema'],
    },
  },
];

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

const SYSTEM_PROMPT = `You are an expert API schema analyst. Your task is to extract a ConnectorSchema from an API documentation document that is NOT an OpenAPI specification.

You have 4 tools to explore the document:
1. get_summary - See the full document structure (use this FIRST)
2. list_keys - Discover what keys exist at a path
3. query_section - Read specific sections in detail
4. validate_schema - Validate your extracted schema

Your workflow:
1. Call get_summary to understand the document structure
2. Use list_keys and query_section to find API resources, methods, parameters, and schemas
3. Extract entities with their fields, endpoints, and relationships
4. Call validate_schema to check your result
5. If validation fails, fix the errors and validate again
6. Output the final valid JSON schema in a text response

The output ConnectorSchema must have this structure:
{
  "name": "string (lowercase_snake_case, e.g., 'google_drive')",
  "version": "1.0.0",
  "baseUrl": "string (e.g., '/api/google-drive')",
  "auth": {
    "type": "oauth2" | "apikey" | "basic" | "tba",
    "fields": ["string array"],
    "config": {}
  },
  "entities": [
    {
      "name": "PascalCase singular (e.g., 'File')",
      "tableName": "prefix_files (snake_case plural)",
      "endpoints": [
        { "method": "GET|POST|PATCH|PUT|DELETE", "path": "/resource", "operation": "list|get|create|update|delete|search" }
      ],
      "fields": [
        { "name": "camelCase", "type": "string|number|boolean|date|datetime|json|uuid", "required": true/false, "unique": true/false, "faker": "faker.method" }
      ]
    }
  ],
  "relationships": [
    { "from": "Entity", "to": "Entity", "type": "one-to-one|one-to-many|many-to-many", "foreignKey": "fieldName" }
  ]
}

Rules:
- Every entity MUST have an "id" field (type: uuid, required: true, unique: true)
- Include standard CRUD endpoints (list, get, create, update, delete) where the API supports them
- Use appropriate Faker.js methods for synthetic data hints
- Infer relationships from field names ending in "Id"
- Extract at least the 5 most important entities from the API
- Table names must use the connector prefix (e.g., "google_drive_files")`;

// =============================================================================
// TOOL EXECUTION
// =============================================================================

function getAtPath(obj: object, dotPath: string): unknown {
  if (!dotPath || dotPath === '') return obj;

  const parts = dotPath.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function truncateJSON(value: unknown, maxBytes: number): string {
  const full = JSON.stringify(value, null, 2);
  if (full.length <= maxBytes) return full;
  return full.slice(0, maxBytes) + '\n... (truncated)';
}

function listKeysAtPath(obj: object, dotPath: string, depth: number): string {
  const target = dotPath ? getAtPath(obj, dotPath) : obj;
  if (!target || typeof target !== 'object') {
    return `No object found at path "${dotPath}"`;
  }

  const lines: string[] = [];

  function walk(node: unknown, indent: number, currentDepth: number): void {
    if (currentDepth > depth || !node || typeof node !== 'object') return;

    const keys = Object.keys(node as Record<string, unknown>);
    for (const key of keys) {
      const value = (node as Record<string, unknown>)[key];
      const type = Array.isArray(value)
        ? `[Array: ${value.length}]`
        : typeof value === 'object' && value !== null
          ? `{${Object.keys(value).length} keys}`
          : typeof value;
      lines.push(`${'  '.repeat(indent)}${key}: ${type}`);

      if (currentDepth < depth && typeof value === 'object' && value !== null && !Array.isArray(value)) {
        walk(value, indent + 1, currentDepth + 1);
      }
    }
  }

  walk(target, 0, 1);

  const result = lines.join('\n');
  if (result.length > LIST_KEYS_MAX_BYTES) {
    return result.slice(0, LIST_KEYS_MAX_BYTES) + '\n... (truncated)';
  }
  return result;
}

function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  document: object,
  contentSummary: string
): string {
  switch (toolName) {
    case 'get_summary':
      return contentSummary;

    case 'query_section': {
      const path = (toolInput.path as string) || '';
      const value = getAtPath(document, path);
      if (value === undefined) {
        return `No content found at path "${path}". Try list_keys to see available paths.`;
      }
      return truncateJSON(value, QUERY_SECTION_MAX_BYTES);
    }

    case 'list_keys': {
      const path = (toolInput.path as string) || '';
      const depth = Math.min((toolInput.depth as number) || 1, 2);
      return listKeysAtPath(document, path, depth);
    }

    case 'validate_schema': {
      const schema = toolInput.schema;
      if (!schema || typeof schema !== 'object') {
        return JSON.stringify({ valid: false, errors: ['Input must be an object'] });
      }

      const result = ConnectorSchemaSchema.safeParse(schema);
      if (result.success) {
        return JSON.stringify({ valid: true, errors: [] });
      }

      const errors = result.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`
      );
      return JSON.stringify({ valid: false, errors });
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

// =============================================================================
// SCHEMA SANITIZATION (reused logic from llm-inference-parser.ts)
// =============================================================================

function sanitizeSchema(raw: unknown, name?: string, baseUrl?: string, tablePrefix?: string): ConnectorSchema {
  const obj = raw as Record<string, unknown>;

  if (!obj.name || typeof obj.name !== 'string') {
    obj.name = name || 'inferred_api';
  }
  if (name) obj.name = name;

  if (!obj.version || typeof obj.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(obj.version as string)) {
    obj.version = '1.0.0';
  }

  if (!obj.baseUrl || typeof obj.baseUrl !== 'string') {
    obj.baseUrl = baseUrl || '/api';
  }
  if (baseUrl) obj.baseUrl = baseUrl;

  // Fix auth
  if (!obj.auth || typeof obj.auth !== 'object') {
    obj.auth = { type: 'oauth2', fields: ['client_id', 'client_secret'] };
  }
  const auth = obj.auth as Record<string, unknown>;
  if (!['oauth2', 'apikey', 'basic', 'tba'].includes(auth.type as string)) {
    auth.type = 'oauth2';
  }
  if (!Array.isArray(auth.fields) || auth.fields.length === 0) {
    auth.fields = auth.type === 'oauth2' ? ['client_id', 'client_secret'] : ['api_key'];
  }

  // Fix entities
  if (!Array.isArray(obj.entities)) {
    obj.entities = [];
  }

  const validFieldTypes: FieldType[] = ['string', 'number', 'boolean', 'date', 'datetime', 'json', 'uuid'];
  const validMethods: HttpMethod[] = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
  const validOps: Operation[] = ['list', 'get', 'create', 'update', 'delete', 'search'];
  const validRelTypes: RelationshipType[] = ['one-to-one', 'one-to-many', 'many-to-many'];

  const prefix = tablePrefix || obj.name;

  const entities = obj.entities as Array<Record<string, unknown>>;
  for (const entity of entities) {
    if (!entity.name || typeof entity.name !== 'string') {
      entity.name = 'UnknownEntity';
    }

    if (!entity.tableName || typeof entity.tableName !== 'string') {
      const snakeName = (entity.name as string)
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '');
      entity.tableName = `${prefix}_${snakeName}s`;
    }

    // Ensure table prefix
    if (tablePrefix && !(entity.tableName as string).startsWith(tablePrefix)) {
      const snakeName = (entity.name as string)
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '');
      entity.tableName = `${tablePrefix}${snakeName}s`;
    }

    if (!Array.isArray(entity.endpoints)) {
      entity.endpoints = [];
    }

    if (!Array.isArray(entity.fields)) {
      entity.fields = [];
    }

    // Ensure id field
    const fields = entity.fields as Array<Record<string, unknown>>;
    const hasId = fields.some((f) => f.name === 'id');
    if (!hasId) {
      fields.unshift({
        name: 'id',
        type: 'uuid',
        required: true,
        unique: true,
        faker: 'string.uuid',
      });
    }

    for (const field of fields) {
      if (!field.name || typeof field.name !== 'string') field.name = 'unknownField';
      if (!validFieldTypes.includes(field.type as FieldType)) field.type = 'string';
      if (typeof field.required !== 'boolean') field.required = false;
    }

    const endpoints = entity.endpoints as Array<Record<string, unknown>>;
    for (const ep of endpoints) {
      if (!validMethods.includes(ep.method as HttpMethod)) ep.method = 'GET';
      if (!validOps.includes(ep.operation as Operation)) ep.operation = 'get';
      if (!ep.path || typeof ep.path !== 'string') {
        ep.path = `/${(entity.name as string).toLowerCase()}s`;
      }
    }

    // Ensure at least list + get endpoints
    if (endpoints.length === 0) {
      const pluralName = (entity.name as string).toLowerCase() + 's';
      endpoints.push(
        { method: 'GET', path: `/${pluralName}`, operation: 'list' },
        { method: 'GET', path: `/${pluralName}/:id`, operation: 'get' },
        { method: 'POST', path: `/${pluralName}`, operation: 'create' },
        { method: 'PATCH', path: `/${pluralName}/:id`, operation: 'update' },
        { method: 'DELETE', path: `/${pluralName}/:id`, operation: 'delete' }
      );
    }
  }

  // Fix relationships
  if (!Array.isArray(obj.relationships)) {
    obj.relationships = [];
  }

  const relationships = obj.relationships as Array<Record<string, unknown>>;
  for (const rel of relationships) {
    if (!rel.from || typeof rel.from !== 'string') rel.from = 'Unknown';
    if (!rel.to || typeof rel.to !== 'string') rel.to = 'Unknown';
    if (!validRelTypes.includes(rel.type as RelationshipType)) rel.type = 'one-to-many';
    if (!rel.foreignKey || typeof rel.foreignKey !== 'string') {
      rel.foreignKey = `${(rel.to as string).charAt(0).toLowerCase() + (rel.to as string).slice(1)}Id`;
    }
  }

  return obj as unknown as ConnectorSchema;
}

// =============================================================================
// JSON EXTRACTION (reused from llm-inference-parser.ts)
// =============================================================================

function extractJSON(response: string): string {
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return response.trim();
}

// =============================================================================
// CONFIDENCE CALCULATION
// =============================================================================

function calculateConfidence(schema: ConnectorSchema): number {
  let score = 0;
  let maxScore = 0;

  // Has entities
  maxScore += 20;
  if (schema.entities.length > 0) score += 20;

  // Entities have fields
  maxScore += 20;
  const entitiesWithFields = schema.entities.filter((e) => e.fields.length > 1);
  score += Math.min(20, (entitiesWithFields.length / Math.max(1, schema.entities.length)) * 20);

  // Entities have endpoints
  maxScore += 20;
  const entitiesWithEndpoints = schema.entities.filter((e) => e.endpoints.length > 0);
  score += Math.min(20, (entitiesWithEndpoints.length / Math.max(1, schema.entities.length)) * 20);

  // Has relationships
  maxScore += 15;
  if (schema.relationships.length > 0) score += 15;

  // Fields have faker hints
  maxScore += 15;
  const allFields = schema.entities.flatMap((e) => e.fields);
  const fieldsWithFaker = allFields.filter((f) => f.faker);
  score += Math.min(15, (fieldsWithFaker.length / Math.max(1, allFields.length)) * 15);

  // Auth configured
  maxScore += 10;
  if (schema.auth.type && schema.auth.fields.length > 0) score += 10;

  return Math.round((score / maxScore) * 100) / 100;
}

// =============================================================================
// MAIN PARSER CLASS
// =============================================================================

export class LLMAgentParser {
  private client: Anthropic;
  private model: string;
  private maxIterations: number;
  private maxTokens: number;
  private timeoutMs: number;
  private verbose: boolean;
  private name?: string;
  private baseUrl?: string;
  private tablePrefix?: string;

  constructor(options: LLMAgentParserOptions = {}) {
    const apiKey = options.apiKey || config.dataGeneration.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';

    if (!apiKey) {
      throw new Error(
        'Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable or pass apiKey option.'
      );
    }

    this.client = new Anthropic({ apiKey });
    this.model = options.model || DEFAULT_MODEL;
    this.maxIterations = options.maxIterations || DEFAULT_MAX_ITERATIONS;
    this.maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.verbose = options.verbose || false;
    this.name = options.name;
    this.baseUrl = options.baseUrl;
    this.tablePrefix = options.tablePrefix;
  }

  /**
   * Parse a ConnectorSchema from pre-fetched document content using an agentic LLM loop.
   */
  async parseFromContent(
    parsedContent: object,
    contentSummary: string,
    options?: LLMAgentParserOptions
  ): Promise<LLMAgentParseResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    let totalTokensUsed = 0;
    let totalToolCalls = 0;
    let iterations = 0;

    const name = options?.name || this.name;
    const baseUrl = options?.baseUrl || this.baseUrl;
    const tablePrefix = options?.tablePrefix || this.tablePrefix;

    // Build initial messages
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `Analyze this API documentation and extract a ConnectorSchema.

Connector name: ${name || 'inferred from document'}
Base URL: ${baseUrl || 'infer from document'}
Table prefix: ${tablePrefix || name || 'infer from name'}

Here's a preview of the document structure:
${contentSummary.slice(0, 1500)}

Start by calling get_summary to see the full structure, then explore the document to extract entities, fields, endpoints, and relationships. When done, validate your schema and output the final JSON.`,
      },
    ];

    const deadline = Date.now() + this.timeoutMs;
    let bestAttempt: ConnectorSchema | null = null;

    // Agent loop
    while (iterations < this.maxIterations && totalTokensUsed < this.maxTokens && Date.now() < deadline) {
      iterations++;

      if (this.verbose) {
        console.log(`  [LLM Agent] Iteration ${iterations}/${this.maxIterations}, tokens: ${totalTokensUsed}/${this.maxTokens}`);
      }

      let response: Anthropic.Message;
      try {
        response = await this.client.messages.create({
          model: this.model,
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          tools: TOOLS,
          messages,
        });
      } catch (error) {
        if (error instanceof Anthropic.RateLimitError) {
          warnings.push('Rate limited, waiting 5s before retry');
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        throw error;
      }

      // Track token usage
      totalTokensUsed += response.usage.input_tokens + response.usage.output_tokens;

      // Process response blocks
      const hasToolUse = response.content.some((block) => block.type === 'tool_use');

      if (hasToolUse) {
        // Append assistant message
        messages.push({ role: 'assistant', content: response.content });

        // Execute tool calls and collect results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === 'tool_use') {
            totalToolCalls++;
            const result = executeToolCall(
              block.name,
              block.input as Record<string, unknown>,
              parsedContent,
              contentSummary
            );

            if (this.verbose) {
              console.log(`    Tool: ${block.name} → ${result.slice(0, 80)}...`);
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        // Append tool results
        messages.push({ role: 'user', content: toolResults });
      } else {
        // No tool use — the model is returning its final answer
        const textBlock = response.content.find((block) => block.type === 'text');
        if (textBlock && textBlock.type === 'text') {
          const jsonText = extractJSON(textBlock.text);
          try {
            const rawSchema = JSON.parse(jsonText);
            const sanitized = sanitizeSchema(rawSchema, name, baseUrl, tablePrefix);

            // Validate
            const validation = ConnectorSchemaSchema.safeParse(sanitized);
            if (validation.success) {
              bestAttempt = validation.data;
              break;
            }

            // Validation failed — feed errors back
            const errors = validation.error.issues.map(
              (i) => `${i.path.join('.')}: ${i.message}`
            );
            warnings.push(`Validation failed on iteration ${iterations}: ${errors.join('; ')}`);
            bestAttempt = sanitized;

            // Give the model another chance
            messages.push({ role: 'assistant', content: response.content });
            messages.push({
              role: 'user',
              content: `The schema has validation errors:\n${errors.join('\n')}\n\nPlease fix these issues and return the corrected JSON schema.`,
            });
          } catch (parseError) {
            warnings.push(`JSON parse error on iteration ${iterations}: ${(parseError as Error).message}`);

            // Ask model to fix
            messages.push({ role: 'assistant', content: response.content });
            messages.push({
              role: 'user',
              content: 'Your response was not valid JSON. Please return only the JSON schema object.',
            });
          }
        }

        // If stop_reason is end_turn and we already have bestAttempt, break
        if (response.stop_reason === 'end_turn' && bestAttempt) {
          break;
        }
      }
    }

    // Budget exhaustion
    if (!bestAttempt) {
      throw new Error(
        `LLM Agent failed to produce a valid schema after ${iterations} iterations (${totalTokensUsed} tokens used)`
      );
    }

    const confidence = calculateConfidence(bestAttempt);
    const inferenceTime = Date.now() - startTime;

    if (this.verbose) {
      console.log(`  [LLM Agent] Done: ${bestAttempt.entities.length} entities, confidence=${confidence}, ${totalTokensUsed} tokens, ${iterations} iterations`);
    }

    return {
      schema: bestAttempt,
      confidence,
      warnings,
      metadata: {
        model: this.model,
        tokensUsed: totalTokensUsed,
        iterations,
        inferenceTime,
        toolCalls: totalToolCalls,
      },
    };
  }
}
