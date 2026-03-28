import { Response, NextFunction } from 'express';
import { InstanceRequest } from '../types';
import { AppError } from './errorHandler';
import registryService from '../services/registryService';
import logger from '../utils/logger';

/**
 * Instance Router Middleware
 *
 * Extracts instance_id from URL path, validates the instance exists and is active,
 * then attaches instance metadata to the request for downstream handlers.
 *
 * URL pattern: /:instance_id/...
 */
export const instanceRouter = async (
  req: InstanceRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const instanceId = req.params.instance_id;

    if (!instanceId) {
      throw new AppError('Instance ID is required', 400, 'MISSING_INSTANCE_ID');
    }

    const instance = await registryService.get(instanceId);

    if (!instance) {
      throw new AppError(
        `Instance not found: ${instanceId}`,
        404,
        'INSTANCE_NOT_FOUND'
      );
    }

    if (instance.status !== 'active') {
      throw new AppError(
        `Instance is not active: ${instanceId} (status: ${instance.status})`,
        503,
        'INSTANCE_NOT_ACTIVE'
      );
    }

    // Attach instance metadata to request
    req.instance = {
      instanceId: instance.instanceId,
      connector: instance.connector,
      pgSchema: instance.pgSchema,
      baseUrl: instance.baseUrl,
      apiBasePath: instance.apiBasePath,
      orgId: instance.orgId,
    };

    // Update last accessed timestamp (fire-and-forget)
    registryService.updateLastAccessed(instanceId).catch((err) => {
      logger.warn(`Failed to update last_accessed_at for ${instanceId}: ${err}`);
    });

    next();
  } catch (error) {
    next(error);
  }
};
