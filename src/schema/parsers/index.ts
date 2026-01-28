/**
 * Schema Parser Index
 *
 * Unified interface for parsing various input types into ConnectorSchema.
 * Auto-detects input type and routes to the appropriate parser.
 *
 * @module parsers
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ConnectorSchema,
  validateSchema,
  SchemaValidationError,
} from '../connector-schema';
import {
  OpenAPIParser,
  OpenAPIParserOptions,
  OpenAPIParseResult,
  isOpenAPISpec,
  parseOpenAPI,
} from './openapi-parser';
import {
  LLMInferenceParser,
  LLMInferenceParserOptions,
  LLMInferenceResult,
  needsLLMInference,
  inferSchemaFromText,
  inferSchemaFromJSON,
  inferSchemaFromDescription,
} from './llm-inference-parser';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Input type for schema parsing
 */
export type SchemaInputType =
  | 'openapi'
  | 'openapi-url'
  | 'json-sample'
  | 'text'
  | 'description'
  | 'file'
  | 'url'
  | 'unknown';

/**
 * Detected input information
 */
export interface InputDetection {
  type: SchemaInputType;
  suggestedParser: 'openapi' | 'llm' | 'json';
  confidence: number;
  reason: string;
}

/**
 * Unified parser options
 */
export interface SchemaParserOptions {
  /** Connector name override */
  name?: string;
  /** Base URL for endpoints */
  baseUrl?: string;
  /** Table name prefix */
  tablePrefix?: string;
  /** Anthropic API key (for LLM parser) */
  apiKey?: string;
  /** Force specific parser */
  forceParser?: 'openapi' | 'llm' | 'json';
  /** Whether to validate output schema */
  validate?: boolean;
  /** Whether to save schema to file */
  outputPath?: string;
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Unified parse result
 */
export interface SchemaParseResult {
  schema: ConnectorSchema;
  inputType: SchemaInputType;
  parserUsed: 'openapi' | 'llm' | 'json';
  confidence?: number;
  warnings: string[];
  metadata: Record<string, unknown>;
}

// =============================================================================
// INPUT DETECTION
// =============================================================================

/**
 * Detect the type of input and suggest appropriate parser
 */
export function detectInputType(input: string | object): InputDetection {
  // Handle object input (JSON sample)
  if (typeof input === 'object') {
    // Check if it's already a ConnectorSchema
    if ('entities' in input && 'auth' in input) {
      return {
        type: 'json-sample',
        suggestedParser: 'json',
        confidence: 0.95,
        reason: 'Input appears to be a ConnectorSchema or similar structure',
      };
    }

    // Check if it's an OpenAPI spec object
    if ('openapi' in input || 'swagger' in input) {
      return {
        type: 'openapi',
        suggestedParser: 'openapi',
        confidence: 0.99,
        reason: 'Input is an OpenAPI/Swagger specification object',
      };
    }

    // Generic JSON sample
    return {
      type: 'json-sample',
      suggestedParser: 'llm',
      confidence: 0.7,
      reason: 'Input is a JSON object, will use LLM to infer schema',
    };
  }

  const str = input.trim();

  // Check if it's a file path
  if (fs.existsSync(str)) {
    const ext = path.extname(str).toLowerCase();

    if (ext === '.yaml' || ext === '.yml') {
      return {
        type: 'openapi',
        suggestedParser: 'openapi',
        confidence: 0.9,
        reason: `YAML file detected (${ext})`,
      };
    }

    if (ext === '.json') {
      // Read first few bytes to check content
      try {
        const content = fs.readFileSync(str, 'utf8').slice(0, 1000);
        if (content.includes('"openapi"') || content.includes('"swagger"')) {
          return {
            type: 'openapi',
            suggestedParser: 'openapi',
            confidence: 0.95,
            reason: 'JSON file contains OpenAPI/Swagger markers',
          };
        }
        if (content.includes('"entities"') && content.includes('"auth"')) {
          return {
            type: 'file',
            suggestedParser: 'json',
            confidence: 0.95,
            reason: 'JSON file appears to be a ConnectorSchema',
          };
        }
      } catch {
        // Ignore read errors
      }

      return {
        type: 'json-sample',
        suggestedParser: 'llm',
        confidence: 0.7,
        reason: 'JSON file will be analyzed by LLM',
      };
    }

    return {
      type: 'file',
      suggestedParser: 'llm',
      confidence: 0.5,
      reason: 'Unknown file type, will attempt LLM inference',
    };
  }

  // Check if it's a URL
  if (str.startsWith('http://') || str.startsWith('https://')) {
    // Check for OpenAPI indicators in URL
    if (
      str.includes('openapi') ||
      str.includes('swagger') ||
      str.endsWith('.yaml') ||
      str.endsWith('.yml') ||
      str.endsWith('openapi.json')
    ) {
      return {
        type: 'openapi-url',
        suggestedParser: 'openapi',
        confidence: 0.9,
        reason: 'URL appears to point to OpenAPI specification',
      };
    }

    return {
      type: 'url',
      suggestedParser: 'llm',
      confidence: 0.6,
      reason: 'URL detected, will use LLM to analyze content',
    };
  }

  // Check if it's inline JSON
  if (str.startsWith('{') || str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str);

      if (parsed.openapi || parsed.swagger) {
        return {
          type: 'openapi',
          suggestedParser: 'openapi',
          confidence: 0.99,
          reason: 'Inline JSON is an OpenAPI specification',
        };
      }

      if (parsed.entities && parsed.auth) {
        return {
          type: 'json-sample',
          suggestedParser: 'json',
          confidence: 0.95,
          reason: 'Inline JSON is a ConnectorSchema',
        };
      }

      return {
        type: 'json-sample',
        suggestedParser: 'llm',
        confidence: 0.7,
        reason: 'Inline JSON sample, will use LLM to infer schema',
      };
    } catch {
      // Not valid JSON
    }
  }

  // Check if it's inline YAML
  if (str.includes('openapi:') || str.includes('swagger:')) {
    return {
      type: 'openapi',
      suggestedParser: 'openapi',
      confidence: 0.85,
      reason: 'Inline YAML appears to be OpenAPI specification',
    };
  }

  // Default to text description for LLM
  return {
    type: 'description',
    suggestedParser: 'llm',
    confidence: 0.5,
    reason: 'Input appears to be a text description',
  };
}

// =============================================================================
// MAIN PARSER FUNCTION
// =============================================================================

/**
 * Parse schema from any input type
 *
 * Auto-detects input type and routes to appropriate parser.
 *
 * @example
 * ```typescript
 * // From OpenAPI file
 * const result = await parseSchema('./openapi.yaml');
 *
 * // From URL
 * const result = await parseSchema('https://api.example.com/openapi.json');
 *
 * // From JSON sample
 * const result = await parseSchema({ users: [{ id: 1, name: 'John' }] });
 *
 * // From description
 * const result = await parseSchema('CRM API with customers, contacts, and deals');
 * ```
 */
export async function parseSchema(
  input: string | object,
  options: SchemaParserOptions = {}
): Promise<SchemaParseResult> {
  const warnings: string[] = [];

  // Detect input type
  const detection = detectInputType(input);
  if (options.verbose) {
    console.log(`Input type detected: ${detection.type}`);
    console.log(`Suggested parser: ${detection.suggestedParser}`);
    console.log(`Confidence: ${detection.confidence}`);
    console.log(`Reason: ${detection.reason}`);
  }

  // Determine which parser to use
  const parserToUse = options.forceParser || detection.suggestedParser;

  let schema: ConnectorSchema;
  let metadata: Record<string, unknown> = {};
  let confidence: number | undefined;

  // Route to appropriate parser
  switch (parserToUse) {
    case 'openapi': {
      if (options.verbose) {
        console.log('Using OpenAPI parser...');
      }

      const openApiOptions: OpenAPIParserOptions = {
        name: options.name,
        baseUrl: options.baseUrl,
        tablePrefix: options.tablePrefix,
      };

      let result: OpenAPIParseResult;

      if (typeof input === 'object') {
        // Parse document object
        const parser = new OpenAPIParser(openApiOptions);
        result = await parser.parseDocument(input as never);
      } else {
        // Parse file/URL
        result = await parseOpenAPI(input, openApiOptions);
      }

      schema = result.schema;
      warnings.push(...result.warnings);
      metadata = {
        openApiVersion: result.metadata.openApiVersion,
        title: result.metadata.title,
        description: result.metadata.description,
        servers: result.metadata.servers,
      };
      break;
    }

    case 'llm': {
      if (options.verbose) {
        console.log('Using LLM inference parser...');
      }

      const llmOptions: LLMInferenceParserOptions = {
        apiKey: options.apiKey,
        name: options.name,
        baseUrl: options.baseUrl,
        tablePrefix: options.tablePrefix,
      };

      let result: LLMInferenceResult;

      if (typeof input === 'object') {
        result = await inferSchemaFromJSON(input, llmOptions);
      } else if (detection.type === 'file') {
        const content = fs.readFileSync(input, 'utf8');
        if (input.endsWith('.json')) {
          result = await inferSchemaFromJSON(JSON.parse(content), llmOptions);
        } else {
          result = await inferSchemaFromText(content, llmOptions);
        }
      } else if (detection.type === 'description') {
        result = await inferSchemaFromDescription(input, llmOptions);
      } else {
        result = await inferSchemaFromText(input, llmOptions);
      }

      schema = result.schema;
      confidence = result.confidence;
      warnings.push(...result.warnings);
      metadata = {
        model: result.metadata.model,
        tokensUsed: result.metadata.tokensUsed,
        inferenceTime: result.metadata.inferenceTime,
      };
      break;
    }

    case 'json': {
      if (options.verbose) {
        console.log('Using JSON parser...');
      }

      let jsonContent: unknown;

      if (typeof input === 'object') {
        jsonContent = input;
      } else if (fs.existsSync(input)) {
        jsonContent = JSON.parse(fs.readFileSync(input, 'utf8'));
      } else {
        jsonContent = JSON.parse(input);
      }

      // Validate as ConnectorSchema
      schema = validateSchema(jsonContent);
      metadata = { source: 'direct-json' };
      break;
    }

    default:
      throw new Error(`Unknown parser type: ${parserToUse}`);
  }

  // Apply name override if specified
  if (options.name && schema.name !== options.name) {
    schema.name = options.name;
  }

  // Apply base URL override
  if (options.baseUrl && schema.baseUrl !== options.baseUrl) {
    schema.baseUrl = options.baseUrl;
  }

  // Validate if requested (default true)
  if (options.validate !== false) {
    try {
      schema = validateSchema(schema);
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        warnings.push(...error.getFormattedErrors());
      }
      throw error;
    }
  }

  // Save to file if output path specified
  if (options.outputPath) {
    const outputDir = path.dirname(options.outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(options.outputPath, JSON.stringify(schema, null, 2));
    if (options.verbose) {
      console.log(`Schema saved to: ${options.outputPath}`);
    }
  }

  return {
    schema,
    inputType: detection.type,
    parserUsed: parserToUse,
    confidence,
    warnings,
    metadata,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  // OpenAPI Parser
  OpenAPIParser,
  OpenAPIParserOptions,
  OpenAPIParseResult,
  isOpenAPISpec,
  parseOpenAPI,

  // LLM Parser
  LLMInferenceParser,
  LLMInferenceParserOptions,
  LLMInferenceResult,
  needsLLMInference,
  inferSchemaFromText,
  inferSchemaFromJSON,
  inferSchemaFromDescription,

  // Schema types
  ConnectorSchema,
  SchemaValidationError,
};

export default parseSchema;
