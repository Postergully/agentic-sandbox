import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const responseTimeMs = Number(endTime - startTime) / 1_000_000;

    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      response_time_ms: Math.round(responseTimeMs * 100) / 100,
      instance_id: (req as unknown as { instance?: { instanceId?: string } }).instance?.instanceId,
      request_id: req.headers['x-request-id'] as string | undefined,
      user_agent: req.headers['user-agent'],
      content_length: res.getHeader('content-length'),
      ip: req.ip || req.socket.remoteAddress,
    };

    const message = `${req.method} ${logData.path} ${res.statusCode} ${logData.response_time_ms}ms`;

    if (res.statusCode >= 500) {
      logger.error(message, { meta: logData });
    } else if (res.statusCode >= 400) {
      logger.warn(message, { meta: logData });
    } else {
      logger.info(message, { meta: logData });
    }
  });

  next();
};
