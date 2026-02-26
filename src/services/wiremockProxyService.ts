/**
 * WireMock Proxy Service
 *
 * Bridges MCP tool calls to WireMock HTTP endpoints.
 * Handles instance-based routing and response transformation.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import logger from '../utils/logger';
import { registryService, MockServerInstance } from './registryService';
import { GeneratedTableData, WireMockStateFile } from '../types/dataGeneration';

// WireMock configuration
const WIREMOCK_BASE_URL = process.env.WIREMOCK_URL || 'http://localhost:8080';
const WIREMOCK_ADMIN_URL = `${WIREMOCK_BASE_URL}/__admin`;

/**
 * MCP Tool Definition
 */
interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP Tool Call Result
 */
interface McpToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * Tool to WireMock endpoint mapping
 */
interface ToolMapping {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  queryParams?: (args: Record<string, unknown>) => Record<string, string>;
  bodyTransform?: (args: Record<string, unknown>) => unknown;
  responseTransform?: (response: unknown) => unknown;
}

/**
 * WireMock Proxy Service Class
 */
class WireMockProxyService {
  private client: AxiosInstance;
  private adminClient: AxiosInstance;

  // Tool mappings for Snowflake connector
  private snowflakeToolMappings: Record<string, ToolMapping> = {
    list_databases: {
      method: 'GET',
      path: '/api/v2/databases',
      responseTransform: (response) => {
        const data = response as { data?: unknown[] };
        return { databases: data.data || data };
      },
    },
    list_tables: {
      method: 'GET',
      path: '/api/v2/tables',
      queryParams: (args) => {
        const params: Record<string, string> = {};
        if (args.database) params.database = String(args.database);
        if (args.schema) params.schema = String(args.schema);
        return params;
      },
      responseTransform: (response) => {
        const data = response as { data?: unknown[] };
        return { tables: data.data || data };
      },
    },
    execute_sql: {
      method: 'POST',
      path: '/api/v2/statements',
      bodyTransform: (args) => ({
        statement: args.statement,
        database: args.database,
        schema: args.schema,
        warehouse: args.warehouse,
        role: args.role,
      }),
      responseTransform: (response) => {
        const data = response as Record<string, unknown>;
        return {
          success: true,
          statementHandle: data.statementHandle,
          data: data.data || [],
          rowCount: (data.data as unknown[])?.length || 0,
          message: data.message || 'Query executed successfully',
        };
      },
    },
    get_statement_status: {
      method: 'GET',
      path: '/api/v2/statements/{statementHandle}',
      responseTransform: (response) => response,
    },
    cancel_statement: {
      method: 'POST',
      path: '/api/v2/statements/{statementHandle}/cancel',
      responseTransform: (response) => response,
    },
  };

  constructor() {
    this.client = axios.create({
      baseURL: WIREMOCK_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.adminClient = axios.create({
      baseURL: WIREMOCK_ADMIN_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    logger.info(`WireMock Proxy initialized with base URL: ${WIREMOCK_BASE_URL}`);
  }

  /**
   * Check if WireMock is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.adminClient.get('/health');
      return response.data?.status === 'healthy';
    } catch (error) {
      logger.error('WireMock health check failed', error);
      return false;
    }
  }

  /**
   * Get available tools for a connector
   */
  async getTools(connector: string): Promise<McpTool[]> {
    if (connector === 'snowflake') {
      return this.getSnowflakeTools();
    }

    // For other connectors, generate tools from OpenAPI spec
    return this.generateToolsFromOpenApi(connector);
  }

  /**
   * Get Snowflake-specific tools
   */
  private getSnowflakeTools(): McpTool[] {
    return [
      {
        name: 'execute_sql',
        description: 'Execute a SQL query against Snowflake',
        inputSchema: {
          type: 'object',
          properties: {
            statement: {
              type: 'string',
              description: 'SQL statement to execute',
            },
            database: {
              type: 'string',
              description: 'Database name (optional)',
            },
            schema: {
              type: 'string',
              description: 'Schema name (optional)',
            },
            warehouse: {
              type: 'string',
              description: 'Warehouse to use (optional)',
            },
            role: {
              type: 'string',
              description: 'Role to use (optional)',
            },
          },
          required: ['statement'],
        },
      },
      {
        name: 'list_databases',
        description: 'List all databases in Snowflake',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'list_tables',
        description: 'List tables in a database/schema',
        inputSchema: {
          type: 'object',
          properties: {
            database: {
              type: 'string',
              description: 'Database name',
            },
            schema: {
              type: 'string',
              description: 'Schema name',
            },
          },
        },
      },
      {
        name: 'get_statement_status',
        description: 'Get the status of a running or completed statement',
        inputSchema: {
          type: 'object',
          properties: {
            statementHandle: {
              type: 'string',
              description: 'Statement handle from execute_sql',
            },
          },
          required: ['statementHandle'],
        },
      },
    ];
  }

  /**
   * Generate tools from OpenAPI spec (future implementation)
   */
  private async generateToolsFromOpenApi(_connector: string): Promise<McpTool[]> {
    // TODO: Parse OpenAPI spec and generate tools dynamically
    logger.warn('Dynamic tool generation from OpenAPI not yet implemented');
    return [];
  }

  /**
   * Execute a tool call by proxying to WireMock
   */
  async executeToolCall(
    toolName: string,
    args: Record<string, unknown>,
    instanceId?: string
  ): Promise<McpToolResult> {
    try {
      // Get instance info if provided
      let instance: MockServerInstance | null = null;
      if (instanceId) {
        instance = await registryService.get(instanceId);
        if (!instance) {
          return this.errorResult(`Instance not found: ${instanceId}`);
        }
        // Update last accessed timestamp
        await registryService.updateLastAccessed(instanceId);
      }

      // Get tool mapping
      const mapping = this.snowflakeToolMappings[toolName];
      if (!mapping) {
        return this.errorResult(`Unknown tool: ${toolName}`);
      }

      // Build request
      let path = mapping.path;

      // Replace path parameters
      if (args.statementHandle) {
        path = path.replace('{statementHandle}', String(args.statementHandle));
      }

      // Build query params
      const queryParams = mapping.queryParams ? mapping.queryParams(args) : {};

      // Add instance routing header if applicable
      const headers: Record<string, string> = {};
      if (instanceId) {
        headers['X-Mock-Instance-Id'] = instanceId;
      }

      // Execute request
      let response: unknown;
      if (mapping.method === 'GET') {
        const result = await this.client.get(path, {
          params: queryParams,
          headers,
        });
        response = result.data;
      } else if (mapping.method === 'POST') {
        const body = mapping.bodyTransform ? mapping.bodyTransform(args) : args;
        const result = await this.client.post(path, body, { headers });
        response = result.data;
      } else if (mapping.method === 'PUT') {
        const body = mapping.bodyTransform ? mapping.bodyTransform(args) : args;
        const result = await this.client.put(path, body, { headers });
        response = result.data;
      } else if (mapping.method === 'DELETE') {
        const result = await this.client.delete(path, { headers });
        response = result.data;
      }

      // Transform response
      const transformedResponse = mapping.responseTransform
        ? mapping.responseTransform(response)
        : response;

      logger.info(`Tool ${toolName} executed successfully via WireMock`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(transformedResponse, null, 2),
          },
        ],
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        // WireMock returned an error response (could be intentional chaos injection)
        const status = axiosError.response.status;
        const data = axiosError.response.data;

        logger.warn(`WireMock returned ${status} for tool ${toolName}`, data);

        // For chaos testing, we might want to return this as a valid response
        if (status >= 400 && status < 500) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: true,
                    status,
                    message: (data as Record<string, unknown>)?.message || `HTTP ${status} error`,
                    details: data,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }

      logger.error(`Tool ${toolName} failed`, error);
      return this.errorResult(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }

  /**
   * Set WireMock scenario state for an instance
   */
  async setScenarioState(
    scenarioName: string,
    stateName: string
  ): Promise<void> {
    try {
      await this.adminClient.put(`/scenarios/${scenarioName}/state`, {
        state: stateName,
      });
      logger.info(`Set scenario ${scenarioName} to state ${stateName}`);
    } catch (error) {
      logger.error(`Failed to set scenario state: ${scenarioName}`, error);
      throw error;
    }
  }

  /**
   * Reset all WireMock scenarios to initial state
   */
  async resetScenarios(): Promise<void> {
    try {
      await this.adminClient.post('/scenarios/reset');
      logger.info('Reset all WireMock scenarios');
    } catch (error) {
      logger.error('Failed to reset scenarios', error);
      throw error;
    }
  }

  /**
   * Get WireMock request log for debugging
   */
  async getRequestLog(limit = 10): Promise<unknown[]> {
    try {
      const response = await this.adminClient.get('/requests', {
        params: { limit },
      });
      return response.data?.requests || [];
    } catch (error) {
      logger.error('Failed to get request log', error);
      return [];
    }
  }

  /**
   * Configure chaos injection for testing
   */
  async configureChaos(config: {
    errorRate?: number; // 0-1, percentage of requests to fail
    latencyMs?: number; // Fixed latency to add
    latencyRangeMs?: [number, number]; // Random latency range
    errorCodes?: number[]; // HTTP error codes to return
  }): Promise<void> {
    // This would configure WireMock fault injection
    // For now, we'll store the config and apply it to requests
    logger.info('Chaos configuration set', config);

    // WireMock supports fault injection via mappings with:
    // - "fixedDelayMilliseconds": for latency
    // - "fault": "RANDOM_DATA_THEN_CLOSE" etc. for chaos
    // This would be implemented by creating/updating WireMock mappings
  }

  /**
   * Helper to create error result
   */
  private errorResult(message: string): McpToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: true, message }, null, 2),
        },
      ],
      isError: true,
    };
  }

  // ============================================================================
  // Generated Data Loading
  // ============================================================================

  /**
   * Load generated data into WireMock state files
   */
  async loadGeneratedData(
    connector: string,
    data: Map<string, GeneratedTableData>,
    instanceId?: string
  ): Promise<{ success: boolean; filesLoaded: string[]; errors: string[] }> {
    const filesLoaded: string[] = [];
    const errors: string[] = [];

    // Path to WireMock's __files directory
    const wiremockFilesDir = path.join(process.cwd(), 'wiremock', '__files');
    const connectorDir = path.join(wiremockFilesDir, connector);

    // Add instance subdirectory if provided
    const targetDir = instanceId
      ? path.join(connectorDir, instanceId)
      : connectorDir;

    try {
      // Ensure directories exist
      await fs.mkdir(targetDir, { recursive: true });

      // Write each table's data to a JSON file
      for (const [tableName, tableData] of data) {
        const fileName = `${tableData.entityName}.json`;
        const filePath = path.join(targetDir, fileName);

        // Create state file structure
        const stateFile: WireMockStateFile = {
          path: instanceId
            ? `${connector}/${instanceId}/${fileName}`
            : `${connector}/${fileName}`,
          entityName: tableData.entityName,
          data: tableData.rows as Record<string, unknown>[],
          metadata: {
            generatedAt: tableData.metadata.generatedAt,
            recordCount: tableData.metadata.rowCount,
            schema: tableName,
          },
        };

        await fs.writeFile(filePath, JSON.stringify(stateFile.data, null, 2));
        filesLoaded.push(stateFile.path);

        logger.debug('Loaded data file to WireMock', {
          entity: tableData.entityName,
          recordCount: tableData.rows.length,
          path: filePath,
        });
      }

      // Update WireMock mappings to serve this data
      await this.updateMappingsForData(connector, data, instanceId);

      logger.info('Generated data loaded into WireMock', {
        connector,
        instanceId,
        filesLoaded: filesLoaded.length,
        totalRecords: Array.from(data.values()).reduce(
          (sum, t) => sum + t.rows.length,
          0
        ),
      });

      return { success: true, filesLoaded, errors };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMsg);
      logger.error('Failed to load generated data into WireMock', { error });
      return { success: false, filesLoaded, errors };
    }
  }

  /**
   * Update WireMock mappings to serve generated data
   */
  private async updateMappingsForData(
    connector: string,
    data: Map<string, GeneratedTableData>,
    instanceId?: string
  ): Promise<void> {
    const mappingsDir = path.join(process.cwd(), 'wiremock', 'mappings');

    for (const [_tableName, tableData] of data) {
      const entityName = tableData.entityName.toLowerCase();

      // Build file path for the data
      const dataFilePath = instanceId
        ? `${connector}/${instanceId}/${tableData.entityName}.json`
        : `${connector}/${tableData.entityName}.json`;

      // Create a mapping for list endpoint
      const listMapping = {
        name: `${connector}_${entityName}_list${instanceId ? `_${instanceId}` : ''}`,
        request: {
          method: 'GET',
          urlPathPattern: `/api/v2/${entityName}s?`,
          ...(instanceId && {
            headers: {
              'X-Mock-Instance-Id': {
                equalTo: instanceId,
              },
            },
          }),
        },
        response: {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          bodyFileName: dataFilePath,
        },
      };

      // Create a mapping for single item endpoint (by ID)
      const singleMapping = {
        name: `${connector}_${entityName}_single${instanceId ? `_${instanceId}` : ''}`,
        request: {
          method: 'GET',
          urlPathPattern: `/api/v2/${entityName}s/[^/]+`,
          ...(instanceId && {
            headers: {
              'X-Mock-Instance-Id': {
                equalTo: instanceId,
              },
            },
          }),
        },
        response: {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          // For single item, we'd ideally use response templating
          // This is a simplified version that returns the whole list
          bodyFileName: dataFilePath,
          transformers: ['response-template'],
        },
      };

      // Write mappings to files
      const listMappingPath = path.join(
        mappingsDir,
        `${connector}-${entityName}-list${instanceId ? `-${instanceId}` : ''}.json`
      );
      const singleMappingPath = path.join(
        mappingsDir,
        `${connector}-${entityName}-single${instanceId ? `-${instanceId}` : ''}.json`
      );

      await fs.writeFile(listMappingPath, JSON.stringify(listMapping, null, 2));
      await fs.writeFile(singleMappingPath, JSON.stringify(singleMapping, null, 2));

      logger.debug('Created WireMock mapping', {
        entity: entityName,
        listMapping: listMappingPath,
      });
    }

    // Reload WireMock mappings
    await this.reloadMappings();
  }

  /**
   * Reload all WireMock mappings from files
   */
  async reloadMappings(): Promise<void> {
    try {
      await this.adminClient.post('/mappings/reset');
      logger.info('WireMock mappings reloaded');
    } catch (error) {
      logger.error('Failed to reload WireMock mappings', error);
      throw error;
    }
  }

  /**
   * Import mappings from a WireMock JSON export
   */
  async importMappings(mappings: unknown[]): Promise<void> {
    try {
      await this.adminClient.post('/mappings/import', { mappings });
      logger.info(`Imported ${mappings.length} mappings into WireMock`);
    } catch (error) {
      logger.error('Failed to import mappings', error);
      throw error;
    }
  }

  /**
   * Get all current WireMock mappings
   */
  async getMappings(): Promise<unknown[]> {
    try {
      const response = await this.adminClient.get('/mappings');
      return response.data?.mappings || [];
    } catch (error) {
      logger.error('Failed to get mappings', error);
      return [];
    }
  }

  /**
   * Delete mappings for a specific instance
   */
  async deleteMappingsForInstance(
    connector: string,
    instanceId: string
  ): Promise<void> {
    try {
      // Get all mappings
      const mappings = await this.getMappings();

      // Find mappings for this instance
      const instanceMappings = (mappings as Array<{ id: string; name?: string }>).filter(
        (m) => m.name?.includes(`_${instanceId}`)
      );

      // Delete each mapping
      for (const mapping of instanceMappings) {
        await this.adminClient.delete(`/mappings/${mapping.id}`);
      }

      // Delete data files
      const dataDir = path.join(
        process.cwd(),
        'wiremock',
        '__files',
        connector,
        instanceId
      );

      try {
        await fs.rm(dataDir, { recursive: true });
      } catch {
        // Directory might not exist
      }

      logger.info('Deleted WireMock mappings and data for instance', {
        connector,
        instanceId,
        mappingsDeleted: instanceMappings.length,
      });
    } catch (error) {
      logger.error('Failed to delete instance mappings', error);
      throw error;
    }
  }

  /**
   * Verify data is accessible via WireMock
   */
  async verifyDataLoaded(
    _connector: string,
    entityName: string,
    instanceId?: string
  ): Promise<{ success: boolean; recordCount: number; error?: string }> {
    try {
      const headers: Record<string, string> = {};
      if (instanceId) {
        headers['X-Mock-Instance-Id'] = instanceId;
      }

      const response = await this.client.get(`/api/v2/${entityName}s`, {
        headers,
      });

      const data = response.data;
      const records = Array.isArray(data) ? data : data?.data || [];

      return {
        success: true,
        recordCount: records.length,
      };
    } catch (error) {
      return {
        success: false,
        recordCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================================
  // Instance Management
  // ============================================================================

  /**
   * Create a new WireMock instance configuration
   * This registers the instance for routing and sets up initial mappings
   */
  async createInstance(
    instanceId: string,
    config: {
      connector: string;
      orgId: string;
      schemaPath?: string;
      dataPath?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('Creating WireMock instance', {
        instanceId,
        connector: config.connector,
        orgId: config.orgId,
      });

      // Create directories for instance data and mappings
      const instanceDataDir = path.join(
        process.cwd(),
        'wiremock',
        '__files',
        config.connector,
        instanceId
      );
      const instanceMappingsDir = path.join(
        process.cwd(),
        'wiremock',
        'mappings',
        instanceId
      );

      await fs.mkdir(instanceDataDir, { recursive: true });
      await fs.mkdir(instanceMappingsDir, { recursive: true });

      // If data path provided, copy data files to WireMock __files
      if (config.dataPath) {
        try {
          const dataFiles = await fs.readdir(config.dataPath);
          for (const file of dataFiles) {
            if (file.endsWith('.json')) {
              const srcPath = path.join(config.dataPath, file);
              const destPath = path.join(instanceDataDir, file);
              const content = await fs.readFile(srcPath, 'utf-8');

              // Extract just the data array if it's a WireMockStateFile
              try {
                const parsed = JSON.parse(content);
                if (parsed.data && Array.isArray(parsed.data)) {
                  await fs.writeFile(destPath, JSON.stringify(parsed.data, null, 2));
                } else if (Array.isArray(parsed)) {
                  await fs.writeFile(destPath, content);
                } else {
                  await fs.writeFile(destPath, JSON.stringify([parsed], null, 2));
                }
              } catch {
                await fs.copyFile(srcPath, destPath);
              }

              logger.debug('Copied data file to WireMock', {
                file,
                instanceId,
              });
            }
          }
        } catch (err) {
          logger.warn('Failed to copy data files', { error: err });
        }
      }

      // Create base routing mapping for this instance
      const baseMapping = {
        name: `${instanceId}-base-route`,
        priority: 10,
        request: {
          method: 'ANY',
          urlPattern: '.*',
          headers: {
            'X-Mock-Instance-Id': {
              equalTo: instanceId,
            },
          },
        },
        response: {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Mock-Instance-Id': instanceId,
          },
          jsonBody: {
            message: `Mock instance ${instanceId} ready`,
            connector: config.connector,
          },
        },
      };

      const baseMappingPath = path.join(
        instanceMappingsDir,
        `${instanceId}-base.json`
      );
      await fs.writeFile(baseMappingPath, JSON.stringify(baseMapping, null, 2));

      // Reload WireMock mappings to pick up new files
      await this.reloadMappings();

      logger.info('WireMock instance created', {
        instanceId,
        dataDir: instanceDataDir,
        mappingsDir: instanceMappingsDir,
      });

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create WireMock instance', {
        instanceId,
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Delete a WireMock instance and its data
   */
  async deleteInstance(
    instanceId: string,
    connector: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Delete mappings
      await this.deleteMappingsForInstance(connector, instanceId);

      // Delete instance directories
      const instanceDataDir = path.join(
        process.cwd(),
        'wiremock',
        '__files',
        connector,
        instanceId
      );
      const instanceMappingsDir = path.join(
        process.cwd(),
        'wiremock',
        'mappings',
        instanceId
      );

      try {
        await fs.rm(instanceDataDir, { recursive: true, force: true });
      } catch {
        // Ignore if doesn't exist
      }

      try {
        await fs.rm(instanceMappingsDir, { recursive: true, force: true });
      } catch {
        // Ignore if doesn't exist
      }

      // Reload mappings
      await this.reloadMappings();

      logger.info('WireMock instance deleted', { instanceId, connector });
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to delete WireMock instance', { instanceId, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Check if an instance exists
   */
  async instanceExists(instanceId: string): Promise<boolean> {
    try {
      const mappings = await this.getMappings();
      return (mappings as Array<{ name?: string }>).some(
        (m) => m.name?.includes(instanceId)
      );
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const wiremockProxyService = new WireMockProxyService();
export default wiremockProxyService;
