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
import SwaggerParser from '@apidevtools/swagger-parser';
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
import {
  LargeDocsParser,
  LargeDocsParserOptions,
  LargeDocsParseResult,
  isLargeDocs,
  getDocsType,
  parseLargeDocs,
} from './large-docs-parser';
import {
  fetchAndDetectContent,
  generateContentSummary,
  URLContentDetection,
} from './url-content-detector';
import {
  LLMAgentParser,
  LLMAgentParserOptions,
  LLMAgentParseResult,
} from './llm-agent-parser';
import { validateSchemaQuality, QualityReport } from './schema-quality-validator';

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
  | 'large-docs'
  | 'unknown';

/**
 * Detected input information
 */
export interface InputDetection {
  type: SchemaInputType;
  suggestedParser: 'openapi' | 'llm' | 'json' | 'large-docs' | 'llm-agent';
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
  forceParser?: 'openapi' | 'llm' | 'json' | 'large-docs' | 'llm-agent';
  /** Whether to validate output schema */
  validate?: boolean;
  /** Whether to save schema to file */
  outputPath?: string;
  /** Verbose logging */
  verbose?: boolean;
  /** Path to pre-parsed index (for large-docs parser) */
  indexPath?: string;
  /** Specific record names to parse (for large-docs parser) */
  records?: string[];
}

/**
 * Unified parse result
 */
export interface SchemaParseResult {
  schema: ConnectorSchema;
  inputType: SchemaInputType;
  parserUsed: 'openapi' | 'llm' | 'json' | 'large-docs' | 'llm-agent';
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

  // Check if it's a file path or directory
  if (fs.existsSync(str)) {
    const stats = fs.statSync(str);

    // Check if it's a directory with large documentation
    if (stats.isDirectory() && isLargeDocs(str)) {
      const docsType = getDocsType(str);
      return {
        type: 'large-docs',
        suggestedParser: 'large-docs',
        confidence: 0.95,
        reason: `Large documentation directory detected (${docsType})`,
      };
    }

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
  let parserToUse = options.forceParser || detection.suggestedParser;

  let schema: ConnectorSchema;
  let metadata: Record<string, unknown> = {};
  let confidence: number | undefined;

  // =========================================================================
  // URL Content Detection Layer
  // For URL inputs, fetch the content first and decide routing based on
  // actual content rather than URL string patterns alone.
  // =========================================================================
  if (
    typeof input === 'string' &&
    (detection.type === 'url' || detection.type === 'openapi-url') &&
    !options.forceParser
  ) {
    if (options.verbose) {
      console.log('Fetching URL content for detection...');
    }

    const urlDetection = await fetchAndDetectContent(input);

    if (options.verbose) {
      console.log(`  URL content detection: isOpenAPI=${urlDetection.isOpenAPI}, confidence=${urlDetection.confidence}`);
      console.log(`  Reason: ${urlDetection.reason}`);
      console.log(`  Content type: ${urlDetection.metadata.contentType}`);
      console.log(`  Top-level keys: ${urlDetection.metadata.topLevelKeys.slice(0, 10).join(', ')}`);
    }

    if (urlDetection.isOpenAPI && urlDetection.parsedContent) {
      // Parse the pre-fetched content directly — do NOT re-fetch the URL,
      // because swagger-parser uses different Accept headers and the server
      // may return HTML instead of the spec via content negotiation.
      parserToUse = 'openapi';
      if (options.verbose) {
        console.log('  → Routing to OpenAPI parser with pre-fetched content (content confirmed as OpenAPI)');
      }

      const openApiOptions: OpenAPIParserOptions = {
        name: options.name,
        baseUrl: options.baseUrl,
        tablePrefix: options.tablePrefix,
      };
      const parser = new OpenAPIParser(openApiOptions);
      // Dereference $refs and convert Swagger 2.0 → OpenAPI 3.0 if needed
      const dereferenced = await SwaggerParser.dereference(urlDetection.parsedContent as never);
      const openApiResult = await parser.parseDocument(dereferenced as never);

      schema = openApiResult.schema;
      warnings.push(...openApiResult.warnings);
      metadata = {
        openApiVersion: openApiResult.metadata.openApiVersion,
        title: openApiResult.metadata.title,
        description: openApiResult.metadata.description,
        servers: openApiResult.metadata.servers,
        urlDetection: {
          isOpenAPI: true,
          contentType: urlDetection.metadata.contentType,
          topLevelKeys: urlDetection.metadata.topLevelKeys,
        },
      };

      return finalizeResult(schema, detection, parserToUse, urlDetection.confidence, warnings, metadata, options);
    } else if (urlDetection.parsedContent) {
      // Non-OpenAPI structured content → use LLM Agent Parser
      parserToUse = 'llm-agent';
      if (options.verbose) {
        console.log('  → Routing to LLM Agent Parser (non-OpenAPI structured content)');
      }

      const agentParser = new LLMAgentParser({
        apiKey: options.apiKey,
        name: options.name,
        baseUrl: options.baseUrl,
        tablePrefix: options.tablePrefix,
        verbose: options.verbose,
      });

      const agentResult = await agentParser.parseFromContent(
        urlDetection.parsedContent,
        urlDetection.contentSummary
      );

      schema = agentResult.schema;
      confidence = agentResult.confidence;
      warnings.push(...agentResult.warnings);
      metadata = {
        model: agentResult.metadata.model,
        tokensUsed: agentResult.metadata.tokensUsed,
        iterations: agentResult.metadata.iterations,
        inferenceTime: agentResult.metadata.inferenceTime,
        toolCalls: agentResult.metadata.toolCalls,
        urlDetection: {
          isOpenAPI: urlDetection.isOpenAPI,
          contentType: urlDetection.metadata.contentType,
          topLevelKeys: urlDetection.metadata.topLevelKeys,
        },
      };

      // Skip the switch block below — go directly to post-processing
      return finalizeResult(schema, detection, parserToUse, confidence, warnings, metadata, options);
    } else if (urlDetection.isHTML && urlDetection.discoveredSpecUrl) {
      // HTML docs page with an embedded spec URL — re-fetch the actual spec
      if (options.verbose) {
        console.log(`  → HTML docs page detected. Discovered spec URL: ${urlDetection.discoveredSpecUrl}`);
        console.log('  → Re-fetching discovered spec URL...');
      }
      warnings.push(`Original URL returned HTML. Discovered spec at: ${urlDetection.discoveredSpecUrl}`);

      // Recursively detect the discovered spec URL
      const specDetection = await fetchAndDetectContent(urlDetection.discoveredSpecUrl);

      if (specDetection.isOpenAPI && specDetection.parsedContent) {
        // Found the OpenAPI spec — parse directly with OpenAPI parser
        parserToUse = 'openapi';
        if (options.verbose) {
          console.log('  → Discovered URL confirmed as OpenAPI spec, routing to OpenAPI parser');
        }

        const openApiOptions: OpenAPIParserOptions = {
          name: options.name,
          baseUrl: options.baseUrl,
          tablePrefix: options.tablePrefix,
        };
        // Parse pre-fetched content directly — avoid re-fetching which may
        // get HTML due to content negotiation differences.
        const parser = new OpenAPIParser(openApiOptions);
        const dereferenced = await SwaggerParser.dereference(specDetection.parsedContent as never);
        const openApiResult = await parser.parseDocument(dereferenced as never);

        schema = openApiResult.schema;
        warnings.push(...openApiResult.warnings);
        metadata = {
          openApiVersion: openApiResult.metadata.openApiVersion,
          title: openApiResult.metadata.title,
          description: openApiResult.metadata.description,
          servers: openApiResult.metadata.servers,
          discoveredSpecUrl: urlDetection.discoveredSpecUrl,
        };

        return finalizeResult(schema, detection, parserToUse, confidence, warnings, metadata, options);
      } else if (specDetection.parsedContent) {
        // Structured but non-OpenAPI content — route to LLM Agent
        parserToUse = 'llm-agent';
        if (options.verbose) {
          console.log('  → Discovered URL has structured content, routing to LLM Agent Parser');
        }

        const agentParser = new LLMAgentParser({
          apiKey: options.apiKey,
          name: options.name,
          baseUrl: options.baseUrl,
          tablePrefix: options.tablePrefix,
          verbose: options.verbose,
        });

        const agentResult = await agentParser.parseFromContent(
          specDetection.parsedContent,
          specDetection.contentSummary
        );

        schema = agentResult.schema;
        confidence = agentResult.confidence;
        warnings.push(...agentResult.warnings);
        metadata = {
          model: agentResult.metadata.model,
          tokensUsed: agentResult.metadata.tokensUsed,
          iterations: agentResult.metadata.iterations,
          inferenceTime: agentResult.metadata.inferenceTime,
          toolCalls: agentResult.metadata.toolCalls,
          discoveredSpecUrl: urlDetection.discoveredSpecUrl,
        };

        return finalizeResult(schema, detection, parserToUse, confidence, warnings, metadata, options);
      } else {
        // Discovered URL also didn't return parseable content
        if (options.verbose) {
          console.log('  → Discovered spec URL also returned unparseable content, falling back to LLM');
        }
        warnings.push(`Discovered spec URL also returned unparseable content: ${specDetection.reason}`);
      }
    } else if (urlDetection.isHTML) {
      // HTML page but no spec URL found — pass HTML summary to LLM Agent as a last resort
      if (options.verbose) {
        console.log('  → HTML docs page detected, no embedded spec URL found');
        console.log('  → Routing to LLM Agent Parser with HTML content summary');
      }
      warnings.push('URL returned HTML with no discoverable spec URL. Using LLM to extract schema from page content.');

      parserToUse = 'llm-agent';

      const agentParser = new LLMAgentParser({
        apiKey: options.apiKey,
        name: options.name,
        baseUrl: options.baseUrl,
        tablePrefix: options.tablePrefix,
        verbose: options.verbose,
      });

      // Create a synthetic content object from the HTML summary for the agent to analyze
      const htmlSummaryContent = {
        _source: 'html-docs-page',
        _originalUrl: input,
        _note: 'This content was extracted from an HTML API documentation page. Analyze the visible API endpoints, request/response schemas, and entity types.',
        htmlSummary: urlDetection.contentSummary,
      };

      const agentResult = await agentParser.parseFromContent(
        htmlSummaryContent,
        urlDetection.contentSummary
      );

      schema = agentResult.schema;
      confidence = agentResult.confidence;
      warnings.push(...agentResult.warnings);
      metadata = {
        model: agentResult.metadata.model,
        tokensUsed: agentResult.metadata.tokensUsed,
        iterations: agentResult.metadata.iterations,
        inferenceTime: agentResult.metadata.inferenceTime,
        toolCalls: agentResult.metadata.toolCalls,
        htmlFallback: true,
      };

      return finalizeResult(schema, detection, parserToUse, confidence, warnings, metadata, options);
    } else {
      // Could not parse content and not HTML — fall through to existing LLM text parser
      if (options.verbose) {
        console.log('  → Content could not be parsed, falling back to LLM text inference');
      }
      warnings.push(`URL content could not be parsed as JSON/YAML: ${urlDetection.reason}`);
    }
  }

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

    case 'large-docs': {
      if (options.verbose) {
        console.log('Using large documentation parser...');
      }

      if (typeof input !== 'string') {
        throw new Error('Large docs parser requires a directory path');
      }

      const largeDocsOptions: LargeDocsParserOptions = {
        docsPath: input,
        name: options.name,
        baseUrl: options.baseUrl,
        tablePrefix: options.tablePrefix,
        indexPath: options.indexPath,
        verbose: options.verbose,
      };

      const parser = new LargeDocsParser(largeDocsOptions);
      let result: LargeDocsParseResult;

      if (options.records && options.records.length > 0) {
        result = await parser.parseRecords(options.records);
      } else {
        result = await parser.parseCommonRecords();
      }

      schema = result.schema;
      confidence = result.confidence;
      warnings.push(...result.warnings);
      metadata = {
        docsVersion: result.metadata.docsVersion,
        totalRecords: result.metadata.totalRecords,
        parsedRecords: result.metadata.parsedRecords,
        parseTime: result.metadata.parseTime,
      };
      break;
    }

    default:
      throw new Error(`Unknown parser type: ${parserToUse}`);
  }

  return finalizeResult(schema, detection, parserToUse, confidence, warnings, metadata, options);
}

/**
 * Post-processing: apply overrides, validate, save, and return result
 */
function finalizeResult(
  schema: ConnectorSchema,
  detection: InputDetection,
  parserUsed: SchemaParseResult['parserUsed'],
  confidence: number | undefined,
  warnings: string[],
  metadata: Record<string, unknown>,
  options: SchemaParserOptions
): SchemaParseResult {
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

  // Run quality gate (non-blocking warnings)
  const qualityReport = validateSchemaQuality(schema);
  if (qualityReport.warnings.length > 0) {
    warnings.push(...qualityReport.warnings);
  }
  metadata.qualityScore = qualityReport.score;
  metadata.isShallow = qualityReport.isShallow;

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
    parserUsed,
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

  // Large Docs Parser
  LargeDocsParser,
  LargeDocsParserOptions,
  LargeDocsParseResult,
  isLargeDocs,
  getDocsType,
  parseLargeDocs,

  // URL Content Detector
  fetchAndDetectContent,
  generateContentSummary,
  URLContentDetection,

  // LLM Agent Parser
  LLMAgentParser,
  LLMAgentParserOptions,
  LLMAgentParseResult,

  // Schema Quality Validator
  validateSchemaQuality,
  QualityReport,

  // Schema types
  ConnectorSchema,
  SchemaValidationError,
};

export default parseSchema;
