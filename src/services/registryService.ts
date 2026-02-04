/**
 * Registry Service
 *
 * Service for managing mock server instances in the mock_server_registry table.
 * Each connector instance (e.g., netsuite_sharechat_331) gets tracked here
 * for lifecycle management and data isolation.
 */

import { v4 as uuidv4 } from 'uuid';
import database from '../config/database';
import logger from '../utils/logger';

/**
 * Status values for mock server instances
 */
export type MockServerStatus = 'creating' | 'active' | 'stopped' | 'error';

/**
 * Mock server instance record
 */
export interface MockServerInstance {
  id?: string;
  instanceId: string;              // e.g., netsuite_sharechat_331
  connector: string;               // e.g., netsuite
  orgId: string;                   // e.g., sharechat
  jobId?: string;                  // e.g., 331
  status: MockServerStatus;
  errorMessage?: string;
  createdAt?: Date;
  updatedAt?: Date;
  lastAccessedAt?: Date;
  generationBrief?: object;        // GenerationBrief JSONB
  connectorSchema?: object;        // ConnectorSchema JSONB
  sslConfig?: object;              // SSL config JSONB
  baseUrl?: string;
  apiBasePath?: string;
  authEndpoint?: string;
  mockCredentials?: object;
  entityCount?: number;
  recordCounts?: object;
  apiDocsSource?: string;
  pgSchema: string;
}

/**
 * Filter options for listing instances
 */
export interface RegistryFilter {
  connector?: string;
  orgId?: string;
  status?: MockServerStatus;
}

/**
 * Registry Service Class
 *
 * Provides CRUD operations for mock server instance management.
 */
class RegistryService {
  /**
   * Create a new mock server instance record
   *
   * @param instance - Instance data (without id, createdAt, updatedAt)
   * @returns The created instance_id
   */
  async create(
    instance: Omit<MockServerInstance, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const id = uuidv4();

    logger.info(`Creating registry entry for instance: ${instance.instanceId}`);

    await database.query(
      `INSERT INTO mock_server_registry (
        id, instance_id, connector, org_id, job_id, status, error_message,
        last_accessed_at, generation_brief, connector_schema, ssl_config,
        base_url, api_base_path, auth_endpoint, mock_credentials,
        entity_count, record_counts, api_docs_source, pg_schema
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      )`,
      [
        id,
        instance.instanceId,
        instance.connector,
        instance.orgId,
        instance.jobId || null,
        instance.status,
        instance.errorMessage || null,
        instance.lastAccessedAt || null,
        instance.generationBrief ? JSON.stringify(instance.generationBrief) : null,
        instance.connectorSchema ? JSON.stringify(instance.connectorSchema) : null,
        instance.sslConfig ? JSON.stringify(instance.sslConfig) : null,
        instance.baseUrl || null,
        instance.apiBasePath || null,
        instance.authEndpoint || null,
        instance.mockCredentials ? JSON.stringify(instance.mockCredentials) : null,
        instance.entityCount || 0,
        instance.recordCounts ? JSON.stringify(instance.recordCounts) : '{}',
        instance.apiDocsSource || null,
        instance.pgSchema,
      ]
    );

    logger.info(`Created registry entry: ${instance.instanceId}`);
    return instance.instanceId;
  }

  /**
   * Get a mock server instance by instance_id
   *
   * @param instanceId - The unique instance identifier
   * @returns The instance or null if not found
   */
  async get(instanceId: string): Promise<MockServerInstance | null> {
    const result = await database.query(
      'SELECT * FROM mock_server_registry WHERE instance_id = $1',
      [instanceId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapFromDb(result.rows[0]);
  }

  /**
   * List mock server instances with optional filtering
   *
   * @param filter - Optional filter criteria
   * @returns Array of matching instances
   */
  async list(filter?: RegistryFilter): Promise<MockServerInstance[]> {
    let query = 'SELECT * FROM mock_server_registry';
    const params: any[] = [];
    const conditions: string[] = [];
    let paramIndex = 1;

    if (filter?.connector) {
      conditions.push(`connector = $${paramIndex}`);
      params.push(filter.connector);
      paramIndex++;
    }

    if (filter?.orgId) {
      conditions.push(`org_id = $${paramIndex}`);
      params.push(filter.orgId);
      paramIndex++;
    }

    if (filter?.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filter.status);
      paramIndex++;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const result = await database.query(query, params);
    return result.rows.map(this.mapFromDb);
  }

  /**
   * Update a mock server instance
   *
   * @param instanceId - The instance to update
   * @param updates - Partial updates to apply
   */
  async update(
    instanceId: string,
    updates: Partial<Omit<MockServerInstance, 'id' | 'instanceId' | 'createdAt'>>
  ): Promise<void> {
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Build dynamic SET clause based on provided updates
    const fieldMapping: Record<string, string> = {
      connector: 'connector',
      orgId: 'org_id',
      jobId: 'job_id',
      status: 'status',
      errorMessage: 'error_message',
      lastAccessedAt: 'last_accessed_at',
      generationBrief: 'generation_brief',
      connectorSchema: 'connector_schema',
      sslConfig: 'ssl_config',
      baseUrl: 'base_url',
      apiBasePath: 'api_base_path',
      authEndpoint: 'auth_endpoint',
      mockCredentials: 'mock_credentials',
      entityCount: 'entity_count',
      recordCounts: 'record_counts',
      apiDocsSource: 'api_docs_source',
      pgSchema: 'pg_schema',
    };

    for (const [key, dbColumn] of Object.entries(fieldMapping)) {
      if (key in updates) {
        const value = (updates as any)[key];
        setClauses.push(`${dbColumn} = $${paramIndex}`);

        // JSON fields need stringification
        if (['generationBrief', 'connectorSchema', 'sslConfig', 'mockCredentials', 'recordCounts'].includes(key)) {
          params.push(value ? JSON.stringify(value) : null);
        } else {
          params.push(value);
        }
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      logger.warn(`No updates provided for instance: ${instanceId}`);
      return;
    }

    params.push(instanceId);
    const query = `UPDATE mock_server_registry SET ${setClauses.join(', ')} WHERE instance_id = $${paramIndex}`;

    const result = await database.query(query, params);

    if (result.rowCount === 0) {
      logger.warn(`No instance found to update: ${instanceId}`);
    } else {
      logger.info(`Updated registry entry: ${instanceId}`);
    }
  }

  /**
   * Delete a mock server instance
   *
   * @param instanceId - The instance to delete
   */
  async delete(instanceId: string): Promise<void> {
    const result = await database.query(
      'DELETE FROM mock_server_registry WHERE instance_id = $1',
      [instanceId]
    );

    if (result.rowCount === 0) {
      logger.warn(`No instance found to delete: ${instanceId}`);
    } else {
      logger.info(`Deleted registry entry: ${instanceId}`);
    }
  }

  /**
   * Get all instances for a specific connector type
   *
   * @param connector - The connector type (e.g., 'netsuite')
   * @returns Array of instances for that connector
   */
  async getByConnector(connector: string): Promise<MockServerInstance[]> {
    return this.list({ connector });
  }

  /**
   * Get the original/template instance for a connector
   * Convention: {connector}_original (e.g., netsuite_original)
   *
   * @param connector - The connector type
   * @returns The original template instance or null
   */
  async getOriginal(connector: string): Promise<MockServerInstance | null> {
    const originalId = `${connector}_original`;
    return this.get(originalId);
  }

  /**
   * Update the last_accessed_at timestamp for an instance
   *
   * @param instanceId - The instance to update
   */
  async updateLastAccessed(instanceId: string): Promise<void> {
    await database.query(
      'UPDATE mock_server_registry SET last_accessed_at = CURRENT_TIMESTAMP WHERE instance_id = $1',
      [instanceId]
    );

    logger.debug(`Updated last_accessed_at for instance: ${instanceId}`);
  }

  /**
   * Map database row to MockServerInstance interface
   */
  private mapFromDb(row: any): MockServerInstance {
    return {
      id: row.id,
      instanceId: row.instance_id,
      connector: row.connector,
      orgId: row.org_id,
      jobId: row.job_id,
      status: row.status as MockServerStatus,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastAccessedAt: row.last_accessed_at,
      generationBrief: row.generation_brief,
      connectorSchema: row.connector_schema,
      sslConfig: row.ssl_config,
      baseUrl: row.base_url,
      apiBasePath: row.api_base_path,
      authEndpoint: row.auth_endpoint,
      mockCredentials: row.mock_credentials,
      entityCount: row.entity_count,
      recordCounts: row.record_counts,
      apiDocsSource: row.api_docs_source,
      pgSchema: row.pg_schema,
    };
  }
}

// Export singleton instance
export const registryService = new RegistryService();
export default registryService;
