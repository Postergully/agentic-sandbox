/**
 * Factory API Routes
 *
 * Entry point for creating mock server instances via API.
 * Implements the Factory Tool interface defined in task-progress.md.
 *
 * Endpoints:
 *   POST /api/factory/create          - Create new instance
 *   POST /api/factory/clone           - Clone existing instance
 *   GET  /api/factory/instances       - List all instances
 *   GET  /api/factory/instances/:id   - Get instance details
 *   DELETE /api/factory/instances/:id - Delete instance
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { registryService } from '../services/registryService';
import { MockServerInstance, MockServerStatus } from '../types';
import logger from '../utils/logger';

const router = Router();

// ============================================================================
// Request/Response Interfaces
// ============================================================================

interface CreateMockServerRequest {
  connector: string;              // e.g., "snowflake", "netsuite"
  orgId: string;                  // e.g., "sharechat"
  jobId?: string;                 // Auto-generated if not provided

  // API Documentation Source (one required)
  apiDocsUrl?: string;            // URL to fetch docs
  apiDocsFile?: string;           // Local file path
  apiDocsSpec?: object;           // Inline OpenAPI/JSON spec

  // Data Generation (from datagen-pipeline.md)
  generationBrief?: object;

  // SSL/DNS Configuration
  sslConfig?: {
    autoSetup: boolean;           // Default: true
    domain?: string;              // Custom domain if provided
  };
}

interface CloneMockServerRequest {
  fromInstanceId: string;         // Source instance to clone
  orgId: string;                  // New org ID
  jobId?: string;                 // New job ID (auto-generated if not provided)
  generationBrief?: object;       // Custom brief for the clone
}

interface FactoryResponse {
  success: boolean;
  message: string;
  data?: MockServerInstance | MockServerInstance[];
  instanceId?: string;
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate instance ID from connector, orgId, and jobId
 */
function generateInstanceId(connector: string, orgId: string, jobId?: string): string {
  const safeConnector = connector.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const safeOrgId = orgId.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const safeJobId = jobId ? jobId.replace(/[^a-z0-9]/g, '_') : uuidv4().split('-')[0];
  return `${safeConnector}_${safeOrgId}_${safeJobId}`;
}

/**
 * Generate PostgreSQL schema name (same as instance ID)
 */
function generatePgSchema(instanceId: string): string {
  return instanceId;
}

/**
 * Validate create request has required fields
 */
function validateCreateRequest(body: CreateMockServerRequest): string | null {
  if (!body.connector) {
    return 'connector is required';
  }
  if (!body.orgId) {
    return 'orgId is required';
  }
  // At least one API docs source should be provided (optional for now)
  return null;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/factory/create
 * Create a new mock server instance
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const body = req.body as CreateMockServerRequest;

    // Validate request
    const validationError = validateCreateRequest(body);
    if (validationError) {
      const response: FactoryResponse = {
        success: false,
        message: 'Validation failed',
        error: validationError,
      };
      res.status(400).json(response);
      return;
    }

    // Generate identifiers
    const instanceId = generateInstanceId(body.connector, body.orgId, body.jobId);
    const pgSchema = generatePgSchema(instanceId);

    // Check if instance already exists
    const existing = await registryService.get(instanceId);
    if (existing) {
      const response: FactoryResponse = {
        success: false,
        message: 'Instance already exists',
        error: `Instance ${instanceId} already exists`,
        instanceId,
      };
      res.status(409).json(response);
      return;
    }

    // Determine API docs source
    let apiDocsSource: string | undefined;
    if (body.apiDocsUrl) {
      apiDocsSource = body.apiDocsUrl;
    } else if (body.apiDocsFile) {
      apiDocsSource = `file://${body.apiDocsFile}`;
    } else if (body.apiDocsSpec) {
      apiDocsSource = 'inline-spec';
    }

    // Create instance record in registry
    const instance: Omit<MockServerInstance, 'id' | 'createdAt' | 'updatedAt'> = {
      instanceId,
      connector: body.connector,
      orgId: body.orgId,
      jobId: body.jobId,
      status: 'creating' as MockServerStatus,
      pgSchema,
      generationBrief: body.generationBrief,
      sslConfig: body.sslConfig,
      apiDocsSource,
    };

    await registryService.create(instance);

    logger.info(`Factory: Created instance ${instanceId}`);

    // TODO: Trigger async instance provisioning
    // - Schema inference (Module 2)
    // - Data generation (Module 3)
    // - Instance setup (Module 4)
    // - SSL/DNS config (Module 6)

    const response: FactoryResponse = {
      success: true,
      message: 'Instance creation started',
      instanceId,
      data: { ...instance, status: 'creating' } as MockServerInstance,
    };

    res.status(202).json(response);
  } catch (error) {
    logger.error('Factory: Failed to create instance', error);
    const response: FactoryResponse = {
      success: false,
      message: 'Failed to create instance',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/factory/clone
 * Clone an existing instance with new org/job
 */
router.post('/clone', async (req: Request, res: Response) => {
  try {
    const body = req.body as CloneMockServerRequest;

    if (!body.fromInstanceId) {
      const response: FactoryResponse = {
        success: false,
        message: 'Validation failed',
        error: 'fromInstanceId is required',
      };
      res.status(400).json(response);
      return;
    }

    if (!body.orgId) {
      const response: FactoryResponse = {
        success: false,
        message: 'Validation failed',
        error: 'orgId is required',
      };
      res.status(400).json(response);
      return;
    }

    // Get source instance
    const source = await registryService.get(body.fromInstanceId);
    if (!source) {
      const response: FactoryResponse = {
        success: false,
        message: 'Source instance not found',
        error: `Instance ${body.fromInstanceId} not found`,
      };
      res.status(404).json(response);
      return;
    }

    // Generate new identifiers
    const instanceId = generateInstanceId(source.connector, body.orgId, body.jobId);
    const pgSchema = generatePgSchema(instanceId);

    // Check if new instance already exists
    const existing = await registryService.get(instanceId);
    if (existing) {
      const response: FactoryResponse = {
        success: false,
        message: 'Instance already exists',
        error: `Instance ${instanceId} already exists`,
        instanceId,
      };
      res.status(409).json(response);
      return;
    }

    // Create cloned instance record
    const instance: Omit<MockServerInstance, 'id' | 'createdAt' | 'updatedAt'> = {
      instanceId,
      connector: source.connector,
      orgId: body.orgId,
      jobId: body.jobId,
      status: 'creating' as MockServerStatus,
      pgSchema,
      generationBrief: body.generationBrief || source.generationBrief,
      connectorSchema: source.connectorSchema,  // Copy schema from source
      sslConfig: source.sslConfig,
      apiDocsSource: source.apiDocsSource,
    };

    await registryService.create(instance);

    logger.info(`Factory: Cloned ${body.fromInstanceId} to ${instanceId}`);

    // TODO: Trigger async clone provisioning
    // - Copy PostgreSQL schema
    // - Re-generate data with new brief
    // - Update SSL/DNS config

    const response: FactoryResponse = {
      success: true,
      message: 'Clone started',
      instanceId,
      data: { ...instance, status: 'creating' } as MockServerInstance,
    };

    res.status(202).json(response);
  } catch (error) {
    logger.error('Factory: Failed to clone instance', error);
    const response: FactoryResponse = {
      success: false,
      message: 'Failed to clone instance',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/factory/instances
 * List all instances with optional filtering
 */
router.get('/instances', async (req: Request, res: Response) => {
  try {
    const { connector, orgId, status } = req.query;

    const filter: { connector?: string; orgId?: string; status?: MockServerStatus } = {};
    if (connector && typeof connector === 'string') {
      filter.connector = connector;
    }
    if (orgId && typeof orgId === 'string') {
      filter.orgId = orgId;
    }
    if (status && typeof status === 'string') {
      filter.status = status as MockServerStatus;
    }

    const instances = await registryService.list(
      Object.keys(filter).length > 0 ? filter : undefined
    );

    const response: FactoryResponse = {
      success: true,
      message: `Found ${instances.length} instance(s)`,
      data: instances,
    };

    res.json(response);
  } catch (error) {
    logger.error('Factory: Failed to list instances', error);
    const response: FactoryResponse = {
      success: false,
      message: 'Failed to list instances',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/factory/instances/:id
 * Get details of a specific instance
 */
router.get('/instances/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const instance = await registryService.get(id);
    if (!instance) {
      const response: FactoryResponse = {
        success: false,
        message: 'Instance not found',
        error: `Instance ${id} not found`,
      };
      res.status(404).json(response);
      return;
    }

    // Update last accessed timestamp
    await registryService.updateLastAccessed(id);

    const response: FactoryResponse = {
      success: true,
      message: 'Instance found',
      instanceId: id,
      data: instance,
    };

    res.json(response);
  } catch (error) {
    logger.error('Factory: Failed to get instance', error);
    const response: FactoryResponse = {
      success: false,
      message: 'Failed to get instance',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

/**
 * DELETE /api/factory/instances/:id
 * Delete an instance
 */
router.delete('/instances/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const instance = await registryService.get(id);
    if (!instance) {
      const response: FactoryResponse = {
        success: false,
        message: 'Instance not found',
        error: `Instance ${id} not found`,
      };
      res.status(404).json(response);
      return;
    }

    // TODO: Clean up PostgreSQL schema and data
    // TODO: Clean up SSL/DNS configuration

    await registryService.delete(id);

    logger.info(`Factory: Deleted instance ${id}`);

    const response: FactoryResponse = {
      success: true,
      message: 'Instance deleted',
      instanceId: id,
    };

    res.json(response);
  } catch (error) {
    logger.error('Factory: Failed to delete instance', error);
    const response: FactoryResponse = {
      success: false,
      message: 'Failed to delete instance',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

export default router;
