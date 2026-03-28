import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { AuthRequest, TokenPayload } from '../types';
import { AppError } from './errorHandler';
import redisClient from '../config/redis';
import logger from '../utils/logger';

export const authenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.substring(7);

    // Check if token is blacklisted
    const isBlacklisted = await redisClient.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new AppError('Token has been revoked', 401, 'TOKEN_REVOKED');
    }

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;

    if (decoded.type !== 'access') {
      throw new AppError('Invalid token type', 401, 'INVALID_TOKEN_TYPE');
    }

    // Check if token exists in cache
    const cachedToken = await redisClient.get(`token:${decoded.userId}`);
    if (!cachedToken || cachedToken !== token) {
      throw new AppError('Token not found or expired', 401, 'TOKEN_EXPIRED');
    }

    // Attach user to request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      connectorId: decoded.connectorId,
      role: 'user',
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.error(`JWT verification failed: ${error.message}`);
      return next(new AppError('Invalid token', 401, 'INVALID_TOKEN'));
    }
    if (error instanceof jwt.TokenExpiredError) {
      logger.error('Token expired');
      return next(new AppError('Token expired', 401, 'TOKEN_EXPIRED'));
    }
    next(error);
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      await authenticate(req, res, next);
    } else {
      next();
    }
  } catch (error) {
    next();
  }
};

export const generateAccessToken = (payload: Omit<TokenPayload, 'type'>): string => {
  return jwt.sign({ ...payload, type: 'access' }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
  });
};

export const generateRefreshToken = (
  payload: Omit<TokenPayload, 'type'>
): string => {
  return jwt.sign({ ...payload, type: 'refresh' }, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
  });
};
