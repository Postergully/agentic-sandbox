/**
 * Data Generation Service
 *
 * Coordinates the full data generation workflow:
 * 1. Parse GenerationBrief
 * 2. Load/infer ConnectorSchema
 * 3. Build generation plan
 * 4. Execute generation via orchestrator
 * 5. Load data into WireMock or PostgreSQL
 * 6. Report progress and completion
 */

import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger';
import {
  DataGenerationOrchestrator,
  GenerationPlanBuilder,
} from '../generators';
import {
  GenerationBrief,
  GenerationStatus,
  ConnectorSchema,
  GeneratedTableData,
  OutputManifest,
  WireMockStateFile,
  DataGenConfig,
} from '../types/dataGeneration';

export interface DataGenerationOptions {
  outputFormat?: 'wiremock' | 'postgresql' | 'json';
  skipValidation?: boolean;
  configOverride?: Partial<DataGenConfig>;
}

export class DataGenerationService {
  private orchestrator: DataGenerationOrchestrator;
  private statusUpdateInterval: NodeJS.Timeout | null = null;

  constructor(options?: DataGenerationOptions) {
    this.orchestrator = new DataGenerationOrchestrator(options?.configOverride);
  }

  /**
   * Execute a full data generation job from a GenerationBrief
   */
  async executeJob(
    brief: GenerationBrief,
    options: DataGenerationOptions = {},
    schemas?: Record<string, ConnectorSchema>
  ): Promise<OutputManifest> {
    const startTime = Date.now();

    logger.info('Starting data generation job', {
      jobId: brief.jobId,
      connectors: brief.connectors.map((c) => c.name),
      outputDir: brief.callbacks.outputDirectory,
    });

    // Initialize status
    const status: GenerationStatus = {
      jobId: brief.jobId,
      status: 'pending',
      progress: 0,
      currentStep: 'Initializing...',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      connectors: {},
    };

    // Start status updates
    this.startStatusUpdates(brief, status);

    try {
      // Ensure output directory exists
      await this.ensureOutputDirectory(brief.callbacks.outputDirectory);

      // Process each connector
      const outputs: OutputManifest = { connectors: {} };

      for (const connectorSpec of brief.connectors) {
        status.currentStep = `Processing connector: ${connectorSpec.name}`;
        status.status = 'parsing';
        await this.writeStatus(brief, status);

        // Load or infer schema (prefer in-memory passthrough over file lookup)
        const schema = schemas?.[connectorSpec.name] ?? await this.loadConnectorSchema(connectorSpec.name);
        if (!schema) {
          logger.error('Failed to load schema for connector', {
            connector: connectorSpec.name,
          });
          continue;
        }

        // Initialize connector status
        status.connectors[connectorSpec.name] = {
          status: 'generating',
          progress: 0,
          entitiesGenerated: 0,
          totalEntities: connectorSpec.entities.length,
          recordsGenerated: 0,
          totalRecords: connectorSpec.entities.reduce((sum, e) => sum + e.estimatedVolume, 0),
        };

        // Build generation plan
        status.currentStep = `Building generation plan for ${connectorSpec.name}`;
        await this.writeStatus(brief, status);

        const plan = GenerationPlanBuilder.buildPlan(schema, brief, brief.jobId);

        // Execute generation
        status.status = 'generating';
        status.currentStep = `Generating data for ${connectorSpec.name}`;
        await this.writeStatus(brief, status);

        const generatedData = await this.orchestrator.executePlan(plan, schema, brief);

        // Update progress
        status.connectors[connectorSpec.name].entitiesGenerated = generatedData.size;
        status.connectors[connectorSpec.name].recordsGenerated = Array.from(
          generatedData.values()
        ).reduce((sum, t) => sum + t.rows.length, 0);
        status.connectors[connectorSpec.name].status = 'loading';

        // Load data into output format
        status.status = 'loading';
        status.currentStep = `Loading data for ${connectorSpec.name}`;
        await this.writeStatus(brief, status);

        const outputFormat = options.outputFormat || 'wiremock';
        const dataFiles = await this.outputData(
          generatedData,
          brief,
          connectorSpec.name,
          outputFormat
        );

        // Build output manifest entry
        outputs.connectors[connectorSpec.name] = {
          status: 'ready',
          dataFiles,
          schemaFile: `schemas/${connectorSpec.name}_schema.json`,
          credentials: this.generateMockCredentials(connectorSpec.name, brief),
          mockServerConfig: {
            instanceId: `${connectorSpec.name}_${brief.orgId}_${brief.jobId}`,
            baseUrl: `https://mock.agentic-sandbox.com/${connectorSpec.name}`,
            apiBasePath: schema.baseUrl,
            authEndpoint: schema.authentication.endpoints?.token || '/oauth/token',
            chaosEnabled: brief.chaosConfig?.enabled || false,
          },
          stats: {
            totalRecords: status.connectors[connectorSpec.name].recordsGenerated,
            entitiesGenerated: Array.from(generatedData.keys()),
            generationTimeMs: Date.now() - startTime,
          },
        };

        status.connectors[connectorSpec.name].status = 'completed';
        status.connectors[connectorSpec.name].progress = 100;
      }

      // Calculate overall progress
      const connectorCount = Object.keys(status.connectors).length;
      const completedCount = Object.values(status.connectors).filter(
        (c) => c.status === 'completed'
      ).length;
      status.progress = Math.round((completedCount / connectorCount) * 100);

      // Mark as completed
      status.status = 'completed';
      status.currentStep = 'Generation complete';
      status.completedAt = new Date().toISOString();
      status.outputs = outputs;

      await this.writeStatus(brief, status);
      this.stopStatusUpdates();

      // Call completion webhook if configured
      if (brief.callbacks.completionWebhook) {
        await this.callWebhook(brief.callbacks.completionWebhook, status);
      }

      logger.info('Data generation job completed', {
        jobId: brief.jobId,
        totalRecords: Object.values(outputs.connectors).reduce(
          (sum, c) => sum + c.stats.totalRecords,
          0
        ),
        durationMs: Date.now() - startTime,
      });

      return outputs;
    } catch (error) {
      // Update status with error
      status.status = 'failed';
      status.currentStep = 'Generation failed';
      status.error = {
        code: 'GENERATION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error instanceof Error ? error.stack : undefined,
        recoverable: false,
      };

      await this.writeStatus(brief, status);
      this.stopStatusUpdates();

      logger.error('Data generation job failed', {
        jobId: brief.jobId,
        error,
      });

      throw error;
    }
  }

  /**
   * Load a ConnectorSchema from the schemas directory
   */
  async loadConnectorSchema(connectorName: string): Promise<ConnectorSchema | null> {
    const schemaPath = path.join(process.cwd(), 'schemas', `${connectorName}.json`);

    try {
      const content = await fs.readFile(schemaPath, 'utf-8');
      const rawSchema = JSON.parse(content);

      // Normalize array-based schemas (like NetSuite parser output) to object-based format
      if (Array.isArray(rawSchema.entities)) {
        return this.normalizeArrayBasedSchema(rawSchema, connectorName);
      }

      // Ensure connectorId is set for object-based schemas
      if (!rawSchema.connectorId) {
        rawSchema.connectorId = connectorName;
      }

      return rawSchema as ConnectorSchema;
    } catch (error) {
      logger.error('Failed to load connector schema', {
        connector: connectorName,
        path: schemaPath,
        error,
      });
      return null;
    }
  }

  /**
   * Normalize a schema that uses array-based entities to the object-based format
   */
  private normalizeArrayBasedSchema(
    rawSchema: {
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
    },
    connectorName: string
  ): ConnectorSchema {
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
      connectorName: rawSchema.name || connectorName,
      connectorType: 'api',
      version: rawSchema.version || '1.0.0',
      description: `${connectorName} connector`,
      authentication: rawSchema.auth
        ? {
            type: rawSchema.auth.type,
            fields: rawSchema.auth.fields,
            config: rawSchema.auth.config,
          }
        : { type: 'none' },
      baseUrl: rawSchema.baseUrl || '/api',
      entities: entitiesRecord,
    };
  }

  /**
   * Output generated data in the specified format
   */
  private async outputData(
    data: Map<string, GeneratedTableData>,
    brief: GenerationBrief,
    connectorName: string,
    format: 'wiremock' | 'postgresql' | 'json'
  ): Promise<string[]> {
    const outputDir = brief.callbacks.outputDirectory;
    const dataDir = path.join(outputDir, 'data', connectorName);
    await fs.mkdir(dataDir, { recursive: true });

    const files: string[] = [];

    switch (format) {
      case 'wiremock':
        files.push(...(await this.outputToWireMock(data, dataDir, connectorName)));
        break;

      case 'json':
        files.push(...(await this.outputToJson(data, dataDir)));
        break;

      case 'postgresql':
        // PostgreSQL loading would go through the existing database services
        logger.info('PostgreSQL output - data will be loaded via database service');
        files.push(...(await this.outputToJson(data, dataDir)));
        break;
    }

    return files;
  }

  /**
   * Output data to WireMock __files directory format
   */
  private async outputToWireMock(
    data: Map<string, GeneratedTableData>,
    dataDir: string,
    connectorName: string
  ): Promise<string[]> {
    const files: string[] = [];

    // Also write to wiremock/__files for direct WireMock use
    const wiremockDir = path.join(process.cwd(), 'wiremock', '__files', connectorName);
    await fs.mkdir(wiremockDir, { recursive: true });

    for (const [tableName, tableData] of data) {
      // Create WireMock state file
      const stateFile: WireMockStateFile = {
        path: `${connectorName}/${tableData.entityName}.json`,
        entityName: tableData.entityName,
        data: tableData.rows as Record<string, unknown>[],
        metadata: {
          generatedAt: tableData.metadata.generatedAt,
          recordCount: tableData.metadata.rowCount,
          schema: tableName,
        },
      };

      // Write to data directory
      const filePath = path.join(dataDir, `${tableData.entityName}.json`);
      await fs.writeFile(filePath, JSON.stringify(stateFile, null, 2));
      files.push(`data/${connectorName}/${tableData.entityName}.json`);

      // Write to wiremock/__files
      const wiremockFilePath = path.join(wiremockDir, `${tableData.entityName}.json`);
      await fs.writeFile(wiremockFilePath, JSON.stringify(tableData.rows, null, 2));

      logger.debug('Wrote WireMock state file', {
        entity: tableData.entityName,
        recordCount: tableData.rows.length,
        path: wiremockFilePath,
      });
    }

    // Write relationships file
    const relationships = this.extractRelationships(data);
    if (relationships.length > 0) {
      const relPath = path.join(dataDir, '_relationships.json');
      await fs.writeFile(relPath, JSON.stringify(relationships, null, 2));
      files.push(`data/${connectorName}/_relationships.json`);
    }

    return files;
  }

  /**
   * Output data to plain JSON files
   */
  private async outputToJson(
    data: Map<string, GeneratedTableData>,
    dataDir: string
  ): Promise<string[]> {
    const files: string[] = [];

    for (const [_tableName, tableData] of data) {
      const filePath = path.join(dataDir, `${tableData.entityName}.json`);
      await fs.writeFile(filePath, JSON.stringify(tableData.rows, null, 2));
      files.push(filePath);
    }

    return files;
  }

  /**
   * Extract relationship information from generated data
   */
  private extractRelationships(
    _data: Map<string, GeneratedTableData>
  ): Array<{ from: string; to: string; field: string; count: number }> {
    // This would analyze FK relationships in the data
    // Placeholder for now
    return [];
  }

  /**
   * Generate mock credentials for a connector
   */
  private generateMockCredentials(
    connectorName: string,
    brief: GenerationBrief
  ): {
    clientId: string;
    clientSecret: string;
    tokenEndpoint: string;
    baseUrl: string;
  } {
    const randomSecret = this.generateRandomString(32);

    return {
      clientId: `mock-${connectorName}-${brief.orgId}-${brief.jobId}`,
      clientSecret: randomSecret,
      tokenEndpoint: `https://mock.agentic-sandbox.com/${connectorName}/oauth/token`,
      baseUrl: `https://mock.agentic-sandbox.com/${connectorName}`,
    };
  }

  private generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Ensure the output directory exists
   */
  private async ensureOutputDirectory(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, 'data'), { recursive: true });
    await fs.mkdir(path.join(dir, 'schemas'), { recursive: true });
    await fs.mkdir(path.join(dir, 'credentials'), { recursive: true });
  }

  /**
   * Write status to the status file
   */
  private async writeStatus(
    brief: GenerationBrief,
    status: GenerationStatus
  ): Promise<void> {
    status.updatedAt = new Date().toISOString();

    try {
      await fs.writeFile(brief.callbacks.statusFile, JSON.stringify(status, null, 2));
    } catch (error) {
      logger.error('Failed to write status file', {
        statusFile: brief.callbacks.statusFile,
        error,
      });
    }

    // Call progress webhook if configured
    if (brief.callbacks.progressWebhook) {
      await this.callWebhook(brief.callbacks.progressWebhook, status);
    }
  }

  /**
   * Start periodic status updates
   */
  private startStatusUpdates(brief: GenerationBrief, status: GenerationStatus): void {
    // Update status every 5 seconds
    this.statusUpdateInterval = setInterval(async () => {
      await this.writeStatus(brief, status);
    }, 5000);
  }

  /**
   * Stop periodic status updates
   */
  private stopStatusUpdates(): void {
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
      this.statusUpdateInterval = null;
    }
  }

  /**
   * Call a webhook with status data
   */
  private async callWebhook(url: string, data: GenerationStatus): Promise<void> {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (error) {
      logger.warn('Failed to call webhook', { url, error });
    }
  }
}

// Export singleton instance
export const dataGenerationService = new DataGenerationService();
export default dataGenerationService;
