/**
 * Instance Manager Service
 *
 * Service for managing mock server instance lifecycle (Module 4 in task-progress.md).
 * Handles PostgreSQL schema creation/deletion, migrations, and data loading.
 *
 * Instance Structure:
 *   - Each instance gets its own PostgreSQL schema (e.g., netsuite_sharechat_331)
 *   - Schema contains tables based on ConnectorSchema entities
 *   - Data is loaded from generated JSON files or GenerationBrief output
 *
 * Key Operations:
 *   - provisionInstance: Create schema, run migrations, load data
 *   - teardownInstance: Drop schema and clean up resources
 *   - updateInstanceStatus: Update registry status
 */

import database from '../config/database';
import { registryService } from './registryService';
import { ConnectorSchema, EntityDefinition, FieldDefinition } from '../schema/connector-schema';
import { MockServerInstance, MockServerStatus } from '../types';
import logger from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface ProvisionOptions {
  /** Instance ID (e.g., netsuite_sharechat_331) */
  instanceId: string;
  /** Parsed connector schema */
  connectorSchema: ConnectorSchema;
  /** Generated data to load (entity name -> records) */
  generatedData?: Record<string, Record<string, unknown>[]>;
  /** Mock credentials to configure */
  mockCredentials?: {
    clientId: string;
    clientSecret: string;
    apiKey?: string;
  };
  /** Base URL for the mock server */
  baseUrl?: string;
  /** API base path */
  apiBasePath?: string;
  /** Auth endpoint */
  authEndpoint?: string;
}

export interface ProvisionResult {
  success: boolean;
  instanceId: string;
  pgSchema: string;
  tablesCreated: string[];
  recordsLoaded: Record<string, number>;
  error?: string;
}

export interface TeardownResult {
  success: boolean;
  instanceId: string;
  tablesDropped: number;
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map TypeScript/JSON field types to PostgreSQL types
 */
function mapFieldTypeToPostgres(field: FieldDefinition): string {
  const typeMapping: Record<string, string> = {
    string: 'TEXT',
    text: 'TEXT',
    number: 'NUMERIC',
    integer: 'INTEGER',
    int: 'INTEGER',
    bigint: 'BIGINT',
    float: 'REAL',
    double: 'DOUBLE PRECISION',
    decimal: 'DECIMAL(18,2)',
    boolean: 'BOOLEAN',
    bool: 'BOOLEAN',
    date: 'DATE',
    datetime: 'TIMESTAMP',
    timestamp: 'TIMESTAMP',
    time: 'TIME',
    json: 'JSONB',
    object: 'JSONB',
    array: 'JSONB',
    uuid: 'UUID',
    email: 'TEXT',
    url: 'TEXT',
    phone: 'TEXT',
    currency: 'DECIMAL(18,2)',
    percent: 'DECIMAL(5,2)',
    enum: 'TEXT',
  };

  const baseType = field.type.toLowerCase();
  return typeMapping[baseType] || 'TEXT';
}

/**
 * Generate CREATE TABLE SQL for an entity
 */
function generateCreateTableSQL(
  schemaName: string,
  entity: EntityDefinition
): string {
  const columns: string[] = [];

  // Check if entity has an 'id' field
  const hasIdField = entity.fields.some(
    (f: FieldDefinition) => f.name.toLowerCase() === 'id'
  );

  // Add primary key column if not in fields
  if (!hasIdField) {
    columns.push('id UUID PRIMARY KEY DEFAULT uuid_generate_v4()');
  }

  // Add entity fields
  for (const field of entity.fields) {
    const pgType = mapFieldTypeToPostgres(field);
    const nullable = field.required ? ' NOT NULL' : '';
    const isIdField = field.name.toLowerCase() === 'id';
    const primaryKey = isIdField && hasIdField ? ' PRIMARY KEY' : '';
    const defaultValue =
      field.default !== undefined
        ? ` DEFAULT ${formatDefaultValue(field.default)}`
        : '';

    columns.push(
      `"${field.name}" ${pgType}${nullable}${primaryKey}${defaultValue}`
    );
  }

  // Add timestamps
  columns.push('created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
  columns.push('updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

  const tableName = entity.tableName || entity.name.toLowerCase();

  return `CREATE TABLE IF NOT EXISTS "${schemaName}"."${tableName}" (\n  ${columns.join(',\n  ')}\n);`;
}

/**
 * Format default value for SQL
 */
function formatDefaultValue(value: unknown): string {
  if (value === null) return 'NULL';
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') return `'${JSON.stringify(value)}'::jsonb`;
  return 'NULL';
}

/**
 * Generate INSERT SQL for data records
 */
function generateInsertSQL(
  schemaName: string,
  tableName: string,
  records: Record<string, unknown>[]
): string[] {
  if (records.length === 0) return [];

  const statements: string[] = [];

  for (const record of records) {
    const columns = Object.keys(record);
    const values = columns.map((col) => formatValue(record[col]));

    statements.push(
      `INSERT INTO "${schemaName}"."${tableName}" ("${columns.join('", "')}") VALUES (${values.join(', ')});`
    );
  }

  return statements;
}

/**
 * Format value for SQL INSERT
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === 'object') return `'${JSON.stringify(value)}'::jsonb`;
  return 'NULL';
}

// ============================================================================
// Service Class
// ============================================================================

class InstanceManagerService {
  /**
   * Provision a new mock server instance
   *
   * Creates PostgreSQL schema, tables, and loads initial data
   */
  async provisionInstance(options: ProvisionOptions): Promise<ProvisionResult> {
    const { instanceId, connectorSchema, generatedData } = options;
    const pgSchema = instanceId; // Schema name matches instance ID

    const tablesCreated: string[] = [];
    const recordsLoaded: Record<string, number> = {};

    try {
      logger.info(`InstanceManager: Provisioning instance ${instanceId}`);

      // Update registry status to 'creating'
      await registryService.update(instanceId, {
        status: 'creating' as MockServerStatus,
        connectorSchema: connectorSchema as object,
      });

      // Step 1: Create PostgreSQL schema
      await database.query(`CREATE SCHEMA IF NOT EXISTS "${pgSchema}"`);
      logger.info(`InstanceManager: Created schema ${pgSchema}`);

      // Step 2: Create tables for each entity
      for (const entity of connectorSchema.entities) {
        const createTableSQL = generateCreateTableSQL(pgSchema, entity);
        await database.query(createTableSQL);

        const tableName = entity.tableName || entity.name.toLowerCase();
        tablesCreated.push(tableName);
        logger.info(`InstanceManager: Created table ${pgSchema}.${tableName}`);
      }

      // Step 3: Load generated data if provided
      if (generatedData) {
        for (const [entityName, records] of Object.entries(generatedData)) {
          if (records.length === 0) continue;

          const entity = connectorSchema.entities.find(
            (e) => e.name === entityName || e.tableName === entityName
          );

          if (!entity) {
            logger.warn(
              `InstanceManager: No entity found for data: ${entityName}`
            );
            continue;
          }

          const tableName = entity.tableName || entity.name.toLowerCase();
          const insertStatements = generateInsertSQL(pgSchema, tableName, records);

          for (const sql of insertStatements) {
            await database.query(sql);
          }

          recordsLoaded[entityName] = records.length;
          logger.info(
            `InstanceManager: Loaded ${records.length} records into ${pgSchema}.${tableName}`
          );
        }
      }

      // Step 4: Update registry with completion info
      await registryService.update(instanceId, {
        status: 'active' as MockServerStatus,
        baseUrl: options.baseUrl,
        apiBasePath: options.apiBasePath,
        authEndpoint: options.authEndpoint,
        mockCredentials: options.mockCredentials as object,
        entityCount: tablesCreated.length,
        recordCounts: recordsLoaded,
      });

      logger.info(`InstanceManager: Successfully provisioned ${instanceId}`);

      return {
        success: true,
        instanceId,
        pgSchema,
        tablesCreated,
        recordsLoaded,
      };
    } catch (error) {
      logger.error(`InstanceManager: Failed to provision ${instanceId}`, error);

      // Update registry with error status
      await registryService
        .update(instanceId, {
          status: 'error' as MockServerStatus,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        })
        .catch((e) => logger.error('Failed to update error status', e));

      return {
        success: false,
        instanceId,
        pgSchema,
        tablesCreated,
        recordsLoaded,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Teardown a mock server instance
   *
   * Drops PostgreSQL schema and all its contents
   */
  async teardownInstance(instanceId: string): Promise<TeardownResult> {
    try {
      logger.info(`InstanceManager: Tearing down instance ${instanceId}`);

      // Get instance info
      const instance = await registryService.get(instanceId);
      if (!instance) {
        return {
          success: false,
          instanceId,
          tablesDropped: 0,
          error: `Instance ${instanceId} not found`,
        };
      }

      const pgSchema = instance.pgSchema;

      // Count tables before dropping
      const countResult = await database.query(
        `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = $1`,
        [pgSchema]
      );
      const tableCount = parseInt(countResult.rows[0]?.count || '0', 10);

      // Drop schema with all contents
      await database.query(`DROP SCHEMA IF EXISTS "${pgSchema}" CASCADE`);
      logger.info(
        `InstanceManager: Dropped schema ${pgSchema} with ${tableCount} tables`
      );

      // Delete from registry
      await registryService.delete(instanceId);

      return {
        success: true,
        instanceId,
        tablesDropped: tableCount,
      };
    } catch (error) {
      logger.error(`InstanceManager: Failed to teardown ${instanceId}`, error);

      return {
        success: false,
        instanceId,
        tablesDropped: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update instance status
   */
  async updateStatus(
    instanceId: string,
    status: MockServerStatus,
    errorMessage?: string
  ): Promise<void> {
    await registryService.update(instanceId, {
      status,
      errorMessage,
    });
    logger.info(`InstanceManager: Updated ${instanceId} status to ${status}`);
  }

  /**
   * Get instance details
   */
  async getInstance(instanceId: string): Promise<MockServerInstance | null> {
    return registryService.get(instanceId);
  }

  /**
   * List tables in an instance's schema
   */
  async listTables(instanceId: string): Promise<string[]> {
    const instance = await registryService.get(instanceId);
    if (!instance) {
      return [];
    }

    const result = await database.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
      [instance.pgSchema]
    );

    return result.rows.map((row: { table_name: string }) => row.table_name);
  }

  /**
   * Get record count for a table
   */
  async getTableRecordCount(
    instanceId: string,
    tableName: string
  ): Promise<number> {
    const instance = await registryService.get(instanceId);
    if (!instance) {
      return 0;
    }

    const result = await database.query(
      `SELECT COUNT(*) as count FROM "${instance.pgSchema}"."${tableName}"`
    );

    return parseInt(result.rows[0]?.count || '0', 10);
  }

  /**
   * Query data from an instance's table
   */
  async queryTable(
    instanceId: string,
    tableName: string,
    options?: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      where?: string;
    }
  ): Promise<Record<string, unknown>[]> {
    const instance = await registryService.get(instanceId);
    if (!instance) {
      return [];
    }

    let sql = `SELECT * FROM "${instance.pgSchema}"."${tableName}"`;

    if (options?.where) {
      sql += ` WHERE ${options.where}`;
    }
    if (options?.orderBy) {
      sql += ` ORDER BY ${options.orderBy}`;
    }
    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
    }
    if (options?.offset) {
      sql += ` OFFSET ${options.offset}`;
    }

    const result = await database.query(sql);
    return result.rows as Record<string, unknown>[];
  }

  /**
   * Check if instance schema exists
   */
  async schemaExists(instanceId: string): Promise<boolean> {
    const result = await database.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      [instanceId]
    );
    return result.rows.length > 0;
  }

  /**
   * Clone an existing instance
   *
   * Creates a new schema with the same structure and optionally copies data
   */
  async cloneInstance(
    sourceInstanceId: string,
    targetInstanceId: string,
    options?: {
      copyData?: boolean;
      newOrgId?: string;
      newJobId?: string;
    }
  ): Promise<ProvisionResult> {
    try {
      logger.info(
        `InstanceManager: Cloning ${sourceInstanceId} to ${targetInstanceId}`
      );

      // Get source instance
      const source = await registryService.get(sourceInstanceId);
      if (!source) {
        return {
          success: false,
          instanceId: targetInstanceId,
          pgSchema: targetInstanceId,
          tablesCreated: [],
          recordsLoaded: {},
          error: `Source instance ${sourceInstanceId} not found`,
        };
      }

      if (!source.connectorSchema) {
        return {
          success: false,
          instanceId: targetInstanceId,
          pgSchema: targetInstanceId,
          tablesCreated: [],
          recordsLoaded: {},
          error: `Source instance ${sourceInstanceId} has no connector schema`,
        };
      }

      // If copying data, extract from source schema
      let generatedData: Record<string, Record<string, unknown>[]> | undefined;

      if (options?.copyData) {
        generatedData = {};
        const tables = await this.listTables(sourceInstanceId);

        for (const table of tables) {
          const records = await this.queryTable(sourceInstanceId, table);
          if (records.length > 0) {
            generatedData[table] = records;
          }
        }
      }

      // Provision new instance
      return this.provisionInstance({
        instanceId: targetInstanceId,
        connectorSchema: source.connectorSchema as ConnectorSchema,
        generatedData,
        mockCredentials: source.mockCredentials as ProvisionOptions['mockCredentials'],
        baseUrl: source.baseUrl,
        apiBasePath: source.apiBasePath,
        authEndpoint: source.authEndpoint,
      });
    } catch (error) {
      logger.error(
        `InstanceManager: Failed to clone ${sourceInstanceId}`,
        error
      );

      return {
        success: false,
        instanceId: targetInstanceId,
        pgSchema: targetInstanceId,
        tablesCreated: [],
        recordsLoaded: {},
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Export singleton instance
export const instanceManagerService = new InstanceManagerService();
export default instanceManagerService;
