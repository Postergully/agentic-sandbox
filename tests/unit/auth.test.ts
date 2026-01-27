import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import {
  authenticate,
  optionalAuth,
  generateAccessToken,
  generateRefreshToken,
} from '../../src/middleware/auth';
import { AppError } from '../../src/middleware/errorHandler';
import redisClient from '../../src/config/redis';
import config from '../../src/config';
import { AuthRequest, TokenPayload } from '../../src/types';

// Mock dependencies
jest.mock('../../src/config/redis');
jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;

describe('Auth Middleware', () => {
  let mockRequest: Partial<AuthRequest>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  describe('generateAccessToken', () => {
    it('should generate a valid JWT access token', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        connectorId: 'netsuite',
      };

      const token = generateAccessToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      const decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.connectorId).toBe(payload.connectorId);
      expect(decoded.type).toBe('access');
    });

    it('should include expiration in the token', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        connectorId: 'netsuite',
      };

      const token = generateAccessToken(payload);
      const decoded = jwt.decode(token) as jwt.JwtPayload;

      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid JWT refresh token', () => {
      const payload = {
        userId: 'user-456',
        email: 'refresh@example.com',
        connectorId: 'salesforce',
      };

      const token = generateRefreshToken(payload);

      expect(token).toBeDefined();
      const decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.type).toBe('refresh');
    });

    it('should have longer expiration than access token', () => {
      const payload = {
        userId: 'user-456',
        email: 'refresh@example.com',
        connectorId: 'salesforce',
      };

      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      const accessDecoded = jwt.decode(accessToken) as jwt.JwtPayload;
      const refreshDecoded = jwt.decode(refreshToken) as jwt.JwtPayload;

      expect(refreshDecoded.exp! - refreshDecoded.iat!).toBeGreaterThan(
        accessDecoded.exp! - accessDecoded.iat!
      );
    });
  });

  describe('authenticate', () => {
    it('should reject requests without authorization header', async () => {
      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No token provided',
          statusCode: 401,
          code: 'UNAUTHORIZED',
        })
      );
    });

    it('should reject requests with invalid authorization header format', async () => {
      mockRequest.headers = { authorization: 'InvalidFormat token123' };

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No token provided',
          statusCode: 401,
        })
      );
    });

    it('should reject blacklisted tokens', async () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        connectorId: 'netsuite',
      };
      const token = generateAccessToken(payload);
      mockRequest.headers = { authorization: `Bearer ${token}` };

      mockRedisClient.exists.mockResolvedValueOnce(true);

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockRedisClient.exists).toHaveBeenCalledWith(`blacklist:${token}`);
      expect(nextFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Token has been revoked',
          statusCode: 401,
          code: 'TOKEN_REVOKED',
        })
      );
    });

    it('should reject tokens with invalid type (refresh token used as access)', async () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        connectorId: 'netsuite',
      };
      const refreshToken = generateRefreshToken(payload);
      mockRequest.headers = { authorization: `Bearer ${refreshToken}` };

      mockRedisClient.exists.mockResolvedValueOnce(false);

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid token type',
          statusCode: 401,
          code: 'INVALID_TOKEN_TYPE',
        })
      );
    });

    it('should reject tokens not found in cache', async () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        connectorId: 'netsuite',
      };
      const token = generateAccessToken(payload);
      mockRequest.headers = { authorization: `Bearer ${token}` };

      mockRedisClient.exists.mockResolvedValueOnce(false);
      mockRedisClient.get.mockResolvedValueOnce(null);

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Token not found or expired',
          statusCode: 401,
          code: 'TOKEN_EXPIRED',
        })
      );
    });

    it('should reject tokens that do not match cached token', async () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        connectorId: 'netsuite',
      };
      const token = generateAccessToken(payload);
      mockRequest.headers = { authorization: `Bearer ${token}` };

      mockRedisClient.exists.mockResolvedValueOnce(false);
      mockRedisClient.get.mockResolvedValueOnce('different-token-value');

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Token not found or expired',
          statusCode: 401,
          code: 'TOKEN_EXPIRED',
        })
      );
    });

    it('should authenticate valid tokens successfully', async () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        connectorId: 'netsuite',
      };
      const token = generateAccessToken(payload);
      mockRequest.headers = { authorization: `Bearer ${token}` };

      mockRedisClient.exists.mockResolvedValueOnce(false);
      mockRedisClient.get.mockResolvedValueOnce(token);

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith();
      expect((mockRequest as AuthRequest).user).toEqual({
        id: payload.userId,
        email: payload.email,
        connectorId: payload.connectorId,
        role: 'user',
      });
    });

    it('should handle malformed JWT tokens', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid.token.here' };

      mockRedisClient.exists.mockResolvedValueOnce(false);

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid token',
          statusCode: 401,
          code: 'INVALID_TOKEN',
        })
      );
    });

    it('should handle expired JWT tokens', async () => {
      // Create a token that expires in 1 second, then wait for it
      const expiredToken = jwt.sign(
        {
          userId: 'user-123',
          email: 'test@example.com',
          connectorId: 'netsuite',
          type: 'access',
          exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        },
        config.jwt.secret
      );
      mockRequest.headers = { authorization: `Bearer ${expiredToken}` };

      mockRedisClient.exists.mockResolvedValueOnce(false);

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Token expired',
          statusCode: 401,
          code: 'TOKEN_EXPIRED',
        })
      );
    });

    it('should handle tokens signed with wrong secret', async () => {
      const wrongSecretToken = jwt.sign(
        {
          userId: 'user-123',
          email: 'test@example.com',
          connectorId: 'netsuite',
          type: 'access',
        },
        'wrong-secret'
      );
      mockRequest.headers = { authorization: `Bearer ${wrongSecretToken}` };

      mockRedisClient.exists.mockResolvedValueOnce(false);

      await authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid token',
          statusCode: 401,
          code: 'INVALID_TOKEN',
        })
      );
    });
  });

  describe('optionalAuth', () => {
    it('should proceed without authentication when no header is present', async () => {
      await optionalAuth(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith();
      expect((mockRequest as AuthRequest).user).toBeUndefined();
    });

    it('should proceed without authentication for non-Bearer headers', async () => {
      mockRequest.headers = { authorization: 'Basic some-credentials' };

      await optionalAuth(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith();
    });

    it('should authenticate when valid Bearer token is provided', async () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        connectorId: 'netsuite',
      };
      const token = generateAccessToken(payload);
      mockRequest.headers = { authorization: `Bearer ${token}` };

      mockRedisClient.exists.mockResolvedValueOnce(false);
      mockRedisClient.get.mockResolvedValueOnce(token);

      await optionalAuth(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should proceed even when token authentication fails', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid-token' };

      mockRedisClient.exists.mockResolvedValueOnce(false);

      await optionalAuth(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      // optionalAuth should call next() even on failure
      expect(nextFunction).toHaveBeenCalled();
    });
  });
});
