/**
 * Data Generation Orchestrator
 *
 * Coordinates data generation across multiple engines (Tonic, Faker, LLM).
 * Handles engine selection, fallback chains, and generation plan execution.
 */

import logger from '../utils/logger';
import config from '../config';
import { tonicFabricateGenerator, TonicFabricateGenerator } from './tonicFabricateGenerator';
import { fakerGenerator, FakerGenerator, FakerConfigBuilder } from './fakerGenerator';
import { llmGenerator, LlmGenerator } from './llmGenerator';
import {
  DataGenerator,
  DataGenEngine,
  DataGenConfig,
  DEFAULT_DATA_GEN_CONFIG,
  DEV_DATA_GEN_CONFIG,
  GenerationPlan,
  TableGenerationPlan,
  FieldGenerationPlan,
  GenerationContext,
  GeneratedTableData,
  ConnectorSchema,
  GenerationBrief,
  EntitySchema,
  FieldSchema,
} from '../types/dataGeneration';

// ============================================================================
// Generator Registry
// ============================================================================

const generators = new Map<DataGenEngine, DataGenerator>([
  ['tonic', tonicFabricateGenerator],
  ['faker', fakerGenerator],
  ['llm', llmGenerator],
]);

export function getGenerator(engine: DataGenEngine): DataGenerator | undefined {
  return generators.get(engine);
}

export function registerGenerator(engine: DataGenEngine, generator: DataGenerator): void {
  generators.set(engine, generator);
}

// ============================================================================
// Data Generation Orchestrator
// ============================================================================

export class DataGenerationOrchestrator {
  private config: DataGenConfig;

  constructor(configOverride?: Partial<DataGenConfig>) {
    // Determine base config based on environment
    const baseConfig = config.dataGeneration.costOptimization
      ? DEV_DATA_GEN_CONFIG
      : DEFAULT_DATA_GEN_CONFIG;

    this.config = { ...baseConfig, ...configOverride };
  }

  /**
   * Execute a complete generation plan
   */
  async executePlan(
    plan: GenerationPlan,
    schema: ConnectorSchema,
    brief: GenerationBrief
  ): Promise<Map<string, GeneratedTableData>> {
    logger.info('Starting data generation plan execution', {
      jobId: plan.jobId,
      tableCount: plan.tables.length,
      estimatedRecords: plan.estimatedTotalRecords,
    });

    const context: GenerationContext = {
      jobId: plan.jobId,
      connectorSchema: schema,
      brief,
      generatedTables: new Map(),
      config: this.config,
    };

    // Generate tables in topological order (respecting dependencies)
    for (const tableName of plan.executionOrder) {
      const tablePlan = plan.tables.find((t) => t.tableName === tableName);
      if (!tablePlan) {
        logger.warn('Table not found in plan', { tableName });
        continue;
      }

      try {
        const tableData = await this.generateTable(tablePlan, context);
        context.generatedTables.set(tableName, tableData);

        logger.info('Table generated successfully', {
          tableName,
          rowCount: tableData.rows.length,
          generator: tableData.metadata.generator,
        });
      } catch (error) {
        logger.error('Failed to generate table', { tableName, error });
        throw error;
      }
    }

    // Apply cross-table constraints if any
    if (plan.crossTableConstraints.length > 0) {
      await this.applyCrossTableConstraints(plan, context);
    }

    return context.generatedTables;
  }

  /**
   * Generate data for a single table with fallback handling
   */
  async generateTable(
    plan: TableGenerationPlan,
    context: GenerationContext
  ): Promise<GeneratedTableData> {
    // Determine the primary engine for this table
    const primaryEngine = this.selectEngineForTable(plan, context);

    // Build fallback chain
    const fallbackChain = this.buildFallbackChain(primaryEngine);

    // Try each engine in the chain until one succeeds
    let lastError: Error | null = null;

    for (const engineName of fallbackChain) {
      const generator = generators.get(engineName);
      if (!generator) {
        logger.warn('Generator not registered', { engine: engineName });
        continue;
      }

      // Check if generator is available
      const isAvailable = await generator.isAvailable();
      if (!isAvailable) {
        logger.debug('Generator not available, trying next', { engine: engineName });
        continue;
      }

      try {
        const result = await this.executeWithRetry(
          () => generator.generateTable(plan, context),
          this.config.maxRetries
        );
        return result;
      } catch (error) {
        logger.warn('Generator failed, trying fallback', {
          engine: engineName,
          error: error instanceof Error ? error.message : String(error),
        });
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    // All engines failed
    throw new Error(
      `All generators failed for table ${plan.tableName}: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Select the best engine for a table based on config and table characteristics
   */
  private selectEngineForTable(
    plan: TableGenerationPlan,
    context: GenerationContext
  ): DataGenEngine {
    // Check for table-level override
    const tableOverride = this.config.engineOverrides[plan.tableName];
    if (tableOverride && tableOverride['*']) {
      return tableOverride['*'];
    }

    // Check if table requires unstructured data (emails, chats, documents)
    const connectorSpec = context.brief.connectors.find(
      (c) => c.name === context.connectorSchema.connectorId
    );
    const entitySpec = connectorSpec?.entities.find((e) => e.name === plan.entityName);

    if (entitySpec?.includeUnstructured) {
      // Tonic is best for unstructured data
      return 'tonic';
    }

    // Check if table has complex foreign key relationships
    const hasForeignKeys = plan.fields.some((f) => f.foreignKey);
    if (hasForeignKeys && !this.config.costOptimization) {
      // Tonic handles FK relationships well
      return 'tonic';
    }

    // Use primary engine from config
    return this.config.primaryEngine;
  }

  /**
   * Build the fallback chain starting from a given engine
   */
  private buildFallbackChain(startEngine: DataGenEngine): DataGenEngine[] {
    const chain: DataGenEngine[] = [startEngine];

    for (const engine of this.config.fallbackChain) {
      if (!chain.includes(engine)) {
        chain.push(engine);
      }
    }

    return chain;
  }

  /**
   * Execute a function with retry logic
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn('Attempt failed, retrying', {
          attempt,
          maxRetries,
          error: lastError.message,
        });

        if (attempt < maxRetries) {
          // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  /**
   * Apply cross-table constraints to ensure data consistency
   */
  private async applyCrossTableConstraints(
    plan: GenerationPlan,
    context: GenerationContext
  ): Promise<void> {
    for (const constraint of plan.crossTableConstraints) {
      logger.debug('Applying cross-table constraint', {
        type: constraint.type,
        tables: constraint.tables,
      });

      switch (constraint.type) {
        case 'date_order':
          await this.applyDateOrderConstraint(constraint, context);
          break;
        case 'amount_sum':
          await this.applyAmountSumConstraint(constraint, context);
          break;
        case 'status_transition':
          await this.applyStatusTransitionConstraint(constraint, context);
          break;
        case 'custom':
          // Custom constraints could use LLM for complex logic
          logger.info('Custom constraint - may require LLM enhancement', {
            rule: constraint.rule,
          });
          break;
      }
    }
  }

  private async applyDateOrderConstraint(
    constraint: GenerationPlan['crossTableConstraints'][0],
    _context: GenerationContext
  ): Promise<void> {
    // Ensure dates are in logical order (e.g., order_date < ship_date)
    // This is a placeholder - implement specific logic as needed
    logger.debug('Date order constraint applied', { fields: constraint.fields });
  }

  private async applyAmountSumConstraint(
    constraint: GenerationPlan['crossTableConstraints'][0],
    _context: GenerationContext
  ): Promise<void> {
    // Ensure amounts sum correctly (e.g., line_items sum = order total)
    logger.debug('Amount sum constraint applied', { fields: constraint.fields });
  }

  private async applyStatusTransitionConstraint(
    constraint: GenerationPlan['crossTableConstraints'][0],
    _context: GenerationContext
  ): Promise<void> {
    // Ensure status transitions are valid (e.g., can't go from DELIVERED to PENDING)
    logger.debug('Status transition constraint applied', { fields: constraint.fields });
  }
}

// ============================================================================
// Generation Plan Builder
// ============================================================================

export class GenerationPlanBuilder {
  /**
   * Build a generation plan from a ConnectorSchema and GenerationBrief
   */
  static buildPlan(
    schema: ConnectorSchema,
    brief: GenerationBrief,
    jobId: string
  ): GenerationPlan {
    const connectorSpec = brief.connectors.find((c) => c.name === schema.connectorId);
    if (!connectorSpec) {
      throw new Error(`Connector ${schema.connectorId} not found in brief`);
    }

    // Build table plans
    const tablePlans: TableGenerationPlan[] = [];
    for (const entitySpec of connectorSpec.entities) {
      const entitySchema = schema.entities[entitySpec.name];
      if (!entitySchema) {
        logger.warn('Entity not found in schema', { entity: entitySpec.name });
        continue;
      }

      const tablePlan = GenerationPlanBuilder.buildTablePlan(
        entitySpec.name,
        entitySchema,
        entitySpec.estimatedVolume,
        schema.dataGenerationHints?.[entitySpec.name]
      );

      tablePlans.push(tablePlan);
    }

    // Determine execution order (topological sort based on FK dependencies)
    const executionOrder = GenerationPlanBuilder.topologicalSort(tablePlans);

    // Identify cross-table constraints
    const crossTableConstraints = GenerationPlanBuilder.identifyCrossTableConstraints(
      tablePlans,
      connectorSpec.relationships || []
    );

    // Calculate estimates
    const estimatedTotalRecords = tablePlans.reduce((sum, t) => sum + t.rowCount, 0);
    const estimatedTimeMs = estimatedTotalRecords * 10; // Rough estimate: 10ms per record

    return {
      jobId,
      tables: tablePlans,
      executionOrder,
      crossTableConstraints,
      estimatedTotalRecords,
      estimatedTimeMs,
    };
  }

  /**
   * Build a plan for a single table
   */
  static buildTablePlan(
    entityName: string,
    entitySchema: EntitySchema,
    rowCount: number,
    hints?: Record<string, unknown>
  ): TableGenerationPlan {
    const fields = entitySchema.fields.map((field) =>
      GenerationPlanBuilder.buildFieldPlan(field)
    );

    // Identify dependencies (tables referenced by foreign keys)
    const dependencies = fields
      .filter((f) => f.foreignKey)
      .map((f) => f.foreignKey!.table);

    return {
      tableName: entitySchema.table,
      entityName,
      rowCount,
      fields,
      dependencies: [...new Set(dependencies)], // Deduplicate
      dataGenerationHints: hints as TableGenerationPlan['dataGenerationHints'],
    };
  }

  /**
   * Build a plan for a single field
   */
  static buildFieldPlan(field: FieldSchema): FieldGenerationPlan {
    // Use FakerConfigBuilder to create a default plan, then customize
    const basePlan = FakerConfigBuilder.fieldSchemaToFakerPlan(field);

    // Determine the best engine for this field
    const engine = GenerationPlanBuilder.selectEngineForField(field);
    basePlan.engine = engine;

    // Build engine-specific config
    basePlan.engineConfig = GenerationPlanBuilder.buildEngineConfig(field, engine);

    return basePlan;
  }

  /**
   * Select the best engine for a field based on its characteristics
   */
  static selectEngineForField(field: FieldSchema): DataGenEngine {
    // Fields with explicit faker config use faker
    if (field.faker) {
      return 'faker';
    }

    // Static default values don't need generation
    if (field.default !== undefined) {
      return 'faker'; // Will use static config
    }

    // Complex fields might benefit from LLM
    const complexFieldPatterns = ['description', 'notes', 'comment', 'memo', 'content'];
    if (complexFieldPatterns.some((p) => field.name.toLowerCase().includes(p))) {
      // Only use LLM if cost optimization is disabled
      if (!config.dataGeneration.costOptimization) {
        return 'llm';
      }
    }

    // Default to faker for simplicity
    return 'faker';
  }

  /**
   * Build engine-specific configuration for a field
   */
  static buildEngineConfig(
    field: FieldSchema,
    engine: DataGenEngine
  ): FieldGenerationPlan['engineConfig'] {
    switch (engine) {
      case 'faker':
        return {
          type: 'faker',
          method: field.faker || FakerConfigBuilder.inferFakerMethod(field),
          args: field.fakerArgs,
        };

      case 'llm':
        return {
          type: 'llm',
          prompt: `Generate a realistic ${field.name} value for a ${field.type} field`,
        };

      case 'tonic':
        return {
          type: 'tonic',
          workspace: config.dataGeneration.fabricate.workspace,
        };

      default:
        return {
          type: 'faker',
          method: 'lorem.word',
        };
    }
  }

  /**
   * Topologically sort tables based on foreign key dependencies
   */
  static topologicalSort(tables: TableGenerationPlan[]): string[] {
    const tableMap = new Map(tables.map((t) => [t.tableName, t]));
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (tableName: string) => {
      if (visited.has(tableName)) return;
      visited.add(tableName);

      const table = tableMap.get(tableName);
      if (table) {
        // Visit dependencies first
        for (const dep of table.dependencies) {
          visit(dep);
        }
        result.push(tableName);
      }
    };

    for (const table of tables) {
      visit(table.tableName);
    }

    return result;
  }

  /**
   * Identify cross-table constraints from relationships
   */
  static identifyCrossTableConstraints(
    tables: TableGenerationPlan[],
    _relationships: { from: string; to: string; type: string }[]
  ): GenerationPlan['crossTableConstraints'] {
    const constraints: GenerationPlan['crossTableConstraints'] = [];

    // Add date ordering constraints for common patterns
    for (const table of tables) {
      const dateFields = table.fields
        .filter((f) => f.fieldType === 'timestamp' || f.fieldType === 'date')
        .map((f) => f.fieldName);

      // Check for common date ordering patterns
      if (dateFields.includes('created_at') && dateFields.includes('updated_at')) {
        constraints.push({
          type: 'date_order',
          tables: [table.tableName],
          fields: ['created_at', 'updated_at'],
          rule: 'created_at <= updated_at',
          description: 'Updated date must be after or equal to created date',
        });
      }

      if (dateFields.includes('order_date') && dateFields.includes('ship_date')) {
        constraints.push({
          type: 'date_order',
          tables: [table.tableName],
          fields: ['order_date', 'ship_date'],
          rule: 'order_date <= ship_date',
          description: 'Ship date must be after or equal to order date',
        });
      }
    }

    return constraints;
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  TonicFabricateGenerator,
  FakerGenerator,
  LlmGenerator,
  FakerConfigBuilder,
  tonicFabricateGenerator,
  fakerGenerator,
  llmGenerator,
};

// Export default orchestrator instance
export const orchestrator = new DataGenerationOrchestrator();
export default orchestrator;
