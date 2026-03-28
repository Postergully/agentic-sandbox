import { Router, Request, Response } from 'express';
import { snowflakeService } from '../../services/snowflakeService';
import { asyncHandler } from '../../middleware/errorHandler';
import logger from '../../utils/logger';

const router = Router();

/**
 * POST /oauth/token-request
 * Snowflake OAuth token endpoint
 * Accepts ANY credentials for mock testing
 *
 * This endpoint simulates Snowflake's OAuth token-request endpoint.
 * For mock server purposes, it accepts any credentials and returns valid tokens.
 */
router.post(
  '/token-request',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Log the request (for debugging)
    logger.info('Snowflake OAuth token request', {
      grantType: req.body.grant_type,
      clientId: req.body.client_id ? '[REDACTED]' : undefined,
      scope: req.body.scope,
    });

    // Accept any credentials - this is a mock server
    const token = snowflakeService.generateMockToken();

    // Return standard OAuth response
    res.json({
      access_token: token.access_token,
      token_type: token.token_type,
      expires_in: token.expires_in,
      scope: req.body.scope || 'session:role:PUBLIC',
    });
  })
);

/**
 * POST /oauth/token
 * Standard OAuth2 token endpoint (alternative to token-request)
 *
 * Some OAuth clients use /oauth/token instead of /oauth/token-request.
 * This endpoint provides the same functionality for compatibility.
 */
router.post(
  '/token',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Log the request (for debugging)
    logger.info('Snowflake OAuth token request (via /token)', {
      grantType: req.body.grant_type,
      clientId: req.body.client_id ? '[REDACTED]' : undefined,
      scope: req.body.scope,
    });

    // Accept any credentials - this is a mock server
    const token = snowflakeService.generateMockToken();

    // Return standard OAuth response
    res.json({
      access_token: token.access_token,
      token_type: token.token_type,
      expires_in: token.expires_in,
      scope: req.body.scope || 'session:role:PUBLIC',
    });
  })
);

/**
 * POST /oauth/token-refresh
 * Snowflake OAuth token refresh endpoint
 *
 * Handles refresh_token grant type for renewing expired tokens.
 */
router.post(
  '/token-refresh',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    logger.info('Snowflake OAuth token refresh', {
      grantType: req.body.grant_type,
      refreshToken: req.body.refresh_token ? '[REDACTED]' : undefined,
    });

    // Accept any refresh token - this is a mock server
    const token = snowflakeService.generateMockToken();

    res.json({
      access_token: token.access_token,
      token_type: token.token_type,
      expires_in: token.expires_in,
      scope: req.body.scope || 'session:role:PUBLIC',
    });
  })
);

export default router;
