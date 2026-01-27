import request from 'supertest';
import app from '../../src/app';
import redisClient from '../../src/config/redis';
import config from '../../src/config';

// Mock Redis client
jest.mock('../../src/config/redis', () => ({
  setJSON: jest.fn().mockResolvedValue(undefined),
  getJSON: jest.fn(),
  set: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  del: jest.fn().mockResolvedValue(undefined),
  exists: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  http: jest.fn(),
}));

const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;

describe('OAuth Flow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /oauth/authorize', () => {
    it('should redirect with authorization code when valid parameters provided', async () => {
      const response = await request(app)
        .get('/oauth/authorize')
        .query({
          client_id: 'test-client',
          redirect_uri: 'http://localhost:3001/callback',
          response_type: 'code',
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toMatch(/http:\/\/localhost:3001\/callback\?code=/);
      expect(mockRedisClient.setJSON).toHaveBeenCalledWith(
        expect.stringMatching(/^auth_code:/),
        expect.objectContaining({
          clientId: 'test-client',
          redirectUri: 'http://localhost:3001/callback',
        }),
        600
      );
    });

    it('should include state parameter in redirect if provided', async () => {
      const response = await request(app)
        .get('/oauth/authorize')
        .query({
          client_id: 'test-client',
          redirect_uri: 'http://localhost:3001/callback',
          response_type: 'code',
          state: 'random-state-value',
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('state=random-state-value');
    });

    it('should include scope in stored auth code', async () => {
      await request(app)
        .get('/oauth/authorize')
        .query({
          client_id: 'test-client',
          redirect_uri: 'http://localhost:3001/callback',
          response_type: 'code',
          scope: 'read write',
        });

      expect(mockRedisClient.setJSON).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          scope: 'read write',
        }),
        600
      );
    });

    it('should use default connector_id when not provided', async () => {
      await request(app)
        .get('/oauth/authorize')
        .query({
          client_id: 'test-client',
          redirect_uri: 'http://localhost:3001/callback',
          response_type: 'code',
        });

      expect(mockRedisClient.setJSON).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          connectorId: 'netsuite',
        }),
        600
      );
    });

    it('should use custom connector_id when provided', async () => {
      await request(app)
        .get('/oauth/authorize')
        .query({
          client_id: 'test-client',
          redirect_uri: 'http://localhost:3001/callback',
          response_type: 'code',
          connector_id: 'salesforce',
        });

      expect(mockRedisClient.setJSON).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          connectorId: 'salesforce',
        }),
        600
      );
    });

    it('should return 400 when client_id is missing', async () => {
      const response = await request(app)
        .get('/oauth/authorize')
        .query({
          redirect_uri: 'http://localhost:3001/callback',
          response_type: 'code',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_request');
    });

    it('should return 400 when redirect_uri is missing', async () => {
      const response = await request(app)
        .get('/oauth/authorize')
        .query({
          client_id: 'test-client',
          response_type: 'code',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_request');
    });

    it('should return 400 when response_type is not code', async () => {
      const response = await request(app)
        .get('/oauth/authorize')
        .query({
          client_id: 'test-client',
          redirect_uri: 'http://localhost:3001/callback',
          response_type: 'token',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_request');
    });
  });

  describe('POST /oauth/token', () => {
    const validAuthCode = 'valid-auth-code-uuid';
    const validRedirectUri = 'http://localhost:3001/callback';

    beforeEach(() => {
      mockRedisClient.getJSON.mockResolvedValue({
        clientId: config.oauth.clientId,
        redirectUri: validRedirectUri,
        scope: 'read',
        connectorId: 'netsuite',
        createdAt: Date.now(),
      });
    });

    it('should exchange authorization code for tokens', async () => {
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: validAuthCode,
          client_id: config.oauth.clientId,
          client_secret: config.oauth.clientSecret,
          redirect_uri: validRedirectUri,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('refresh_token');
      expect(response.body.token_type).toBe('Bearer');
      expect(response.body.expires_in).toBe(86400);
    });

    it('should delete authorization code after exchange', async () => {
      await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: validAuthCode,
          client_id: config.oauth.clientId,
          client_secret: config.oauth.clientSecret,
          redirect_uri: validRedirectUri,
        });

      expect(mockRedisClient.del).toHaveBeenCalledWith(`auth_code:${validAuthCode}`);
    });

    it('should store tokens in Redis', async () => {
      await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: validAuthCode,
          client_id: config.oauth.clientId,
          client_secret: config.oauth.clientSecret,
          redirect_uri: validRedirectUri,
        });

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringMatching(/^token:/),
        expect.any(String),
        86400
      );
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringMatching(/^refresh:/),
        expect.any(String),
        604800
      );
    });

    it('should include scope in response', async () => {
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: validAuthCode,
          client_id: config.oauth.clientId,
          client_secret: config.oauth.clientSecret,
          redirect_uri: validRedirectUri,
        });

      expect(response.body.scope).toBe('read');
    });

    it('should return 400 for unsupported grant_type', async () => {
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: config.oauth.clientId,
          client_secret: config.oauth.clientSecret,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('unsupported_grant_type');
    });

    it('should return 401 for invalid client credentials', async () => {
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: validAuthCode,
          client_id: 'wrong-client-id',
          client_secret: 'wrong-secret',
          redirect_uri: validRedirectUri,
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('invalid_client');
    });

    it('should return 400 for invalid/expired authorization code', async () => {
      mockRedisClient.getJSON.mockResolvedValueOnce(null);

      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: 'invalid-code',
          client_id: config.oauth.clientId,
          client_secret: config.oauth.clientSecret,
          redirect_uri: validRedirectUri,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_grant');
    });

    it('should return 400 for mismatched redirect_uri', async () => {
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: validAuthCode,
          client_id: config.oauth.clientId,
          client_secret: config.oauth.clientSecret,
          redirect_uri: 'http://different-uri.com/callback',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_grant');
      expect(response.body.error_description).toContain('Redirect URI');
    });
  });

  describe('GET /oauth/userinfo', () => {
    it('should return mock user info when valid token provided', async () => {
      const response = await request(app)
        .get('/oauth/userinfo')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('sub');
      expect(response.body.data).toHaveProperty('email');
      expect(response.body.data).toHaveProperty('name');
    });

    it('should return 401 when no token provided', async () => {
      const response = await request(app).get('/oauth/userinfo');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('invalid_token');
    });

    it('should return 401 for invalid token format', async () => {
      const response = await request(app)
        .get('/oauth/userinfo')
        .set('Authorization', 'InvalidFormat token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('invalid_token');
    });
  });

  describe('Full OAuth Flow', () => {
    it('should complete full authorization code flow', async () => {
      // Step 1: Get authorization code
      const authResponse = await request(app)
        .get('/oauth/authorize')
        .query({
          client_id: config.oauth.clientId,
          redirect_uri: config.oauth.redirectUri,
          response_type: 'code',
          state: 'test-state',
        });

      expect(authResponse.status).toBe(302);
      const redirectUrl = new URL(authResponse.headers.location);
      const authCode = redirectUrl.searchParams.get('code');
      expect(authCode).toBeDefined();

      // Step 2: Exchange code for tokens
      mockRedisClient.getJSON.mockResolvedValueOnce({
        clientId: config.oauth.clientId,
        redirectUri: config.oauth.redirectUri,
        scope: '',
        connectorId: 'netsuite',
        createdAt: Date.now(),
      });

      const tokenResponse = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode,
          client_id: config.oauth.clientId,
          client_secret: config.oauth.clientSecret,
          redirect_uri: config.oauth.redirectUri,
        });

      expect(tokenResponse.status).toBe(200);
      expect(tokenResponse.body.access_token).toBeDefined();
      expect(tokenResponse.body.refresh_token).toBeDefined();

      // Step 3: Use access token for userinfo
      const userInfoResponse = await request(app)
        .get('/oauth/userinfo')
        .set('Authorization', `Bearer ${tokenResponse.body.access_token}`);

      expect(userInfoResponse.status).toBe(200);
      expect(userInfoResponse.body.success).toBe(true);
    });
  });
});
