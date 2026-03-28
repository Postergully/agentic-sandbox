/**
 * Tonic Fabricate Generator
 *
 * Primary data generation engine using Tonic Fabricate API.
 * Handles both structured (tables with relationships) and
 * unstructured data (emails, chats, documents).
 */

import config from '../config';
import logger from '../utils/logger';
import {
  DataGenerator,
  TableGenerationPlan,
  GenerationContext,
  GeneratedTableData,
  FieldGenerationPlan,
} from '../types/dataGeneration';

// We'll dynamically import the client to handle cases where it's not installed
let fabricateClient: typeof import('@fabricate-tools/client') | null = null;

async function loadFabricateClient(): Promise<typeof import('@fabricate-tools/client') | null> {
  if (fabricateClient !== null) {
    return fabricateClient;
  }
  try {
    fabricateClient = await import('@fabricate-tools/client');
    return fabricateClient;
  } catch (error) {
    logger.warn('Tonic Fabricate client not available', { error });
    return null;
  }
}

export class TonicFabricateGenerator implements DataGenerator {
  name: 'tonic' = 'tonic';

  private apiKey: string;
  private apiUrl: string;
  private workspace: string;

  constructor() {
    this.apiKey = config.dataGeneration.fabricate.apiKey;
    this.apiUrl = config.dataGeneration.fabricate.apiUrl;
    this.workspace = config.dataGeneration.fabricate.workspace;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      logger.debug('Tonic Fabricate API key not configured');
      return false;
    }

    const client = await loadFabricateClient();
    if (!client) {
      return false;
    }

    try {
      // Test API connectivity by checking if we can access the workspace
      // This is a lightweight check that validates credentials
      const response = await fetch(`${this.apiUrl}/workspaces`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      return response.ok;
    } catch (error) {
      logger.warn('Tonic Fabricate API not reachable', { error });
      return false;
    }
  }

  async generateTable(
    plan: TableGenerationPlan,
    context: GenerationContext
  ): Promise<GeneratedTableData> {
    const startTime = Date.now();

    logger.info('Generating table with Tonic Fabricate', {
      tableName: plan.tableName,
      rowCount: plan.rowCount,
      jobId: context.jobId,
    });

    const client = await loadFabricateClient();
    if (!client) {
      throw new Error('Tonic Fabricate client not available');
    }

    try {
      // Build the Fabricate database configuration from the plan
      const fabricateConfig = this.buildFabricateConfig(plan, context);

      // Generate data using Fabricate
      const generatedData = await this.callFabricateAPI(
        fabricateConfig,
        plan,
        context
      );

      const endTime = Date.now();

      return {
        tableName: plan.tableName,
        entityName: plan.entityName,
        columns: plan.fields.map((f) => f.fieldName),
        rows: generatedData,
        metadata: {
          generatedAt: new Date().toISOString(),
          generator: 'tonic',
          rowCount: generatedData.length,
          generationTimeMs: endTime - startTime,
        },
      };
    } catch (error) {
      logger.error('Tonic Fabricate generation failed', {
        tableName: plan.tableName,
        error,
      });
      throw error;
    }
  }

  async generateField(
    fieldPlan: FieldGenerationPlan,
    rowCount: number,
    context: GenerationContext
  ): Promise<unknown[]> {
    // For single field generation, we use a simplified approach
    // This is mainly used for field-level overrides
    logger.debug('Generating single field with Tonic', {
      fieldName: fieldPlan.fieldName,
      rowCount,
    });

    // Create a minimal table plan for this single field
    const minimalPlan: TableGenerationPlan = {
      tableName: `_temp_${fieldPlan.fieldName}`,
      entityName: fieldPlan.fieldName,
      rowCount,
      fields: [fieldPlan],
      dependencies: [],
    };

    const result = await this.generateTable(minimalPlan, context);
    return result.rows.map((row) => row[fieldPlan.fieldName]);
  }

  private buildFabricateConfig(
    plan: TableGenerationPlan,
    context: GenerationContext
  ): FabricateTableConfig {
    // EntitySchema lookup is available if needed for additional context
    // const entitySchema = this.getEntitySchema(plan.entityName, context.connectorSchema);

    // Build column configurations from field plans
    const columns: FabricateColumnConfig[] = plan.fields.map((field) => {
      return this.fieldToFabricateColumn(field, context);
    });

    // Add industry context from the generation brief
    const industryContext = this.buildIndustryContext(context);

    return {
      tableName: plan.tableName,
      rowCount: plan.rowCount,
      columns,
      context: industryContext,
      relationships: this.buildRelationships(plan, context),
      dataGenerationHints: plan.dataGenerationHints,
    };
  }

  private fieldToFabricateColumn(
    field: FieldGenerationPlan,
    context: GenerationContext
  ): FabricateColumnConfig {
    const column: FabricateColumnConfig = {
      name: field.fieldName,
      type: this.mapFieldType(field.fieldType),
      nullable: !field.required,
      unique: field.unique,
      primaryKey: field.primaryKey,
    };

    // Handle foreign keys
    if (field.foreignKey) {
      column.foreignKey = {
        table: field.foreignKey.table,
        column: field.foreignKey.column,
      };

      // Get the generated values from the referenced table if available
      const referencedTable = context.generatedTables.get(field.foreignKey.table);
      if (referencedTable) {
        column.allowedValues = referencedTable.rows.map(
          (row) => row[field.foreignKey!.column]
        );
      }
    }

    // Apply engine-specific configuration
    if (field.engineConfig.type === 'tonic') {
      Object.assign(column, field.engineConfig.tableConfig || {});
    }

    return column;
  }

  private mapFieldType(fieldType: string): string {
    const typeMap: Record<string, string> = {
      uuid: 'uuid',
      string: 'text',
      text: 'text',
      varchar: 'text',
      integer: 'integer',
      int: 'integer',
      number: 'decimal',
      decimal: 'decimal',
      float: 'decimal',
      double: 'decimal',
      boolean: 'boolean',
      date: 'date',
      datetime: 'datetime',
      timestamp: 'datetime',
      json: 'json',
      object: 'json',
      array: 'array',
    };
    return typeMap[fieldType.toLowerCase()] || 'text';
  }

  private buildIndustryContext(context: GenerationContext): IndustryContext {
    const metadata = context.brief.metadata;
    return {
      industry: metadata.industry,
      companySize: metadata.companySize,
      region: metadata.region,
      vertical: metadata.vertical,
      customContext: metadata.customContext,
    };
  }

  private buildRelationships(
    plan: TableGenerationPlan,
    _context: GenerationContext
  ): FabricateRelationship[] {
    const relationships: FabricateRelationship[] = [];

    for (const field of plan.fields) {
      if (field.foreignKey) {
        relationships.push({
          fromTable: plan.tableName,
          fromColumn: field.fieldName,
          toTable: field.foreignKey.table,
          toColumn: field.foreignKey.column,
          type: 'many-to-one',
        });
      }
    }

    return relationships;
  }

  private async callFabricateAPI(
    fabricateConfig: FabricateTableConfig,
    plan: TableGenerationPlan,
    context: GenerationContext
  ): Promise<Record<string, unknown>[]> {
    // Build the API request
    const requestBody = {
      workspace: this.workspace,
      table: {
        name: fabricateConfig.tableName,
        rowCount: fabricateConfig.rowCount,
        columns: fabricateConfig.columns.map((col) => ({
          name: col.name,
          type: col.type,
          nullable: col.nullable,
          unique: col.unique,
          constraints: {
            primaryKey: col.primaryKey,
            foreignKey: col.foreignKey,
            allowedValues: col.allowedValues,
          },
        })),
      },
      context: fabricateConfig.context,
      relationships: fabricateConfig.relationships,
      format: 'jsonl',
      includeUnstructured: this.shouldIncludeUnstructured(plan, context),
    };

    logger.debug('Calling Fabricate API', {
      endpoint: `${this.apiUrl}/generate`,
      tableName: fabricateConfig.tableName,
      rowCount: fabricateConfig.rowCount,
    });

    try {
      const response = await fetch(`${this.apiUrl}/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fabricate API error: ${response.status} - ${errorText}`);
      }

      // Handle streaming response for progress tracking
      const data = await this.handleFabricateResponse(response, plan);
      return data;
    } catch (error) {
      logger.error('Fabricate API call failed', { error, tableName: plan.tableName });
      throw error;
    }
  }

  private shouldIncludeUnstructured(
    plan: TableGenerationPlan,
    context: GenerationContext
  ): boolean {
    // Check if any entities in the connector require unstructured data
    const connectorSpec = context.brief.connectors.find(
      (c) => c.name === context.connectorSchema.connectorId
    );

    if (!connectorSpec) return false;

    const entitySpec = connectorSpec.entities.find((e) => e.name === plan.entityName);
    return entitySpec?.includeUnstructured ?? false;
  }

  private async handleFabricateResponse(
    response: Response,
    _plan: TableGenerationPlan
  ): Promise<Record<string, unknown>[]> {
    const contentType = response.headers.get('content-type') || '';

    // Handle JSONL streaming response
    if (contentType.includes('application/x-ndjson') || contentType.includes('jsonl')) {
      const text = await response.text();
      const lines = text.trim().split('\n');
      return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    }

    // Handle regular JSON response
    if (contentType.includes('application/json')) {
      const json = (await response.json()) as Record<string, unknown> | Record<string, unknown>[];

      // Handle different response formats
      if (Array.isArray(json)) {
        return json;
      }

      if (json.data && Array.isArray(json.data)) {
        return json.data as Record<string, unknown>[];
      }

      if (json.rows && Array.isArray(json.rows)) {
        return json.rows as Record<string, unknown>[];
      }

      // Single object response
      return [json as Record<string, unknown>];
    }

    // Fallback: try to parse as JSON
    const text = await response.text();
    try {
      return JSON.parse(text) as Record<string, unknown>[];
    } catch {
      logger.warn('Could not parse Fabricate response', { contentType });
      return [];
    }
  }

  /**
   * Generate unstructured data (emails, chats, documents)
   * This is a Tonic Fabricate-specific capability
   */
  async generateUnstructuredData(
    type: 'email' | 'chat' | 'document' | 'note',
    count: number,
    context: GenerationContext
  ): Promise<UnstructuredDataItem[]> {
    logger.info('Generating unstructured data with Tonic Fabricate', {
      type,
      count,
      jobId: context.jobId,
    });

    const requestBody = {
      workspace: this.workspace,
      type,
      count,
      context: {
        industry: context.brief.metadata.industry,
        companySize: context.brief.metadata.companySize,
        customContext: context.brief.metadata.customContext,
      },
    };

    try {
      const response = await fetch(`${this.apiUrl}/generate/unstructured`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fabricate API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as { items?: UnstructuredDataItem[] };
      return data.items || [];
    } catch (error) {
      logger.error('Unstructured data generation failed', { error, type });
      throw error;
    }
  }
}

// ============================================================================
// Internal Types
// ============================================================================

interface FabricateTableConfig {
  tableName: string;
  rowCount: number;
  columns: FabricateColumnConfig[];
  context: IndustryContext;
  relationships: FabricateRelationship[];
  dataGenerationHints?: Record<string, unknown>;
}

interface FabricateColumnConfig {
  name: string;
  type: string;
  nullable: boolean;
  unique?: boolean;
  primaryKey?: boolean;
  foreignKey?: {
    table: string;
    column: string;
  };
  allowedValues?: unknown[];
}

interface IndustryContext {
  industry: string;
  companySize?: string;
  region?: string;
  vertical?: string;
  customContext?: string;
}

interface FabricateRelationship {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
}

interface UnstructuredDataItem {
  id: string;
  type: 'email' | 'chat' | 'document' | 'note';
  content: string;
  metadata: {
    subject?: string;
    from?: string;
    to?: string[];
    timestamp: string;
    participants?: string[];
    title?: string;
    tags?: string[];
  };
}

// Export singleton instance
export const tonicFabricateGenerator = new TonicFabricateGenerator();
export default tonicFabricateGenerator;
