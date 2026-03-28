/**
 * Data Generation Types
 *
 * Types for the data generation pipeline supporting Tonic Fabricate,
 * Faker.js, and LLM-based generation engines.
 */

// ============================================================================
// Generation Brief - Input from discover-AGX frontend
// ============================================================================

export interface GenerationBrief {
  jobId: string;
  orgId: string;
  sessionId: string;

  callbacks: {
    progressWebhook?: string;
    completionWebhook?: string;
    outputDirectory: string;
    statusFile: string;
  };

  connectors: ConnectorSpec[];
  chaosConfig?: ChaosConfig;
  metadata: GenerationMetadata;
}

export interface ConnectorSpec {
  name: string;
  type?: string; // e.g., "erp", "data_warehouse", "productivity"
  supported?: boolean; // If false, mark as "twinning_in_progress"
  apiSchemaUrl?: string; // URL to official API docs for schema inference
  apiDocsUrl?: string; // Alias for apiSchemaUrl
  openApiSpec?: string;
  apiVersion?: string;
  entities: EntitySpec[];
  relationships?: RelationshipSpec[];
}

export interface EntitySpec {
  name: string;
  estimatedVolume: number;
  includeUnstructured?: boolean;
  fieldOverrides?: FieldOverride[];
}

export interface RelationshipSpec {
  from: string;
  to: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  foreignKey?: string;
}

export interface FieldOverride {
  fieldName: string;
  generator?: 'tonic' | 'faker' | 'llm';
  fakerMethod?: string;
  fakerArgs?: unknown[];
  llmPrompt?: string;
  staticValue?: unknown;
}

export interface GenerationMetadata {
  industry: string;
  companySize?: 'startup' | 'small' | 'medium' | 'enterprise';
  region?: string;
  vertical?: string;
  customContext?: string;
}

// ============================================================================
// Chaos Configuration
// ============================================================================

export interface ChaosConfig {
  enabled: boolean;
  errorRates?: {
    http400?: number;
    http401?: number;
    http403?: number;
    http404?: number;
    http429?: number;
    http500?: number;
    http502?: number;
    http503?: number;
  };
  latency?: {
    enabled: boolean;
    minMs?: number;
    maxMs?: number;
    fixedMs?: number;
  };
  dataAnomalies?: {
    nullFieldRate?: number;
    typeMismatchRate?: number;
    malformedJsonRate?: number;
    truncatedResponseRate?: number;
  };
  perEndpoint?: Record<string, Partial<ChaosConfig>>;
}

// ============================================================================
// Generation Status - Output to status.json
// ============================================================================

export type GenerationStatusType =
  | 'pending'
  | 'parsing'
  | 'generating'
  | 'loading'
  | 'completed'
  | 'failed';

export interface GenerationStatus {
  jobId: string;
  status: GenerationStatusType;
  progress: number; // 0-100
  currentStep: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;

  connectors: {
    [name: string]: ConnectorGenerationStatus;
  };

  outputs?: OutputManifest;
  error?: GenerationError;
}

export interface ConnectorGenerationStatus {
  status: GenerationStatusType;
  progress: number;
  currentEntity?: string;
  entitiesGenerated: number;
  totalEntities: number;
  recordsGenerated: number;
  totalRecords: number;
  errors?: string[];
}

export interface OutputManifest {
  connectors: {
    [name: string]: ConnectorOutput;
  };
}

export interface ConnectorOutput {
  status: 'ready' | 'error';
  dataFiles: string[];
  schemaFile: string;
  credentials: MockCredentials;
  mockServerConfig: MockServerConfig;
  stats: {
    totalRecords: number;
    entitiesGenerated: string[];
    generationTimeMs: number;
  };
}

export interface MockCredentials {
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  baseUrl: string;
}

export interface MockServerConfig {
  instanceId: string;
  baseUrl: string;
  apiBasePath: string;
  authEndpoint: string;
  chaosEnabled: boolean;
}

export interface GenerationError {
  code: string;
  message: string;
  details?: unknown;
  recoverable: boolean;
}

// ============================================================================
// Data Generation Engine Configuration
// ============================================================================

export type DataGenEngine = 'tonic' | 'faker' | 'llm' | 'sdv' | 'gretel';

export interface DataGenConfig {
  primaryEngine: DataGenEngine;
  fallbackChain: DataGenEngine[];
  engineOverrides: {
    [tableName: string]: {
      [fieldName: string]: DataGenEngine;
    };
  };
  costOptimization: boolean;
  maxRetries: number;
  timeoutMs: number;
}

export const DEFAULT_DATA_GEN_CONFIG: DataGenConfig = {
  primaryEngine: 'tonic',
  fallbackChain: ['tonic', 'faker', 'llm'],
  engineOverrides: {},
  costOptimization: false,
  maxRetries: 3,
  timeoutMs: 300000, // 5 minutes
};

export const DEV_DATA_GEN_CONFIG: DataGenConfig = {
  primaryEngine: 'faker',
  fallbackChain: ['faker', 'llm'],
  engineOverrides: {},
  costOptimization: true,
  maxRetries: 2,
  timeoutMs: 60000, // 1 minute
};

// ============================================================================
// Generation Plan - Internal orchestration
// ============================================================================

export interface GenerationPlan {
  jobId: string;
  tables: TableGenerationPlan[];
  executionOrder: string[]; // Topologically sorted (parents first)
  crossTableConstraints: CrossTableConstraint[];
  estimatedTotalRecords: number;
  estimatedTimeMs: number;
}

export interface TableGenerationPlan {
  tableName: string;
  entityName: string;
  rowCount: number;
  fields: FieldGenerationPlan[];
  dependencies: string[]; // Tables that must generate first
  dataGenerationHints?: DataGenerationHints;
}

export interface FieldGenerationPlan {
  fieldName: string;
  fieldType: string;
  engine: DataGenEngine;
  required: boolean;
  unique: boolean;
  primaryKey: boolean;
  foreignKey?: ForeignKeyConfig;
  engineConfig: EngineConfig;
  postProcessing?: PostProcessingStep[];
}

export interface ForeignKeyConfig {
  table: string;
  column: string;
}

export type EngineConfig =
  | TonicEngineConfig
  | FakerEngineConfig
  | LlmEngineConfig
  | StaticEngineConfig;

export interface TonicEngineConfig {
  type: 'tonic';
  workspace?: string;
  database?: string;
  tableConfig?: Record<string, unknown>;
}

export interface FakerEngineConfig {
  type: 'faker';
  method: string;
  args?: unknown[];
  locale?: string;
}

export interface LlmEngineConfig {
  type: 'llm';
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface StaticEngineConfig {
  type: 'static';
  value: unknown;
}

export type PostProcessingStep =
  | { type: 'llm_enhance'; prompt: string }
  | { type: 'validate_fk'; targetTable: string; targetColumn: string }
  | { type: 'apply_constraint'; constraint: CrossTableConstraint }
  | { type: 'format'; format: string };

export interface CrossTableConstraint {
  type: 'date_order' | 'amount_sum' | 'status_transition' | 'custom';
  tables: string[];
  fields: string[];
  rule: string;
  description: string;
}

export interface DataGenerationHints {
  [key: string]: unknown; // Index signature for compatibility
  count?: number;
  distribution?: Record<string, number>;
  ranges?: Record<string, { min: number; max: number; average?: number }>;
  patterns?: Record<string, string>;
}

// ============================================================================
// ConnectorSchema Types (matching schemas/*.json)
// ============================================================================

export interface ConnectorSchema {
  $schema?: string;
  connectorId: string;
  connectorName: string;
  connectorType: string;
  version: string;
  description: string;

  authentication: AuthenticationConfig;
  baseUrl: string;
  entities: Record<string, EntitySchema>;
  endpoints?: Record<string, Record<string, EndpointSchema>>;
  tableMapping?: Record<string, string>;
  dataGenerationHints?: Record<string, DataGenerationHints>;
  mockBehavior?: MockBehaviorConfig;
}

export interface AuthenticationConfig {
  type: string;
  flows?: string[];
  endpoints?: Record<string, string>;
  fields?: string[];
  config?: Record<string, unknown>;
  mockBehavior?: {
    acceptAnyCredentials?: boolean;
    tokenExpiresIn?: number;
    refreshTokenEnabled?: boolean;
  };
}

export interface EntitySchema {
  table: string;
  description?: string;
  fields: FieldSchema[];
  snowflakeObjectName?: string;
  snowflakeTableName?: string;
  snowflakeSchema?: string;
  snowflakeDatabase?: string;
}

export interface FieldSchema {
  name: string;
  type: string;
  required: boolean;
  unique?: boolean;
  primaryKey?: boolean;
  foreignKey?: ForeignKeyConfig;
  default?: unknown;
  description?: string;
  faker?: string;
  fakerArgs?: unknown[];
  snowflakeName?: string;
}

export interface EndpointSchema {
  method: string;
  path: string;
  description?: string;
  requestBody?: Record<string, unknown>;
  response?: Record<string, unknown>;
  pathParameters?: Record<string, unknown>;
  queryParameters?: Record<string, unknown>;
}

export interface MockBehaviorConfig {
  simulateAsyncExecution?: boolean;
  defaultExecutionTimeMs?: number;
  maxExecutionTimeMs?: number;
  supportedSqlCommands?: string[];
  defaultDatabase?: string;
  defaultSchema?: string;
  defaultWarehouse?: string;
  resultFormat?: string;
}

// ============================================================================
// Tonic Fabricate API Types
// ============================================================================

export interface FabricateDatabase {
  id: string;
  name: string;
  workspaceId: string;
  status: 'ready' | 'generating' | 'error';
  tables: FabricateTable[];
  createdAt: string;
  updatedAt: string;
}

export interface FabricateTable {
  name: string;
  rowCount: number;
  columns: FabricateColumn[];
}

export interface FabricateColumn {
  name: string;
  type: string;
  generator?: string;
  constraints?: Record<string, unknown>;
}

export interface FabricateGenerateRequest {
  workspace: string;
  database: string;
  format: 'sql' | 'sqlite' | 'csv' | 'jsonl' | 'xml';
  dest?: string;
  connection?: FabricateConnectionConfig;
  entity?: string;
  overwrite?: boolean;
}

export interface FabricateConnectionConfig {
  host: string;
  port: number;
  database_name: string;
  username: string;
  password: string;
  tls?: boolean;
}

export interface FabricateProgressEvent {
  phase: string;
  percentComplete: number;
  status: string;
  message?: string;
}

export interface FabricateWorkflow {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  outputFiles?: string[];
}

// ============================================================================
// Generator Interface
// ============================================================================

export interface DataGenerator {
  name: DataGenEngine;

  /**
   * Check if the generator is available and configured
   */
  isAvailable(): Promise<boolean>;

  /**
   * Generate data for a single table based on the plan
   */
  generateTable(
    plan: TableGenerationPlan,
    context: GenerationContext
  ): Promise<GeneratedTableData>;

  /**
   * Generate data for a single field (used for field-level overrides)
   */
  generateField?(
    fieldPlan: FieldGenerationPlan,
    rowCount: number,
    context: GenerationContext
  ): Promise<unknown[]>;

  /**
   * Enhance existing data with additional context (LLM only)
   */
  enhanceData?(
    data: GeneratedTableData,
    context: GenerationContext
  ): Promise<GeneratedTableData>;
}

export interface GenerationContext {
  jobId: string;
  connectorSchema: ConnectorSchema;
  brief: GenerationBrief;
  generatedTables: Map<string, GeneratedTableData>;
  config: DataGenConfig;
}

export interface GeneratedTableData {
  tableName: string;
  entityName: string;
  columns: string[];
  rows: Record<string, unknown>[];
  metadata: {
    generatedAt: string;
    generator: DataGenEngine;
    rowCount: number;
    generationTimeMs: number;
  };
}

// ============================================================================
// Output Types
// ============================================================================

export interface GeneratedDataOutput {
  format: 'json' | 'jsonl' | 'csv' | 'sql';
  files: GeneratedFile[];
  totalRecords: number;
  totalSizeBytes: number;
}

export interface GeneratedFile {
  path: string;
  tableName: string;
  format: string;
  recordCount: number;
  sizeBytes: number;
  checksum?: string;
}

export interface WireMockStateFile {
  path: string;
  entityName: string;
  data: Record<string, unknown>[];
  metadata: {
    generatedAt: string;
    recordCount: number;
    schema: string;
  };
}
