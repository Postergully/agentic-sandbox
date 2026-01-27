import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ApiResponse, OAuthTokenResponse } from '../types';
import { generateAccessToken, generateRefreshToken } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { authRateLimiter } from '../middleware/rateLimiter';
import redisClient from '../config/redis';
import config from '../config';

const router = Router();

// OAuth 2.0 Authorization endpoint
router.get('/authorize', asyncHandler(async (req: Request, res: Response) => {
  const { client_id, redirect_uri, response_type, scope, state } = req.query;

  // Validate required parameters
  if (!client_id || !redirect_uri || response_type !== 'code') {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing or invalid required parameters',
    });
  }

  // Generate authorization code
  const code = uuidv4();
  const connectorId = req.query.connector_id as string || 'netsuite';

  // Store authorization code in Redis (expires in 10 minutes)
  await redisClient.setJSON(`auth_code:${code}`, {
    clientId: client_id,
    redirectUri: redirect_uri,
    scope: scope || '',
    connectorId,
    createdAt: Date.now(),
  }, 600);

  // Redirect back with authorization code
  const redirectUrl = new URL(redirect_uri as string);
  redirectUrl.searchParams.append('code', code);
  if (state) {
    redirectUrl.searchParams.append('state', state as string);
  }

  res.redirect(redirectUrl.toString());
}));

// OAuth 2.0 Token endpoint
router.post('/token', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { grant_type, code, client_id, client_secret, redirect_uri } = req.body;

  if (grant_type !== 'authorization_code') {
    return res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Only authorization_code grant type is supported',
    });
  }

  // Validate client credentials
  if (client_id !== config.oauth.clientId || client_secret !== config.oauth.clientSecret) {
    return res.status(401).json({
      error: 'invalid_client',
      error_description: 'Invalid client credentials',
    });
  }

  // Retrieve authorization code from Redis
  const authData = await redisClient.getJSON<any>(`auth_code:${code}`);
  if (!authData) {
    return res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Authorization code is invalid or expired',
    });
  }

  // Validate redirect URI
  if (authData.redirectUri !== redirect_uri) {
    return res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Redirect URI does not match',
    });
  }

  // Delete used authorization code
  await redisClient.del(`auth_code:${code}`);

  // Generate tokens
  const userId = uuidv4();
  const email = `user-${userId.substring(0, 8)}@mock.local`;

  const accessToken = generateAccessToken({
    userId,
    email,
    connectorId: authData.connectorId,
  });

  const refreshToken = generateRefreshToken({
    userId,
    email,
    connectorId: authData.connectorId,
  });

  // Store tokens in Redis
  await redisClient.set(`token:${userId}`, accessToken, 86400); // 24 hours
  await redisClient.set(`refresh:${userId}`, refreshToken, 604800); // 7 days

  const response: OAuthTokenResponse = {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: 86400,
    scope: authData.scope,
  };

  res.json(response);
}));

// Mock user info endpoint
router.get('/userinfo', asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'No valid token provided',
    });
  }

  const response: ApiResponse = {
    success: true,
    data: {
      sub: uuidv4(),
      email: 'mock.user@example.com',
      name: 'Mock User',
      picture: 'https://via.placeholder.com/150',
    },
  };

  res.json(response);
}));

export default router;
