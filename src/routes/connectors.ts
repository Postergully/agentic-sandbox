import { Router, Request, Response } from 'express';
import { ApiResponse } from '../types';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import connectorService from '../services/connectorService';

const router = Router();

// GET /api/v1/connectors - List all connectors
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const connectors = connectorService.getAllConnectors();

  const response: ApiResponse = {
    success: true,
    data: connectors,
    meta: {
      total: connectors.length,
      timestamp: new Date().toISOString(),
    },
  };

  res.json(response);
}));

// GET /api/v1/connectors/active - List active connectors
router.get('/active', asyncHandler(async (_req: Request, res: Response) => {
  const connectors = connectorService.getActiveConnectors();

  const response: ApiResponse = {
    success: true,
    data: connectors,
    meta: {
      total: connectors.length,
      timestamp: new Date().toISOString(),
    },
  };

  res.json(response);
}));

// GET /api/v1/connectors/inactive - List inactive connectors
router.get('/inactive', asyncHandler(async (_req: Request, res: Response) => {
  const connectors = connectorService.getInactiveConnectors();

  const response: ApiResponse = {
    success: true,
    data: connectors,
    meta: {
      total: connectors.length,
      timestamp: new Date().toISOString(),
    },
  };

  res.json(response);
}));

// GET /api/v1/connectors/:name - Get single connector by name
router.get('/:name', asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.params;

  const connector = connectorService.getConnectorByName(name);

  if (!connector) {
    throw new AppError('Connector not found', 404, 'CONNECTOR_NOT_FOUND');
  }

  const response: ApiResponse = {
    success: true,
    data: connector,
  };

  res.json(response);
}));

export default router;
