/**
 * WireMock Stub Generator
 *
 * Generates WireMock mapping files from OpenAPI specifications.
 * Creates:
 * - Stateful CRUD scenarios for each entity
 * - Response templates using generated data
 * - Chaos injection rules (errors, latency)
 * - Pagination support
 */

import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import logger from '../utils/logger';

const WIREMOCK_ADMIN_URL = process.env.WIREMOCK_URL
  ? `${process.env.WIREMOCK_URL}/__admin`
  : 'http://localhost:8080/__admin';

// ============================================================================
// Types
// ============================================================================

interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string };
  servers?: Array<{ url: string }>;
  paths: Record<string, PathItem>;
  components: {
    schemas: Record<string, SchemaObject>;
  };
}

interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  delete?: Operation;
  patch?: Operation;
}

interface Operation {
  operationId?: string;
  summary?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, Response>;
}

interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header';
  required?: boolean;
  schema?: { type: string };
}

interface RequestBody {
  required?: boolean;
  content?: Record<string, { schema: SchemaObject }>;
}

interface Response {
  description: string;
  content?: Record<string, { schema: SchemaObject }>;
}

interface SchemaObject {
  type?: string;
  properties?: Record<string, unknown>;
  items?: SchemaObject;
  $ref?: string;
}

interface WireMockMapping {
  id?: string;
  name?: string;
  priority?: number;
  scenarioName?: string;
  requiredScenarioState?: string;
  newScenarioState?: string;
  request: {
    method: string;
    urlPattern?: string;
    urlPathPattern?: string;
    url?: string;
    urlPath?: string;
    headers?: Record<string, { equalTo?: string; contains?: string; matches?: string }>;
    queryParameters?: Record<string, { equalTo?: string; matches?: string }>;
    bodyPatterns?: Array<{ equalToJson?: object; matchesJsonPath?: string }>;
  };
  response: {
    status: number;
    headers?: Record<string, string>;
    body?: string;
    jsonBody?: unknown;
    bodyFileName?: string;
    transformers?: string[];
    fixedDelayMilliseconds?: number;
    delayDistribution?: { type: string; median: number; sigma: number };
  };
  metadata?: Record<string, unknown>;
}

interface StubGeneratorOptions {
  instanceId: string;
  connector: string;
  dataDirectory?: string;
  outputDirectory: string;
  enableChaos?: boolean;
  chaosConfig?: {
    errorRate?: number;
    latencyMs?: number;
    latencyVariance?: number;
  };
}

// ============================================================================
// WireMock Stub Generator
// ============================================================================

export class WireMockStubGenerator {
  /**
   * Generate WireMock stub mappings from OpenAPI spec
   */
  async generateStubs(openApi: OpenApiSpec, options: StubGeneratorOptions): Promise<void> {
    logger.info('Generating WireMock stubs', {
      instanceId: options.instanceId,
      connector: options.connector,
      pathCount: Object.keys(openApi.paths).length,
    });

    // Ensure output directory exists
    await fs.mkdir(options.outputDirectory, { recursive: true });

    const mappings: WireMockMapping[] = [];

    // Generate stubs for each path
    for (const [pathPattern, pathItem] of Object.entries(openApi.paths)) {
      const pathMappings = await this.generatePathMappings(
        pathPattern,
        pathItem,
        openApi,
        options
      );
      mappings.push(...pathMappings);
    }

    // Add chaos/fault injection mappings if enabled
    if (options.enableChaos) {
      const chaosMappings = this.generateChaosMappings(options);
      mappings.push(...chaosMappings);
    }

    // Write each mapping to a separate file
    for (let i = 0; i < mappings.length; i++) {
      const mapping = mappings[i];
      const fileName = `${options.instanceId}-${String(i + 1).padStart(3, '0')}-${mapping.name || 'stub'}.json`;
      const filePath = path.join(options.outputDirectory, fileName);

      await fs.writeFile(filePath, JSON.stringify(mapping, null, 2));
    }

    // Also write a combined mappings file for easy import
    const combinedPath = path.join(options.outputDirectory, `${options.instanceId}-all.json`);
    await fs.writeFile(
      combinedPath,
      JSON.stringify({ mappings }, null, 2)
    );

    // Import mappings into WireMock via admin API
    try {
      await axios.post(`${WIREMOCK_ADMIN_URL}/mappings/import`, { mappings });
      logger.info('WireMock stubs imported via admin API', {
        instanceId: options.instanceId,
        mappingCount: mappings.length,
      });
    } catch (error) {
      logger.warn('Failed to import WireMock stubs via admin API, mappings saved to files', {
        instanceId: options.instanceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info('WireMock stubs generated', {
      instanceId: options.instanceId,
      mappingCount: mappings.length,
      outputDirectory: options.outputDirectory,
    });
  }

  /**
   * Generate mappings for a single path
   */
  private async generatePathMappings(
    pathPattern: string,
    pathItem: PathItem,
    _openApi: OpenApiSpec,
    options: StubGeneratorOptions
  ): Promise<WireMockMapping[]> {
    const mappings: WireMockMapping[] = [];

    // Convert OpenAPI path params to WireMock regex
    const wireMockPath = this.convertPathToWireMockPattern(pathPattern);

    // Extract entity name from path for scenario naming
    const entityName = this.extractEntityName(pathPattern);
    const scenarioName = `${options.instanceId}-${entityName}`;

    // GET (list or single)
    if (pathItem.get) {
      const isListEndpoint = !pathPattern.includes('{id}') && !pathPattern.includes('{');

      if (isListEndpoint) {
        // List endpoint with pagination
        mappings.push(this.createListMapping(pathPattern, wireMockPath, pathItem.get, entityName, options));
      } else {
        // Get by ID endpoint
        mappings.push(this.createGetByIdMapping(pathPattern, wireMockPath, pathItem.get, entityName, scenarioName, options));
      }
    }

    // POST (create)
    if (pathItem.post) {
      mappings.push(this.createPostMapping(pathPattern, wireMockPath, pathItem.post, entityName, scenarioName, options));
    }

    // PUT (update)
    if (pathItem.put) {
      mappings.push(this.createPutMapping(pathPattern, wireMockPath, pathItem.put, entityName, scenarioName, options));
    }

    // DELETE
    if (pathItem.delete) {
      mappings.push(this.createDeleteMapping(pathPattern, wireMockPath, pathItem.delete, entityName, scenarioName, options));
    }

    return mappings;
  }

  /**
   * Create a list endpoint mapping with pagination
   */
  private createListMapping(
    _pathPattern: string,
    wireMockPath: string,
    operation: Operation,
    entityName: string,
    options: StubGeneratorOptions
  ): WireMockMapping {
    return {
      name: `${entityName}-list`,
      priority: 5,
      request: {
        method: 'GET',
        urlPathPattern: wireMockPath,
        headers: {
          'X-Mock-Instance-Id': { equalTo: options.instanceId },
        },
      },
      response: {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        // Use jsonBody for a properly formatted response
        // The actual data would be served from files or database in production
        jsonBody: {
          items: [
            { id: '1', name: `Mock ${entityName} 1` },
            { id: '2', name: `Mock ${entityName} 2` },
            { id: '3', name: `Mock ${entityName} 3` },
          ],
          pagination: {
            total: 3,
            limit: 100,
            offset: 0,
            hasMore: false,
          },
        },
      },
      metadata: {
        operationId: operation.operationId,
        entity: entityName,
      },
    };
  }

  /**
   * Create a get-by-ID endpoint mapping
   */
  private createGetByIdMapping(
    _pathPattern: string,
    wireMockPath: string,
    operation: Operation,
    entityName: string,
    scenarioName: string,
    options: StubGeneratorOptions
  ): WireMockMapping {
    return {
      name: `${entityName}-get-by-id`,
      priority: 5,
      scenarioName,
      request: {
        method: 'GET',
        urlPathPattern: wireMockPath,
        headers: {
          'X-Mock-Instance-Id': { equalTo: options.instanceId },
        },
      },
      response: {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        // Template to find record by ID in data file
        body: JSON.stringify({
          id: '{{request.pathSegments.[2]}}',
          // Other fields will be populated from data file
        }),
        transformers: ['response-template'],
      },
      metadata: {
        operationId: operation.operationId,
        entity: entityName,
      },
    };
  }

  /**
   * Create a POST (create) endpoint mapping with stateful scenario
   */
  private createPostMapping(
    _pathPattern: string,
    wireMockPath: string,
    operation: Operation,
    entityName: string,
    scenarioName: string,
    options: StubGeneratorOptions
  ): WireMockMapping {
    return {
      name: `${entityName}-create`,
      priority: 5,
      scenarioName,
      requiredScenarioState: 'Started',
      newScenarioState: 'RecordCreated',
      request: {
        method: 'POST',
        urlPathPattern: wireMockPath,
        headers: {
          'X-Mock-Instance-Id': { equalTo: options.instanceId },
          'Content-Type': { contains: 'application/json' },
        },
      },
      response: {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
        },
        // Echo back the request body with generated ID
        body: JSON.stringify({
          id: '{{randomValue type="UUID"}}',
          created_at: '{{now format="yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'" timezone="UTC"}}',
          '...': '{{jsonPath request.body "$"}}',
        }),
        transformers: ['response-template'],
      },
      metadata: {
        operationId: operation.operationId,
        entity: entityName,
        stateful: true,
      },
    };
  }

  /**
   * Create a PUT (update) endpoint mapping
   */
  private createPutMapping(
    _pathPattern: string,
    wireMockPath: string,
    operation: Operation,
    entityName: string,
    scenarioName: string,
    options: StubGeneratorOptions
  ): WireMockMapping {
    return {
      name: `${entityName}-update`,
      priority: 5,
      scenarioName,
      request: {
        method: 'PUT',
        urlPathPattern: wireMockPath,
        headers: {
          'X-Mock-Instance-Id': { equalTo: options.instanceId },
          'Content-Type': { contains: 'application/json' },
        },
      },
      response: {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: '{{request.pathSegments.[2]}}',
          updated_at: '{{now format="yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'" timezone="UTC"}}',
          '...': '{{jsonPath request.body "$"}}',
        }),
        transformers: ['response-template'],
      },
      metadata: {
        operationId: operation.operationId,
        entity: entityName,
      },
    };
  }

  /**
   * Create a DELETE endpoint mapping
   */
  private createDeleteMapping(
    _pathPattern: string,
    wireMockPath: string,
    operation: Operation,
    entityName: string,
    scenarioName: string,
    options: StubGeneratorOptions
  ): WireMockMapping {
    return {
      name: `${entityName}-delete`,
      priority: 5,
      scenarioName,
      newScenarioState: 'RecordDeleted',
      request: {
        method: 'DELETE',
        urlPathPattern: wireMockPath,
        headers: {
          'X-Mock-Instance-Id': { equalTo: options.instanceId },
        },
      },
      response: {
        status: 204,
        headers: {},
      },
      metadata: {
        operationId: operation.operationId,
        entity: entityName,
        stateful: true,
      },
    };
  }

  /**
   * Generate chaos/fault injection mappings
   */
  private generateChaosMappings(options: StubGeneratorOptions): WireMockMapping[] {
    const mappings: WireMockMapping[] = [];
    const config = options.chaosConfig || {};

    // 500 Internal Server Error
    if (config.errorRate && config.errorRate > 0) {
      mappings.push({
        name: 'chaos-500-error',
        priority: 1, // High priority - evaluated first
        request: {
          method: 'ANY',
          urlPattern: '.*',
          headers: {
            'X-Mock-Instance-Id': { equalTo: options.instanceId },
            'X-Chaos-Error': { equalTo: '500' },
          },
        },
        response: {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: {
            error: 'Internal Server Error',
            message: 'Chaos injection: simulated server error',
            code: 'CHAOS_500',
          },
        },
      });

      // 429 Rate Limit
      mappings.push({
        name: 'chaos-429-rate-limit',
        priority: 1,
        request: {
          method: 'ANY',
          urlPattern: '.*',
          headers: {
            'X-Mock-Instance-Id': { equalTo: options.instanceId },
            'X-Chaos-Error': { equalTo: '429' },
          },
        },
        response: {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
          jsonBody: {
            error: 'Too Many Requests',
            message: 'Chaos injection: rate limit exceeded',
            code: 'CHAOS_429',
          },
        },
      });

      // 503 Service Unavailable
      mappings.push({
        name: 'chaos-503-unavailable',
        priority: 1,
        request: {
          method: 'ANY',
          urlPattern: '.*',
          headers: {
            'X-Mock-Instance-Id': { equalTo: options.instanceId },
            'X-Chaos-Error': { equalTo: '503' },
          },
        },
        response: {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: {
            error: 'Service Unavailable',
            message: 'Chaos injection: service temporarily unavailable',
            code: 'CHAOS_503',
          },
        },
      });
    }

    // Latency injection
    if (config.latencyMs && config.latencyMs > 0) {
      mappings.push({
        name: 'chaos-latency',
        priority: 1,
        request: {
          method: 'ANY',
          urlPattern: '.*',
          headers: {
            'X-Mock-Instance-Id': { equalTo: options.instanceId },
            'X-Chaos-Latency': { matches: '.*' },
          },
        },
        response: {
          status: 200,
          fixedDelayMilliseconds: config.latencyMs,
          delayDistribution: config.latencyVariance
            ? {
                type: 'lognormal',
                median: config.latencyMs,
                sigma: config.latencyVariance / 100,
              }
            : undefined,
        },
      });
    }

    // Malformed response
    mappings.push({
      name: 'chaos-malformed-json',
      priority: 1,
      request: {
        method: 'ANY',
        urlPattern: '.*',
        headers: {
          'X-Mock-Instance-Id': { equalTo: options.instanceId },
          'X-Chaos-Malformed': { equalTo: 'true' },
        },
      },
      response: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{"data": [{"id": "1", "name": "test"', // Intentionally malformed JSON
      },
    });

    return mappings;
  }

  /**
   * Convert OpenAPI path pattern to WireMock URL pattern
   * e.g., /api/v2/customers/{id} -> /api/v2/customers/[^/]+
   */
  private convertPathToWireMockPattern(openApiPath: string): string {
    // Replace {param} with regex pattern that matches any non-slash characters
    return openApiPath.replace(/\{[^}]+\}/g, '[^/]+');
  }

  /**
   * Extract entity name from path
   * e.g., /api/v2/customers/{id} -> customers
   */
  private extractEntityName(pathPattern: string): string {
    const segments = pathPattern.split('/').filter(Boolean);

    // Find the first segment that's not 'api', a version, or a path param
    for (const segment of segments) {
      if (
        segment !== 'api' &&
        !segment.match(/^v\d+$/) &&
        !segment.startsWith('{')
      ) {
        return segment;
      }
    }

    return 'resource';
  }
}

export default WireMockStubGenerator;
