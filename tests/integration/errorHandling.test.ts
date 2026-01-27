import request from 'supertest';
import app from '../../src/app';
import redisClient from '../../src/config/redis';
import database from '../../src/config/database';
import { generateAccessToken } from '../../src/middleware/auth';

// Mock dependencies
jest.mock('../../src/config/redis', () => ({
  setJSON: jest.fn().mockResolvedValue(undefined),
  getJSON: jest.fn(),
  set: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  del: jest.fn().mockResolvedValue(undefined),
  exists: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  http: jest.fn(),
}));

const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;
const mockDatabase = database as jest.Mocked<typeof database>;

describe('Error Handling Integration Tests', () => {
  let validToken: string;

  beforeEach(() => {
    jest.clearAllMocks();

    validToken = generateAccessToken({
      userId: 'user-123',
      email: 'test@example.com',
      connectorId: 'netsuite',
    });

    mockRedisClient.exists.mockResolvedValue(false);
    mockRedisClient.get.mockResolvedValue(validToken);
  });

  describe('404 Not Found', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/api/unknown/route');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toContain('/api/unknown/route');
    });

    it('should return 404 for unknown NetSuite endpoints', async () => {
      const response = await request(app)
        .get('/api/netsuite/unknownendpoint')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent resources', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/netsuite/customers/nonexistent-uuid')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('CUSTOMER_NOT_FOUND');
    });
  });

  describe('400 Bad Request', () => {
    it('should return 400 for missing required fields on customer creation', async () => {
      const response = await request(app)
        .post('/api/netsuite/customers')
        .set('Authorization', `Bearer ${validToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing required fields on invoice creation', async () => {
      const response = await request(app)
        .post('/api/netsuite/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          entity: 'cust-123',
          // Missing entityName, dueDate, subtotal, total, items
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid OAuth parameters', async () => {
      const response = await request(app)
        .get('/oauth/authorize')
        .query({
          client_id: 'test',
          // Missing redirect_uri and response_type
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_request');
    });

    it('should return 400 for missing query parameter on SuiteQL endpoint', async () => {
      const response = await request(app)
        .get('/api/netsuite/query')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('401 Unauthorized', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app).get('/api/netsuite/customers');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for malformed token', async () => {
      const response = await request(app)
        .get('/api/netsuite/customers')
        .set('Authorization', 'Bearer malformed-token');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should return 401 for missing Bearer prefix', async () => {
      const response = await request(app)
        .get('/api/netsuite/customers')
        .set('Authorization', validToken);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for blacklisted token', async () => {
      mockRedisClient.exists.mockResolvedValueOnce(true);

      const response = await request(app)
        .get('/api/netsuite/customers')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_REVOKED');
    });

    it('should return 401 when token not found in cache', async () => {
      mockRedisClient.exists.mockResolvedValueOnce(false);
      mockRedisClient.get.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/netsuite/customers')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('should return 401 for invalid OAuth client credentials', async () => {
      mockRedisClient.getJSON.mockResolvedValueOnce({
        clientId: 'test-client',
        redirectUri: 'http://localhost:3001/callback',
        scope: '',
        connectorId: 'netsuite',
      });

      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: 'valid-code',
          client_id: 'wrong-client',
          client_secret: 'wrong-secret',
          redirect_uri: 'http://localhost:3001/callback',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('invalid_client');
    });
  });

  describe('500 Internal Server Error', () => {
    it('should return 500 for database errors on customer list', async () => {
      mockDatabase.query.mockRejectedValueOnce(new Error('Database connection lost'));

      const response = await request(app)
        .get('/api/netsuite/customers')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
      // Should not expose internal error details
      expect(response.body.error.message).not.toContain('Database connection');
    });

    it('should return 500 for database errors on customer creation', async () => {
      mockDatabase.query.mockRejectedValueOnce(new Error('Constraint violation'));

      const response = await request(app)
        .post('/api/netsuite/customers')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          companyName: 'Test Corp',
          email: 'test@corp.com',
        });

      expect(response.status).toBe(500);
      expect(response.body.error.message).toBe('An unexpected error occurred');
    });

    it('should return 500 for Redis errors during authentication', async () => {
      mockRedisClient.exists.mockRejectedValueOnce(new Error('Redis unavailable'));

      const response = await request(app)
        .get('/api/netsuite/customers')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(500);
    });
  });

  describe('Response Format Consistency', () => {
    it('should always return success: false on errors', async () => {
      const endpoints = [
        { method: 'get', path: '/api/unknown' },
        { method: 'get', path: '/api/netsuite/customers' },
        { method: 'post', path: '/api/netsuite/customers' },
      ];

      for (const endpoint of endpoints) {
        const response = await (request(app) as any)[endpoint.method](endpoint.path);

        expect(response.body).toHaveProperty('success');
        if (response.status >= 400) {
          expect(response.body.success).toBe(false);
        }
      }
    });

    it('should always include error object with code and message on errors', async () => {
      // 401 error
      const authError = await request(app).get('/api/netsuite/customers');
      expect(authError.body.error).toHaveProperty('code');
      expect(authError.body.error).toHaveProperty('message');

      // 404 error
      const notFoundError = await request(app).get('/api/unknown/path');
      expect(notFoundError.body.error).toHaveProperty('code');
      expect(notFoundError.body.error).toHaveProperty('message');

      // 400 error
      mockRedisClient.getJSON.mockResolvedValueOnce(null);
      const badRequestError = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: 'invalid',
          client_id: 'test',
          client_secret: 'test',
          redirect_uri: 'http://localhost/callback',
        });
      expect(badRequestError.body).toHaveProperty('error');
    });
  });

  describe('Content Type Headers', () => {
    it('should return JSON content type on success', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const response = await request(app)
        .get('/api/netsuite/customers')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should return JSON content type on errors', async () => {
      const response = await request(app).get('/api/unknown');

      expect(response.headers['content-type']).toContain('application/json');
    });
  });

  describe('Method Not Allowed', () => {
    it('should return 404 for unsupported HTTP methods on endpoints', async () => {
      // DELETE is not implemented for customers
      const response = await request(app)
        .delete('/api/netsuite/customers/cust-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
    });

    it('should return 404 for PUT on customer endpoint (only PATCH supported)', async () => {
      const response = await request(app)
        .put('/api/netsuite/customers/cust-123')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ companyName: 'Test' });

      expect(response.status).toBe(404);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty request body gracefully', async () => {
      const response = await request(app)
        .post('/api/netsuite/customers')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send('');

      expect(response.status).toBe(400);
    });

    it('should handle malformed JSON in request body', async () => {
      const response = await request(app)
        .post('/api/netsuite/customers')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send('{invalid json}');

      expect(response.status).toBe(400);
    });

    it('should handle very long customer IDs', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      const longId = 'a'.repeat(1000);
      const response = await request(app)
        .get(`/api/netsuite/customers/${longId}`)
        .set('Authorization', `Bearer ${validToken}`);

      // Should handle gracefully (either 404 or query error)
      expect([404, 500]).toContain(response.status);
    });

    it('should handle special characters in search parameter', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const response = await request(app)
        .get('/api/netsuite/customers')
        .query({ search: "O'Reilly & Co." })
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
    });

    it('should handle negative page numbers', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const response = await request(app)
        .get('/api/netsuite/customers')
        .query({ page: -1 })
        .set('Authorization', `Bearer ${validToken}`);

      // Should either use default or handle gracefully
      expect(response.status).toBe(200);
    });

    it('should handle non-numeric limit values', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const response = await request(app)
        .get('/api/netsuite/customers')
        .query({ limit: 'invalid' })
        .set('Authorization', `Bearer ${validToken}`);

      // parseInt returns NaN for 'invalid', which becomes default value
      expect(response.status).toBe(200);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers from helmet', async () => {
      const response = await request(app).get('/health');

      // Helmet sets various security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});
