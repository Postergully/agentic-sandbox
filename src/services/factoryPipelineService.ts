/**
 * Factory Pipeline Service
 *
 * Orchestrates the complete mock server creation workflow:
 * 1. Schema Inference - Parse API docs → ConnectorSchema
 * 2. OpenAPI Generation - ConnectorSchema → OpenAPI 3.0
 * 3. Data Generation - Schema + Brief → Synthetic data
 * 4. WireMock Setup - OpenAPI + Data → Stubs + State
 * 5. Registry + Credentials - Instance tracking + mock creds
 *
 * This is the unified entry point for both:
 * - Brief-based invocation (from discover-AGX): `generate --brief`
 * - Direct CLI invocation (for developers): `create --api-docs`
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { schemaInferrerService } from './schemaInferrerService';
import { DataGenerationService } from './dataGenerationService';
import { wiremockProxyService } from './wiremockProxyService';
import { registryService } from './registryService';
import { sslDnsService } from './sslDnsService';
import { convertConnectorSchemaToOpenApi } from '../schema/converters/connectorToOpenApi';
import { WireMockStubGenerator } from './wiremockStubGenerator';
import {
  GenerationBrief,
  GenerationStatus,
  ConnectorSchema,
  OutputManifest,
} from '../types/dataGeneration';
import { ConnectorSchema as ParserConnectorSchema } from '../schema/connector-schema';
import { MockServerInstance, MockServerStatus } from '../types';
import * as yaml from 'js-yaml';

// ============================================================================
// Types
// ============================================================================

export interface PipelineInput {
  /** Unique job identifier */
  jobId?: string;
  /** Organization identifier */
  orgId: string;
  /** Connector type (e.g., 'snowflake', 'netsuite') */
  connector: string;
  /** Optional job identifier for instance naming */
  jobIdSuffix?: string;

  /** Schema source - one of these must be provided */
  apiDocsUrl?: string;
  schemaPath?: string;
  existingSchema?: ConnectorSchema;

  /** Data generation options */
  industry?: string;
  companySize?: string;
  region?: string;
  volume?: number;

  /** Output configuration */
  outputDirectory?: string;
  statusFile?: string;

  /** Optional callbacks */
  progressWebhook?: string;
  completionWebhook?: string;

  /** Flags */
  skipDataGeneration?: boolean;
  skipWireMockSetup?: boolean;
  skipSsl?: boolean;
  dryRun?: boolean;
}

export interface PipelineResult {
  success: boolean;
  instanceId: string;
  schema?: ConnectorSchema;
  openApiSpec?: object;
  dataGenerated?: boolean;
  wireMockConfigured?: boolean;
  credentials?: {
    clientId: string;
    clientSecret: string;
    tokenEndpoint: string;
    baseUrl: string;
  };
  mockServerUrl?: string;
  outputManifest?: OutputManifest;
  error?: {
    stage: string;
    message: string;
    details?: string;
  };
  stages: StageResult[];
}

export interface StageResult {
  stage: string;
  status: 'success' | 'failed' | 'skipped';
  durationMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// Factory Pipeline Service
// ============================================================================

export class FactoryPipelineService {
  private dataGenerationService: DataGenerationService;
  private stubGenerator: WireMockStubGenerator;

  constructor() {
    this.dataGenerationService = new DataGenerationService();
    this.stubGenerator = new WireMockStubGenerator();
  }

  /**
   * Execute the full factory pipeline
   */
  async execute(input: PipelineInput): Promise<PipelineResult> {
    const startTime = Date.now();
    const stages: StageResult[] = [];

    // Generate instance ID
    const instanceId = this.generateInstanceId(input.connector, input.orgId, input.jobIdSuffix);
    const jobId = input.jobId || uuidv4();

    logger.info('Starting factory pipeline', {
      instanceId,
      jobId,
      connector: input.connector,
      orgId: input.orgId,
      hasApiDocs: !!input.apiDocsUrl,
      hasSchema: !!input.schemaPath || !!input.existingSchema,
    });

    // Initialize result
    const result: PipelineResult = {
      success: false,
      instanceId,
      stages,
    };

    // Setup output directories
    const outputDir = input.outputDirectory || path.join(process.cwd(), 'output', jobId);
    const statusFile = input.statusFile || path.join(outputDir, 'status.json');

    try {
      await fs.mkdir(outputDir, { recursive: true });
      await fs.mkdir(path.join(outputDir, 'schemas'), { recursive: true });
      await fs.mkdir(path.join(outputDir, 'data'), { recursive: true });
      await fs.mkdir(path.join(outputDir, 'credentials'), { recursive: true });
    } catch (err) {
      logger.error('Failed to create output directories', { outputDir, error: err });
    }

    // Initialize status
    const status: GenerationStatus = {
      jobId,
      status: 'pending',
      progress: 0,
      currentStep: 'Initializing pipeline...',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      connectors: {},
    };
    await this.writeStatus(statusFile, status);

    try {
      // ========================================================================
      // STAGE 1: Schema Inference
      // ========================================================================
      const schemaStart = Date.now();
      status.status = 'parsing';
      status.currentStep = 'Stage 1: Schema Inference';
      status.progress = 10;
      await this.writeStatus(statusFile, status);

      let schema: ConnectorSchema | null = null;

      if (input.existingSchema) {
        // Use provided schema directly
        schema = input.existingSchema;
        stages.push({
          stage: 'schema_inference',
          status: 'success',
          durationMs: Date.now() - schemaStart,
          details: { source: 'provided', entityCount: Object.keys(schema.entities || {}).length },
        });
      } else if (input.schemaPath) {
        // Load from file
        schema = await this.loadSchemaFromFile(input.schemaPath);
        if (!schema) {
          throw new Error(`Failed to load schema from ${input.schemaPath}`);
        }
        stages.push({
          stage: 'schema_inference',
          status: 'success',
          durationMs: Date.now() - schemaStart,
          details: { source: 'file', path: input.schemaPath },
        });
      } else if (input.apiDocsUrl) {
        // Infer from API docs
        const inferResult = await schemaInferrerService.inferFromUrl(input.apiDocsUrl, {
          connectorName: input.connector,
          outputPath: path.join(outputDir, 'schemas', `${input.connector}_schema.json`),
        });

        if (!inferResult.success || !inferResult.schema) {
          throw new Error(`Schema inference failed: ${inferResult.error}`);
        }

        // Convert parser schema to data generation schema format
        schema = this.convertParserSchemaToConnectorSchema(
          inferResult.schema,
          input.connector
        );

        const entityCount = schema.entities ? Object.keys(schema.entities).length : 0;
        stages.push({
          stage: 'schema_inference',
          status: 'success',
          durationMs: Date.now() - schemaStart,
          details: {
            source: 'api_docs',
            url: input.apiDocsUrl,
            parser: inferResult.parserUsed,
            confidence: inferResult.confidence,
            entityCount,
          },
        });
      } else {
        // Try to load from default schemas directory
        const defaultSchemaPath = path.join(process.cwd(), 'schemas', `${input.connector}.json`);
        schema = await this.loadSchemaFromFile(defaultSchemaPath);

        if (!schema) {
          throw new Error(
            `No schema source provided. Specify --api-docs, --schema, or ensure schemas/${input.connector}.json exists.`
          );
        }

        stages.push({
          stage: 'schema_inference',
          status: 'success',
          durationMs: Date.now() - schemaStart,
          details: { source: 'default', path: defaultSchemaPath },
        });
      }

      // At this point, schema should never be null (we throw if it is)
      if (!schema) {
        throw new Error('Schema is null after inference stage');
      }
      result.schema = schema;

      // Save schema to output directory
      const schemaOutputPath = path.join(outputDir, 'schemas', `${input.connector}_schema.json`);
      await fs.writeFile(schemaOutputPath, JSON.stringify(schema, null, 2));

      // ========================================================================
      // STAGE 2: OpenAPI Generation
      // ========================================================================
      const openApiStart = Date.now();
      status.currentStep = 'Stage 2: OpenAPI Generation';
      status.progress = 25;
      await this.writeStatus(statusFile, status);

      const openApiSpec = convertConnectorSchemaToOpenApi(schema as any);
      result.openApiSpec = openApiSpec;

      // Save OpenAPI spec
      const openApiPath = path.join(outputDir, 'schemas', `${input.connector}_openapi.yaml`);
      await fs.writeFile(openApiPath, yaml.dump(openApiSpec, { indent: 2, lineWidth: 120 }));

      stages.push({
        stage: 'openapi_generation',
        status: 'success',
        durationMs: Date.now() - openApiStart,
        details: {
          pathCount: Object.keys(openApiSpec.paths).length,
          schemaCount: Object.keys(openApiSpec.components.schemas).length,
          outputPath: openApiPath,
        },
      });

      // ========================================================================
      // STAGE 3: Data Generation
      // ========================================================================
      if (!input.skipDataGeneration) {
        const dataGenStart = Date.now();
        status.status = 'generating';
        status.currentStep = 'Stage 3: Data Generation';
        status.progress = 40;
        await this.writeStatus(statusFile, status);

        // Build GenerationBrief from input
        const brief = this.buildGenerationBrief(input, schema, jobId, outputDir, statusFile);

        // Execute data generation
        const outputManifest = await this.dataGenerationService.executeJob(brief, {
          outputFormat: 'wiremock',
        }, { [input.connector]: schema });

        result.dataGenerated = true;
        result.outputManifest = outputManifest;

        stages.push({
          stage: 'data_generation',
          status: 'success',
          durationMs: Date.now() - dataGenStart,
          details: {
            connectors: Object.keys(outputManifest.connectors),
            totalRecords: Object.values(outputManifest.connectors).reduce(
              (sum, c) => sum + (c.stats?.totalRecords || 0),
              0
            ),
          },
        });
      } else {
        stages.push({
          stage: 'data_generation',
          status: 'skipped',
          durationMs: 0,
          details: { reason: 'skipDataGeneration flag set' },
        });
      }

      // ========================================================================
      // STAGE 4: WireMock Setup
      // ========================================================================
      if (!input.skipWireMockSetup) {
        const wireMockStart = Date.now();
        status.currentStep = 'Stage 4: WireMock Setup';
        status.progress = 70;
        await this.writeStatus(statusFile, status);

        // Generate WireMock stubs from OpenAPI
        await this.stubGenerator.generateStubs(openApiSpec as any, {
          instanceId,
          connector: input.connector,
          dataDirectory: path.join(outputDir, 'data', input.connector),
          outputDirectory: path.join(process.cwd(), 'wiremock', 'mappings', instanceId),
        });

        // Register with WireMock proxy service
        await wiremockProxyService.createInstance(instanceId, {
          connector: input.connector,
          orgId: input.orgId,
          schemaPath: schemaOutputPath,
          dataPath: path.join(outputDir, 'data', input.connector),
        });

        result.wireMockConfigured = true;

        stages.push({
          stage: 'wiremock_setup',
          status: 'success',
          durationMs: Date.now() - wireMockStart,
          details: {
            instanceId,
            mappingsDirectory: path.join('wiremock', 'mappings', instanceId),
          },
        });
      } else {
        stages.push({
          stage: 'wiremock_setup',
          status: 'skipped',
          durationMs: 0,
          details: { reason: 'skipWireMockSetup flag set' },
        });
      }

      // ========================================================================
      // STAGE 5: Registry + Credentials
      // ========================================================================
      const registryStart = Date.now();
      status.currentStep = 'Stage 5: Registry & Credentials';
      status.progress = 90;
      await this.writeStatus(statusFile, status);

      // Setup SSL/DNS if not skipped
      let sslConfig: object | undefined;
      let baseUrl: string | undefined;

      if (!input.skipSsl) {
        const sslResult = await sslDnsService.setupSSL({
          instanceId,
          connector: input.connector,
          orgId: input.orgId,
        });

        if (sslResult.success && sslResult.config) {
          sslConfig = sslResult.config;
          baseUrl = sslResult.config.mockUrl;
        }
      }

      // Generate mock credentials
      const credentials = {
        clientId: `mock-${input.connector}-${input.orgId}-${jobId.slice(0, 8)}`,
        clientSecret: this.generateRandomString(32),
        tokenEndpoint: `${baseUrl || 'http://localhost:8080'}/oauth/token`,
        baseUrl: baseUrl || `http://localhost:8080${schema.baseUrl || '/api/v2'}`,
      };

      result.credentials = credentials;
      result.mockServerUrl = credentials.baseUrl;

      // Save credentials to output directory
      const credsPath = path.join(outputDir, 'credentials', `${input.connector}_creds.json`);
      await fs.writeFile(credsPath, JSON.stringify(credentials, null, 2));

      // Create registry entry
      const instance: Omit<MockServerInstance, 'id' | 'createdAt' | 'updatedAt'> = {
        instanceId,
        connector: input.connector,
        orgId: input.orgId,
        jobId: input.jobIdSuffix,
        status: 'active' as MockServerStatus,
        pgSchema: instanceId,
        sslConfig,
        baseUrl: credentials.baseUrl,
        authEndpoint: '/oauth/token',
        mockCredentials: credentials,
        apiDocsSource: input.apiDocsUrl,
      };

      // Check if instance exists
      const existingInstance = await registryService.get(instanceId);
      if (existingInstance) {
        await registryService.update(instanceId, {
          status: 'active' as MockServerStatus,
          mockCredentials: credentials,
        });
      } else {
        await registryService.create(instance);
      }

      stages.push({
        stage: 'registry_credentials',
        status: 'success',
        durationMs: Date.now() - registryStart,
        details: {
          instanceId,
          hasSSL: !!sslConfig,
          baseUrl: credentials.baseUrl,
        },
      });

      // ========================================================================
      // Complete
      // ========================================================================
      status.status = 'completed';
      status.currentStep = 'Pipeline complete';
      status.progress = 100;
      status.completedAt = new Date().toISOString();
      await this.writeStatus(statusFile, status);

      result.success = true;

      logger.info('Factory pipeline completed successfully', {
        instanceId,
        jobId,
        durationMs: Date.now() - startTime,
        stageCount: stages.length,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorDetails = error instanceof Error ? error.stack : undefined;

      // Determine which stage failed
      const failedStage =
        stages.length > 0 ? stages[stages.length - 1].stage : 'initialization';

      result.error = {
        stage: failedStage,
        message: errorMessage,
        details: errorDetails,
      };

      // Update status with error
      status.status = 'failed';
      status.currentStep = `Failed at ${failedStage}`;
      status.error = {
        code: 'PIPELINE_ERROR',
        message: errorMessage,
        details: errorDetails,
        recoverable: false,
      };
      await this.writeStatus(statusFile, status);

      logger.error('Factory pipeline failed', {
        instanceId,
        jobId,
        stage: failedStage,
        error: errorMessage,
      });

      return result;
    }
  }

  /**
   * Execute pipeline from a GenerationBrief (discover-AGX integration)
   */
  async executeFromBrief(brief: GenerationBrief): Promise<PipelineResult[]> {
    const results: PipelineResult[] = [];

    for (const connectorSpec of brief.connectors) {
      const input: PipelineInput = {
        jobId: brief.jobId,
        orgId: brief.orgId,
        connector: connectorSpec.name,
        apiDocsUrl: connectorSpec.apiSchemaUrl,
        industry: brief.metadata.industry,
        companySize: brief.metadata.companySize,
        region: brief.metadata.region,
        volume: connectorSpec.entities?.[0]?.estimatedVolume || 100,
        outputDirectory: brief.callbacks.outputDirectory,
        statusFile: brief.callbacks.statusFile,
        progressWebhook: brief.callbacks.progressWebhook,
        completionWebhook: brief.callbacks.completionWebhook,
      };

      const result = await this.execute(input);
      results.push(result);
    }

    return results;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private generateInstanceId(connector: string, orgId: string, jobId?: string): string {
    const safeConnector = connector.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const safeOrgId = orgId.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const safeJobId = jobId ? jobId.replace(/[^a-z0-9]/g, '_') : uuidv4().split('-')[0];
    return `${safeConnector}_${safeOrgId}_${safeJobId}`;
  }

  private generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private async loadSchemaFromFile(filePath: string): Promise<ConnectorSchema | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const rawSchema = JSON.parse(content);

      // Detect schema format and normalize
      // Array-based (NetSuite parser format): { entities: [...], name, auth, ... }
      // Object-based (Snowflake/expected format): { entities: {...}, connectorId, ... }
      if (Array.isArray(rawSchema.entities)) {
        // Convert array-based schema to object-based format
        return this.normalizeArrayBasedSchema(rawSchema);
      }

      return rawSchema as ConnectorSchema;
    } catch {
      return null;
    }
  }

  /**
   * Normalize a schema that uses array-based entities (like NetSuite parser output)
   * to the object-based format expected by the factory pipeline.
   */
  private normalizeArrayBasedSchema(rawSchema: {
    name?: string;
    version?: string;
    baseUrl?: string;
    auth?: { type: string; fields?: string[]; config?: Record<string, unknown> };
    entities?: Array<{
      name: string;
      tableName?: string;
      endpoints?: Array<{ method: string; path: string; operation?: string }>;
      fields?: Array<{
        name: string;
        type: string;
        required?: boolean;
        unique?: boolean;
        faker?: string;
        default?: unknown;
        foreignKey?: { entity: string; field: string };
      }>;
    }>;
    relationships?: unknown;
  }): ConnectorSchema {
    const connectorName = rawSchema.name || 'unknown';

    // Convert entities array to Record<string, EntitySchema>
    const entitiesRecord: Record<string, ConnectorSchema['entities'][string]> = {};

    for (const entity of rawSchema.entities || []) {
      entitiesRecord[entity.name.toLowerCase()] = {
        table: entity.tableName || entity.name.toLowerCase(),
        description: `${entity.name} entity`,
        fields: (entity.fields || []).map((field) => ({
          name: field.name,
          type: field.type,
          required: field.required ?? false,
          unique: field.unique,
          primaryKey: field.name === 'id',
          foreignKey: field.foreignKey
            ? { table: field.foreignKey.entity, column: field.foreignKey.field }
            : undefined,
          faker: field.faker,
          default: field.default,
        })),
      };
    }

    return {
      connectorId: connectorName,
      connectorName: connectorName,
      connectorType: 'api',
      version: rawSchema.version || '1.0.0',
      description: `${connectorName} connector`,
      authentication: rawSchema.auth ? {
        type: rawSchema.auth.type,
        fields: rawSchema.auth.fields,
        config: rawSchema.auth.config,
      } : { type: 'none' },
      baseUrl: rawSchema.baseUrl || '/api',
      entities: entitiesRecord,
    };
  }

  /**
   * Convert a schema from the parser format (connector-schema.ts) to the
   * data generation format (dataGeneration.ts ConnectorSchema)
   */
  private convertParserSchemaToConnectorSchema(
    parserSchema: ParserConnectorSchema,
    connectorName: string
  ): ConnectorSchema {
    // Convert entities array to Record<string, EntitySchema>
    const entitiesRecord: Record<string, ConnectorSchema['entities'][string]> = {};
    for (const entity of parserSchema.entities) {
      entitiesRecord[entity.name] = {
        table: entity.tableName,
        description: `${entity.name} entity`,
        fields: entity.fields.map((field) => ({
          name: field.name,
          type: field.type,
          required: field.required,
          unique: field.unique,
          primaryKey: false,
          foreignKey: field.foreignKey
            ? { table: field.foreignKey.entity, column: field.foreignKey.field }
            : undefined,
          faker: field.faker,
          default: field.default,
        })),
      };
    }

    return {
      connectorId: connectorName,
      connectorName: parserSchema.name || connectorName,
      connectorType: 'api',
      version: parserSchema.version || '1.0.0',
      description: `${connectorName} connector (auto-generated from API docs)`,
      authentication: {
        type: parserSchema.auth.type,
        fields: parserSchema.auth.fields,
        config: parserSchema.auth.config,
      },
      baseUrl: parserSchema.baseUrl,
      entities: entitiesRecord,
    };
  }

  private buildGenerationBrief(
    input: PipelineInput,
    schema: ConnectorSchema,
    jobId: string,
    outputDir: string,
    statusFile: string
  ): GenerationBrief {
    // Extract entities from schema
    const entities = Object.entries(schema.entities || {}).map(([name, _entity]) => ({
      name,
      estimatedVolume: input.volume || 100,
      inferFieldsFromApi: false,
    }));

    return {
      jobId,
      orgId: input.orgId,
      sessionId: jobId,
      callbacks: {
        outputDirectory: outputDir,
        statusFile,
        progressWebhook: input.progressWebhook,
        completionWebhook: input.completionWebhook,
      },
      connectors: [
        {
          name: input.connector,
          type: schema.connectorType || 'api',
          supported: true,
          apiSchemaUrl: input.apiDocsUrl,
          entities,
        },
      ],
      metadata: {
        industry: input.industry || 'technology',
        companySize: input.companySize as 'startup' | 'small' | 'medium' | 'enterprise' | undefined,
        region: input.region,
      },
    };
  }

  private async writeStatus(statusFile: string, status: GenerationStatus): Promise<void> {
    status.updatedAt = new Date().toISOString();
    try {
      await fs.writeFile(statusFile, JSON.stringify(status, null, 2));
    } catch (error) {
      logger.warn('Failed to write status file', { statusFile, error });
    }
  }
}

// Export singleton instance
export const factoryPipelineService = new FactoryPipelineService();
export default factoryPipelineService;
