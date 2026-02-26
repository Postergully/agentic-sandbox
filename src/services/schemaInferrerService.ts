/**
 * Schema Inferrer Service
 *
 * Service layer for the Schema Inferrer module (Module 2 in task-progress.md).
 * Wraps the schema parsing infrastructure and provides a unified interface
 * for the Factory Tool to infer ConnectorSchema from various sources.
 *
 * Input Sources:
 *   1. URL: Download from official API docs
 *   2. File: Read local OpenAPI/Swagger/JSON spec
 *   3. Direct Spec: Accept inline JSON schema
 *
 * Output: ConnectorSchema
 */

import { parseSchema, detectInputType, SchemaParseResult, SchemaParserOptions } from '../schema/parsers';
import { ConnectorSchema } from '../schema/connector-schema';
import logger from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface SchemaInferenceInput {
  /** URL to fetch API docs from */
  url?: string;
  /** Local file path to spec */
  filePath?: string;
  /** Inline spec object */
  spec?: object;
}

export interface SchemaInferenceOptions {
  /** Connector name (used in schema) */
  connectorName: string;
  /** Base URL for the mock server */
  baseUrl?: string;
  /** Table name prefix for PostgreSQL */
  tablePrefix?: string;
  /** Anthropic API key for LLM inference */
  anthropicApiKey?: string;
  /** Force specific parser */
  forceParser?: 'openapi' | 'llm' | 'json' | 'large-docs' | 'llm-agent';
  /** Enable verbose logging */
  verbose?: boolean;
  /** Output path to save schema */
  outputPath?: string;
}

export interface SchemaInferenceResult {
  success: boolean;
  schema?: ConnectorSchema;
  inputType: string;
  parserUsed: string;
  confidence?: number;
  warnings: string[];
  error?: string;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Service Class
// ============================================================================

class SchemaInferrerService {
  /**
   * Infer ConnectorSchema from any input source
   *
   * @param input - Source specification (URL, file path, or inline spec)
   * @param options - Inference options
   * @returns Schema inference result
   */
  async infer(
    input: SchemaInferenceInput,
    options: SchemaInferenceOptions
  ): Promise<SchemaInferenceResult> {
    try {
      // Determine the actual input value
      const inputValue = this.resolveInput(input);
      if (!inputValue) {
        return {
          success: false,
          inputType: 'unknown',
          parserUsed: 'none',
          warnings: [],
          error: 'No valid input provided. Specify url, filePath, or spec.',
          metadata: {},
        };
      }

      // Detect input type for logging
      const detection = detectInputType(inputValue);
      logger.info(
        `SchemaInferrer: Detected input type: ${detection.type} (confidence: ${detection.confidence})`
      );
      logger.info(`SchemaInferrer: Suggested parser: ${detection.suggestedParser}`);

      // Parse schema options
      const parserOptions: SchemaParserOptions = {
        name: options.connectorName,
        baseUrl: options.baseUrl,
        tablePrefix: options.tablePrefix,
        apiKey: options.anthropicApiKey,
        forceParser: options.forceParser,
        validate: true,
        verbose: options.verbose,
        outputPath: options.outputPath,
      };

      // Parse schema
      const result: SchemaParseResult = await parseSchema(inputValue, parserOptions);

      logger.info(
        `SchemaInferrer: Successfully parsed schema with ${result.schema.entities.length} entities`
      );

      // Log additional details for LLM agent parser
      if (result.parserUsed === 'llm-agent') {
        const agentMeta = result.metadata as Record<string, unknown>;
        logger.info(
          `SchemaInferrer: LLM Agent completed in ${agentMeta.iterations} iterations, ` +
          `${agentMeta.tokensUsed} tokens, ${agentMeta.toolCalls} tool calls`
        );
      }

      return {
        success: true,
        schema: result.schema,
        inputType: result.inputType,
        parserUsed: result.parserUsed,
        confidence: result.confidence,
        warnings: result.warnings,
        metadata: result.metadata,
      };
    } catch (error) {
      logger.error('SchemaInferrer: Failed to infer schema', error);

      return {
        success: false,
        inputType: 'unknown',
        parserUsed: 'none',
        warnings: [],
        error: error instanceof Error ? error.message : 'Unknown error during schema inference',
        metadata: {},
      };
    }
  }

  /**
   * Infer schema from URL
   */
  async inferFromUrl(
    url: string,
    options: Omit<SchemaInferenceOptions, 'connectorName'> & { connectorName?: string }
  ): Promise<SchemaInferenceResult> {
    const connectorName = options.connectorName || this.extractConnectorNameFromUrl(url);
    return this.infer({ url }, { ...options, connectorName });
  }

  /**
   * Infer schema from local file
   */
  async inferFromFile(
    filePath: string,
    options: Omit<SchemaInferenceOptions, 'connectorName'> & { connectorName?: string }
  ): Promise<SchemaInferenceResult> {
    const connectorName = options.connectorName || this.extractConnectorNameFromPath(filePath);
    return this.infer({ filePath }, { ...options, connectorName });
  }

  /**
   * Infer schema from inline spec object
   */
  async inferFromSpec(
    spec: object,
    options: SchemaInferenceOptions
  ): Promise<SchemaInferenceResult> {
    return this.infer({ spec }, options);
  }

  /**
   * Validate that a schema is properly structured
   */
  validateSchema(schema: ConnectorSchema): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!schema.name) {
      errors.push('Schema missing required field: name');
    }

    if (!schema.entities || !Array.isArray(schema.entities)) {
      errors.push('Schema missing required field: entities (array)');
    } else if (schema.entities.length === 0) {
      errors.push('Schema has no entities defined');
    }

    if (!schema.auth) {
      errors.push('Schema missing required field: auth');
    } else {
      if (!schema.auth.type) {
        errors.push('Schema auth missing required field: type');
      }
      if (!schema.auth.fields || schema.auth.fields.length === 0) {
        errors.push('Schema auth missing required field: fields');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get summary of a schema for logging/display
   */
  getSchemaSummary(schema: ConnectorSchema): {
    name: string;
    entityCount: number;
    entityNames: string[];
    authType: string;
    fieldCount: number;
  } {
    const fieldCount = schema.entities.reduce(
      (sum, entity) => sum + (entity.fields?.length || 0),
      0
    );

    return {
      name: schema.name,
      entityCount: schema.entities.length,
      entityNames: schema.entities.map((e) => e.name),
      authType: schema.auth.type,
      fieldCount,
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Resolve input to a value that can be passed to parseSchema
   */
  private resolveInput(input: SchemaInferenceInput): string | object | null {
    if (input.url) {
      return input.url;
    }
    if (input.filePath) {
      return input.filePath;
    }
    if (input.spec) {
      return input.spec;
    }
    return null;
  }

  /**
   * Extract connector name from URL
   */
  private extractConnectorNameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;

      // Common patterns
      if (hostname.includes('snowflake')) return 'snowflake';
      if (hostname.includes('netsuite')) return 'netsuite';
      if (hostname.includes('salesforce')) return 'salesforce';
      if (hostname.includes('google')) return 'google_workspace';
      if (hostname.includes('slack')) return 'slack';
      if (hostname.includes('hubspot')) return 'hubspot';

      // Fall back to hostname-based name
      const parts = hostname.split('.');
      return parts[0].replace(/[^a-z0-9]/gi, '_').toLowerCase();
    } catch {
      return 'unknown_connector';
    }
  }

  /**
   * Extract connector name from file path
   */
  private extractConnectorNameFromPath(filePath: string): string {
    const filename = filePath.split('/').pop() || filePath;
    const name = filename.replace(/\.(json|yaml|yml|openapi|swagger)$/i, '');
    return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  }
}

// Export singleton instance
export const schemaInferrerService = new SchemaInferrerService();
export default schemaInferrerService;
