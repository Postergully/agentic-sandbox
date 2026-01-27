import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import redisClient from '../../src/config/redis';
import database from '../../src/config/database';
import config from '../../src/config';
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

describe('Customer CRUD Integration Tests', () => {
  let validToken: string;
  const userId = 'user-123';

  beforeEach(() => {
    jest.clearAllMocks();

    // Generate a valid token for tests
    validToken = generateAccessToken({
      userId,
      email: 'test@example.com',
      connectorId: 'netsuite',
    });

    // Mock Redis to validate the token
    mockRedisClient.exists.mockResolvedValue(false);
    mockRedisClient.get.mockResolvedValue(validToken);
  });

  const mockCustomerRow = {
    id: 'cust-123',
    company_name: 'Test Corp',
    first_name: 'John',
    last_name: 'Doe',
    email: 'test@corp.com',
    phone: '555-1234',
    is_person: false,
    subsidiary: 'Parent Company',
    currency: 'USD',
    terms: 'Net 30',
    balance: '1500.00',
    unbilled_orders: '500.00',
    overdue_balance: '200.00',
    billing_address: { city: 'New York', state: 'NY' },
    shipping_address: { city: 'Los Angeles', state: 'CA' },
    custom_fields: { industry: 'Technology' },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  };

  describe('GET /api/netsuite/customers', () => {
    it('should return a list of customers', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [mockCustomerRow] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const response = await request(app)
        .get('/api/netsuite/customers')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].companyName).toBe('Test Corp');
      expect(response.body.meta).toHaveProperty('total', 1);
    });

    it('should apply pagination parameters', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '100' }] });

      const response = await request(app)
        .get('/api/netsuite/customers')
        .query({ page: 2, limit: 25 })
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.meta.page).toBe(2);
      expect(response.body.meta.limit).toBe(25);
    });

    it('should enforce maximum limit of 100', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await request(app)
        .get('/api/netsuite/customers')
        .query({ limit: 500 })
        .set('Authorization', `Bearer ${validToken}`);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([100]) // limit should be capped at 100
      );
    });

    it('should support search parameter', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [mockCustomerRow] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      await request(app)
        .get('/api/netsuite/customers')
        .query({ search: 'acme' })
        .set('Authorization', `Bearer ${validToken}`);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.arrayContaining(['%acme%'])
      );
    });

    it('should support sorting', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await request(app)
        .get('/api/netsuite/customers')
        .query({ sort: 'company_name', order: 'asc' })
        .set('Authorization', `Bearer ${validToken}`);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY company_name asc'),
        expect.any(Array)
      );
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/netsuite/customers');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/netsuite/customers')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/netsuite/customers/:id', () => {
    it('should return a single customer by ID', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockCustomerRow] });

      const response = await request(app)
        .get('/api/netsuite/customers/cust-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('cust-123');
      expect(response.body.data.companyName).toBe('Test Corp');
      expect(response.body.data.balance).toBe(1500);
    });

    it('should return 404 for non-existent customer', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/netsuite/customers/nonexistent')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CUSTOMER_NOT_FOUND');
    });

    it('should correctly parse JSON fields (addresses, custom fields)', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockCustomerRow] });

      const response = await request(app)
        .get('/api/netsuite/customers/cust-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.body.data.billingAddress).toEqual({ city: 'New York', state: 'NY' });
      expect(response.body.data.customFields).toEqual({ industry: 'Technology' });
    });
  });

  describe('POST /api/netsuite/customers', () => {
    it('should create a new customer', async () => {
      const newCustomerRow = {
        ...mockCustomerRow,
        id: 'new-cust-id',
        company_name: 'New Corp',
        email: 'new@corp.com',
      };
      mockDatabase.query.mockResolvedValueOnce({ rows: [newCustomerRow] });

      const response = await request(app)
        .post('/api/netsuite/customers')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          companyName: 'New Corp',
          email: 'new@corp.com',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.companyName).toBe('New Corp');
      expect(response.body.data.email).toBe('new@corp.com');
    });

    it('should create customer with all fields', async () => {
      const fullCustomerRow = {
        ...mockCustomerRow,
        id: 'full-cust-id',
        company_name: 'Full Corp',
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@full.com',
        phone: '555-9999',
        is_person: true,
        subsidiary: 'West Division',
        currency: 'EUR',
        terms: 'Net 60',
        balance: '2000.00',
        billing_address: { city: 'Berlin', country: 'DE' },
        shipping_address: { city: 'Munich', country: 'DE' },
        custom_fields: { priority: 'high', contractNumber: 'CT-001' },
      };
      mockDatabase.query.mockResolvedValueOnce({ rows: [fullCustomerRow] });

      const response = await request(app)
        .post('/api/netsuite/customers')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          companyName: 'Full Corp',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@full.com',
          phone: '555-9999',
          isPerson: true,
          subsidiary: 'West Division',
          currency: 'EUR',
          terms: 'Net 60',
          balance: 2000,
          billingAddress: { city: 'Berlin', country: 'DE' },
          shippingAddress: { city: 'Munich', country: 'DE' },
          customFields: { priority: 'high', contractNumber: 'CT-001' },
        });

      expect(response.status).toBe(201);
      expect(response.body.data.firstName).toBe('Jane');
      expect(response.body.data.isPerson).toBe(true);
    });

    it('should return 400 when companyName is missing', async () => {
      const response = await request(app)
        .post('/api/netsuite/customers')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          email: 'test@test.com',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('companyName');
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app)
        .post('/api/netsuite/customers')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          companyName: 'Test Corp',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('email');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/netsuite/customers')
        .send({
          companyName: 'Test',
          email: 'test@test.com',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('PATCH /api/netsuite/customers/:id', () => {
    it('should update an existing customer', async () => {
      // First call: check if customer exists
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockCustomerRow] });
      // Second call: update customer
      const updatedRow = { ...mockCustomerRow, company_name: 'Updated Corp' };
      mockDatabase.query.mockResolvedValueOnce({ rows: [updatedRow] });

      const response = await request(app)
        .patch('/api/netsuite/customers/cust-123')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          companyName: 'Updated Corp',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.companyName).toBe('Updated Corp');
    });

    it('should update multiple fields', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockCustomerRow] });
      const updatedRow = {
        ...mockCustomerRow,
        email: 'updated@corp.com',
        phone: '555-5555',
        balance: '2500.00',
      };
      mockDatabase.query.mockResolvedValueOnce({ rows: [updatedRow] });

      const response = await request(app)
        .patch('/api/netsuite/customers/cust-123')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          email: 'updated@corp.com',
          phone: '555-5555',
          balance: 2500,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.email).toBe('updated@corp.com');
      expect(response.body.data.phone).toBe('555-5555');
      expect(response.body.data.balance).toBe(2500);
    });

    it('should return 404 for non-existent customer', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .patch('/api/netsuite/customers/nonexistent')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          companyName: 'Test',
        });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('CUSTOMER_NOT_FOUND');
    });

    it('should only update provided fields (partial update)', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockCustomerRow] });
      const updatedRow = { ...mockCustomerRow, phone: '999-9999' };
      mockDatabase.query.mockResolvedValueOnce({ rows: [updatedRow] });

      await request(app)
        .patch('/api/netsuite/customers/cust-123')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          phone: '999-9999',
        });

      // The update query should use COALESCE for partial updates
      expect(mockDatabase.query).toHaveBeenLastCalledWith(
        expect.stringContaining('COALESCE'),
        expect.any(Array)
      );
    });
  });

  describe('Authentication Tests', () => {
    it('should reject blacklisted tokens', async () => {
      mockRedisClient.exists.mockResolvedValueOnce(true); // Token is blacklisted

      const response = await request(app)
        .get('/api/netsuite/customers')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_REVOKED');
    });

    it('should reject expired tokens', async () => {
      const expiredToken = jwt.sign(
        {
          userId: 'user-123',
          email: 'test@example.com',
          connectorId: 'netsuite',
          type: 'access',
        },
        config.jwt.secret,
        { expiresIn: '-1h' }
      );

      const response = await request(app)
        .get('/api/netsuite/customers')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('should reject refresh tokens used as access tokens', async () => {
      const refreshToken = jwt.sign(
        {
          userId: 'user-123',
          email: 'test@example.com',
          connectorId: 'netsuite',
          type: 'refresh',
        },
        config.jwt.secret,
        { expiresIn: '7d' }
      );
      mockRedisClient.exists.mockResolvedValueOnce(false);

      const response = await request(app)
        .get('/api/netsuite/customers')
        .set('Authorization', `Bearer ${refreshToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_TOKEN_TYPE');
    });
  });
});
