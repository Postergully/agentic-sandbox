/**
 * LLM Inference Parser
 *
 * Uses Claude Haiku API to infer ConnectorSchema from unstructured
 * API documentation, natural language descriptions, or partial specifications.
 *
 * @module llm-inference-parser
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  ConnectorSchema,
  FieldType,
  HttpMethod,
  Operation,
  RelationshipType,
  validateSchema,
  SchemaValidationError,
} from '../connector-schema';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of LLM inference
 */
export interface LLMInferenceResult {
  schema: ConnectorSchema;
  confidence: number;
  warnings: string[];
  metadata: {
    model: string;
    tokensUsed: number;
    inferenceTime: number;
  };
}

/**
 * Parser options
 */
export interface LLMInferenceParserOptions {
  /** Anthropic API key (defaults to ANTHROPIC_API_KEY env var) */
  apiKey?: string;
  /** Model to use (defaults to claude-3-haiku-20240307) */
  model?: string;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Connector name override */
  name?: string;
  /** Base URL for endpoints */
  baseUrl?: string;
  /** Table name prefix */
  tablePrefix?: string;
  /** Maximum retries on rate limit */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
}

/**
 * Input types for inference
 */
export type InferenceInput =
  | { type: 'url'; value: string }
  | { type: 'text'; value: string }
  | { type: 'json'; value: object }
  | { type: 'description'; value: string };

// =============================================================================
// PROMPTS
// =============================================================================

const SYSTEM_PROMPT = `You are an expert API schema analyst. Your task is to analyze API documentation, sample responses, or descriptions and extract a structured ConnectorSchema.

You MUST respond with valid JSON only. No explanations, no markdown code blocks, just the raw JSON object.

The output schema must follow this exact structure:

{
  "name": "string (lowercase, snake_case)",
  "version": "string (semver like 1.0.0)",
  "baseUrl": "string (API base path like /api/v1)",
  "auth": {
    "type": "oauth2" | "apikey" | "basic" | "tba",
    "fields": ["string array of required auth fields"],
    "config": { "optional object with auth config" }
  },
  "entities": [
    {
      "name": "string (PascalCase entity name)",
      "tableName": "string (snake_case with prefix)",
      "endpoints": [
        {
          "method": "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
          "path": "string (path with :param for params)",
          "operation": "list" | "get" | "create" | "update" | "delete" | "search"
        }
      ],
      "fields": [
        {
          "name": "string (camelCase field name)",
          "type": "string" | "number" | "boolean" | "date" | "datetime" | "json" | "uuid",
          "required": boolean,
          "unique": boolean (optional),
          "faker": "string (optional, Faker.js method like 'internet.email')",
          "enum": ["optional", "array", "of", "values"],
          "foreignKey": { "entity": "EntityName", "field": "fieldName" } (optional)
        }
      ]
    }
  ],
  "relationships": [
    {
      "from": "EntityName",
      "to": "EntityName",
      "type": "one-to-one" | "one-to-many" | "many-to-many",
      "foreignKey": "fieldName"
    }
  ]
}

Key rules:
1. Always include an 'id' field (type: uuid, required: true, unique: true) for each entity
2. Infer relationships from field names ending in 'Id' or '_id'
3. Use appropriate Faker.js methods for data generation hints
4. The 'name' should be lowercase snake_case (e.g., 'hubspot_crm')
5. Entity names should be PascalCase singular (e.g., 'Customer', not 'Customers')
6. Table names should be snake_case with connector prefix (e.g., 'hubspot_customers')
7. Infer auth type from context (OAuth2 for enterprise APIs, apikey for simple APIs)
8. Include standard CRUD endpoints for each entity`;

const ENTITY_EXTRACTION_PROMPT = `Analyze the following API documentation or sample data and extract all entities, their fields, endpoints, and relationships.

INPUT:
{{INPUT}}

Remember:
- Extract ALL entities mentioned, even if partially described
- Infer field types from names and example values
- Detect relationships from foreign key patterns
- Include reasonable Faker.js methods for synthetic data generation
- If auth type is unclear, default to "apikey"

Respond with ONLY the JSON schema, no other text.`;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Waits for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validates and fixes common issues in LLM-generated schemas
 */
function sanitizeSchema(raw: unknown): ConnectorSchema {
  const obj = raw as Record<string, unknown>;

  // Ensure basic structure
  if (!obj.name || typeof obj.name !== 'string') {
    obj.name = 'inferred_api';
  }

  if (!obj.version || typeof obj.version !== 'string') {
    obj.version = '1.0.0';
  }

  if (!obj.baseUrl || typeof obj.baseUrl !== 'string') {
    obj.baseUrl = '/api';
  }

  // Fix auth
  if (!obj.auth || typeof obj.auth !== 'object') {
    obj.auth = { type: 'apikey', fields: ['api_key'] };
  }
  const auth = obj.auth as Record<string, unknown>;
  if (!['oauth2', 'apikey', 'basic', 'tba'].includes(auth.type as string)) {
    auth.type = 'apikey';
  }
  if (!Array.isArray(auth.fields) || auth.fields.length === 0) {
    auth.fields = ['api_key'];
  }

  // Fix entities
  if (!Array.isArray(obj.entities)) {
    obj.entities = [];
  }

  const entities = obj.entities as Array<Record<string, unknown>>;
  for (const entity of entities) {
    // Ensure name
    if (!entity.name || typeof entity.name !== 'string') {
      entity.name = 'UnknownEntity';
    }

    // Ensure tableName
    if (!entity.tableName || typeof entity.tableName !== 'string') {
      const snakeName = (entity.name as string)
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '');
      entity.tableName = `${obj.name}_${snakeName}s`;
    }

    // Ensure endpoints
    if (!Array.isArray(entity.endpoints)) {
      entity.endpoints = [];
    }

    // Ensure fields
    if (!Array.isArray(entity.fields)) {
      entity.fields = [];
    }

    // Ensure id field exists
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

    // Fix field types
    for (const field of fields) {
      if (!field.name || typeof field.name !== 'string') {
        field.name = 'unknownField';
      }

      const validTypes: FieldType[] = [
        'string',
        'number',
        'boolean',
        'date',
        'datetime',
        'json',
        'uuid',
      ];
      if (!validTypes.includes(field.type as FieldType)) {
        field.type = 'string';
      }

      if (typeof field.required !== 'boolean') {
        field.required = false;
      }
    }

    // Fix endpoint methods and operations
    const endpoints = entity.endpoints as Array<Record<string, unknown>>;
    for (const endpoint of endpoints) {
      const validMethods: HttpMethod[] = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
      if (!validMethods.includes(endpoint.method as HttpMethod)) {
        endpoint.method = 'GET';
      }

      const validOps: Operation[] = ['list', 'get', 'create', 'update', 'delete', 'search'];
      if (!validOps.includes(endpoint.operation as Operation)) {
        endpoint.operation = 'get';
      }

      if (!endpoint.path || typeof endpoint.path !== 'string') {
        endpoint.path = `/${entity.name?.toString().toLowerCase()}s`;
      }
    }
  }

  // Fix relationships
  if (!Array.isArray(obj.relationships)) {
    obj.relationships = [];
  }

  const relationships = obj.relationships as Array<Record<string, unknown>>;
  for (const rel of relationships) {
    if (!rel.from || typeof rel.from !== 'string') {
      rel.from = 'Unknown';
    }
    if (!rel.to || typeof rel.to !== 'string') {
      rel.to = 'Unknown';
    }

    const validRelTypes: RelationshipType[] = ['one-to-one', 'one-to-many', 'many-to-many'];
    if (!validRelTypes.includes(rel.type as RelationshipType)) {
      rel.type = 'one-to-many';
    }

    if (!rel.foreignKey || typeof rel.foreignKey !== 'string') {
      rel.foreignKey = `${rel.to?.toString().toLowerCase()}Id`;
    }
  }

  return obj as unknown as ConnectorSchema;
}

/**
 * Extracts JSON from LLM response (handles markdown code blocks)
 */
function extractJSON(response: string): string {
  // Try to find JSON in markdown code block
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find raw JSON object
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  // Return as-is
  return response.trim();
}

// =============================================================================
// MAIN PARSER CLASS
// =============================================================================

/**
 * LLM Inference Parser
 *
 * Uses Claude Haiku to infer schemas from unstructured documentation
 */
export class LLMInferenceParser {
  private client: Anthropic;
  private options: Required<LLMInferenceParserOptions>;

  constructor(options: LLMInferenceParserOptions = {}) {
    this.options = {
      apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY || '',
      model: options.model || 'claude-3-haiku-20240307',
      maxTokens: options.maxTokens || 4096,
      name: options.name || '',
      baseUrl: options.baseUrl || '/api',
      tablePrefix: options.tablePrefix || '',
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
    };

    if (!this.options.apiKey) {
      throw new Error(
        'Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable or pass apiKey option.'
      );
    }

    this.client = new Anthropic({
      apiKey: this.options.apiKey,
    });
  }

  /**
   * Infer schema from various input types
   */
  async infer(input: InferenceInput): Promise<LLMInferenceResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    // Prepare input text
    let inputText: string;
    switch (input.type) {
      case 'url':
        inputText = `API Documentation URL: ${input.value}\n\nPlease analyze this API and infer its schema structure.`;
        warnings.push(
          'URL provided without content - inference based on URL patterns only. Consider fetching actual documentation.'
        );
        break;

      case 'text':
        inputText = input.value;
        break;

      case 'json':
        inputText = `Sample API Response:\n${JSON.stringify(input.value, null, 2)}`;
        break;

      case 'description':
        inputText = `API Description: ${input.value}\n\nPlease infer a complete schema from this description.`;
        break;
    }

    // Build the prompt
    const userPrompt = ENTITY_EXTRACTION_PROMPT.replace('{{INPUT}}', inputText);

    // Call Claude with retry logic
    let response: Anthropic.Message | null = null;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        response = await this.client.messages.create({
          model: this.options.model,
          max_tokens: this.options.maxTokens,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        });
        break;
      } catch (error) {
        lastError = error as Error;

        // Check for rate limit
        if (error instanceof Anthropic.RateLimitError) {
          if (attempt < this.options.maxRetries) {
            const delay = this.options.retryDelay * Math.pow(2, attempt - 1);
            warnings.push(`Rate limited, retrying in ${delay}ms (attempt ${attempt}/${this.options.maxRetries})`);
            await sleep(delay);
            continue;
          }
        }

        // Check for other retryable errors
        if (error instanceof Anthropic.APIConnectionError) {
          if (attempt < this.options.maxRetries) {
            const delay = this.options.retryDelay * attempt;
            warnings.push(`Connection error, retrying in ${delay}ms`);
            await sleep(delay);
            continue;
          }
        }

        throw error;
      }
    }

    if (!response) {
      throw new Error(`Failed to get response from Claude after ${this.options.maxRetries} attempts: ${lastError?.message}`);
    }

    // Extract text from response
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    // Parse JSON from response
    const jsonText = extractJSON(textBlock.text);
    let rawSchema: unknown;

    try {
      rawSchema = JSON.parse(jsonText);
    } catch (parseError) {
      warnings.push(`JSON parse error: ${(parseError as Error).message}`);
      throw new Error(`Failed to parse LLM response as JSON: ${(parseError as Error).message}`);
    }

    // Sanitize and fix common issues
    const sanitized = sanitizeSchema(rawSchema);

    // Apply options overrides
    if (this.options.name) {
      sanitized.name = this.options.name;
    }

    if (this.options.baseUrl) {
      sanitized.baseUrl = this.options.baseUrl;
    }

    if (this.options.tablePrefix) {
      for (const entity of sanitized.entities) {
        if (!entity.tableName.startsWith(this.options.tablePrefix)) {
          const snakeName = entity.name
            .replace(/([A-Z])/g, '_$1')
            .toLowerCase()
            .replace(/^_/, '');
          entity.tableName = `${this.options.tablePrefix}${snakeName}s`;
        }
      }
    }

    // Validate the schema
    let validated: ConnectorSchema;
    try {
      validated = validateSchema(sanitized);
    } catch (validationError) {
      if (validationError instanceof SchemaValidationError) {
        warnings.push(...validationError.getFormattedErrors());
      }
      throw validationError;
    }

    // Calculate confidence based on completeness
    const confidence = this.calculateConfidence(validated);

    // Calculate tokens used
    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

    return {
      schema: validated,
      confidence,
      warnings,
      metadata: {
        model: this.options.model,
        tokensUsed,
        inferenceTime: Date.now() - startTime,
      },
    };
  }

  /**
   * Infer schema from a URL (fetches content first)
   */
  async inferFromURL(url: string): Promise<LLMInferenceResult> {
    // For now, just pass the URL - in production, we'd fetch the content
    return this.infer({ type: 'url', value: url });
  }

  /**
   * Infer schema from text documentation
   */
  async inferFromText(text: string): Promise<LLMInferenceResult> {
    return this.infer({ type: 'text', value: text });
  }

  /**
   * Infer schema from JSON sample
   */
  async inferFromJSON(json: object): Promise<LLMInferenceResult> {
    return this.infer({ type: 'json', value: json });
  }

  /**
   * Infer schema from natural language description
   */
  async inferFromDescription(description: string): Promise<LLMInferenceResult> {
    return this.infer({ type: 'description', value: description });
  }

  /**
   * Calculate confidence score based on schema completeness
   */
  private calculateConfidence(schema: ConnectorSchema): number {
    let score = 0;
    let maxScore = 0;

    // Has entities
    maxScore += 20;
    if (schema.entities.length > 0) {
      score += 20;
    }

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
    if (schema.relationships.length > 0) {
      score += 15;
    }

    // Fields have faker hints
    maxScore += 15;
    const allFields = schema.entities.flatMap((e) => e.fields);
    const fieldsWithFaker = allFields.filter((f) => f.faker);
    score += Math.min(15, (fieldsWithFaker.length / Math.max(1, allFields.length)) * 15);

    // Auth is configured
    maxScore += 10;
    if (schema.auth.type && schema.auth.fields.length > 0) {
      score += 10;
    }

    return Math.round((score / maxScore) * 100) / 100;
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Infer schema from text using LLM
 */
export async function inferSchemaFromText(
  text: string,
  options?: LLMInferenceParserOptions
): Promise<LLMInferenceResult> {
  const parser = new LLMInferenceParser(options);
  return parser.inferFromText(text);
}

/**
 * Infer schema from JSON sample using LLM
 */
export async function inferSchemaFromJSON(
  json: object,
  options?: LLMInferenceParserOptions
): Promise<LLMInferenceResult> {
  const parser = new LLMInferenceParser(options);
  return parser.inferFromJSON(json);
}

/**
 * Infer schema from description using LLM
 */
export async function inferSchemaFromDescription(
  description: string,
  options?: LLMInferenceParserOptions
): Promise<LLMInferenceResult> {
  const parser = new LLMInferenceParser(options);
  return parser.inferFromDescription(description);
}

/**
 * Check if input should use LLM inference
 */
export function needsLLMInference(input: string): boolean {
  // Use LLM for URLs that aren't OpenAPI specs
  if (input.startsWith('http') && !input.includes('openapi') && !input.includes('swagger')) {
    return true;
  }

  // Use LLM for plain text descriptions
  if (!input.startsWith('{') && !input.startsWith('[') && !input.endsWith('.yaml') && !input.endsWith('.json')) {
    return true;
  }

  return false;
}

export default LLMInferenceParser;
