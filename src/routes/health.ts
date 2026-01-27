import { Router, Request, Response } from 'express';
import database from '../config/database';
import redisClient from '../config/redis';
import { ApiResponse } from '../types';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
    },
  };

  res.status(200).json(response);
});

router.get('/detailed', async (_req: Request, res: Response) => {
  const dbHealthy = await database.testConnection();
  const redisHealthy = await redisClient.testConnection();

  const response: ApiResponse = {
    success: dbHealthy && redisHealthy,
    data: {
      status: dbHealthy && redisHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      services: {
        database: dbHealthy ? 'connected' : 'disconnected',
        redis: redisHealthy ? 'connected' : 'disconnected',
      },
      memory: {
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
      },
    },
  };

  res.status(dbHealthy && redisHealthy ? 200 : 503).json(response);
});

export default router;
