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

describe('Invoice CRUD Integration Tests', () => {
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

  const mockInvoiceRow = {
    id: 'inv-123',
    tran_id: 'INV-001',
    entity: 'cust-123',
    entity_name: 'Test Corp',
    tran_date: '2024-01-15',
    due_date: '2024-02-15',
    status: 'Open',
    currency: 'USD',
    subtotal: '1000.00',
    tax_total: '80.00',
    total: '1080.00',
    amount_paid: '0.00',
    amount_remaining: '1080.00',
    items: [
      { item: 'Widget A', description: 'Premium widget', quantity: 2, rate: 400, amount: 800 },
      { item: 'Widget B', description: 'Standard widget', quantity: 4, rate: 50, amount: 200 },
    ],
    memo: 'Invoice for Q1 services',
    updated_at: '2024-01-15T12:00:00Z',
  };

  describe('GET /api/netsuite/invoices', () => {
    it('should return a list of invoices', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [mockInvoiceRow] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const response = await request(app)
        .get('/api/netsuite/invoices')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].tranId).toBe('INV-001');
      expect(response.body.meta.total).toBe(1);
    });

    it('should return invoices with correct numeric conversions', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [mockInvoiceRow] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const response = await request(app)
        .get('/api/netsuite/invoices')
        .set('Authorization', `Bearer ${validToken}`);

      const invoice = response.body.data[0];
      expect(invoice.subtotal).toBe(1000);
      expect(invoice.taxTotal).toBe(80);
      expect(invoice.total).toBe(1080);
      expect(invoice.amountPaid).toBe(0);
      expect(invoice.amountRemaining).toBe(1080);
    });

    it('should apply pagination parameters', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '50' }] });

      const response = await request(app)
        .get('/api/netsuite/invoices')
        .query({ page: 3, limit: 10 })
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.meta.page).toBe(3);
      expect(response.body.meta.limit).toBe(10);

      // Verify offset calculation: (page - 1) * limit = 20
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.any(String),
        [10, 20]
      );
    });

    it('should enforce maximum limit of 100', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await request(app)
        .get('/api/netsuite/invoices')
        .query({ limit: 200 })
        .set('Authorization', `Bearer ${validToken}`);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([100])
      );
    });

    it('should sort by tran_date desc by default', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await request(app)
        .get('/api/netsuite/invoices')
        .set('Authorization', `Bearer ${validToken}`);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY tran_date desc'),
        expect.any(Array)
      );
    });

    it('should support custom sorting', async () => {
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await request(app)
        .get('/api/netsuite/invoices')
        .query({ sort: 'total', order: 'asc' })
        .set('Authorization', `Bearer ${validToken}`);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY total asc'),
        expect.any(Array)
      );
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/netsuite/invoices');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/netsuite/invoices/:id', () => {
    it('should return a single invoice by ID', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockInvoiceRow] });

      const response = await request(app)
        .get('/api/netsuite/invoices/inv-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('inv-123');
      expect(response.body.data.tranId).toBe('INV-001');
      expect(response.body.data.entityName).toBe('Test Corp');
    });

    it('should return invoice with parsed items array', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockInvoiceRow] });

      const response = await request(app)
        .get('/api/netsuite/invoices/inv-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.body.data.items).toHaveLength(2);
      expect(response.body.data.items[0]).toEqual({
        item: 'Widget A',
        description: 'Premium widget',
        quantity: 2,
        rate: 400,
        amount: 800,
      });
    });

    it('should return 404 for non-existent invoice', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/netsuite/invoices/nonexistent')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVOICE_NOT_FOUND');
    });

    it('should return all invoice fields correctly mapped', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockInvoiceRow] });

      const response = await request(app)
        .get('/api/netsuite/invoices/inv-123')
        .set('Authorization', `Bearer ${validToken}`);

      const invoice = response.body.data;
      expect(invoice).toMatchObject({
        id: 'inv-123',
        tranId: 'INV-001',
        entity: 'cust-123',
        entityName: 'Test Corp',
        tranDate: '2024-01-15',
        dueDate: '2024-02-15',
        status: 'Open',
        currency: 'USD',
        memo: 'Invoice for Q1 services',
      });
    });
  });

  describe('POST /api/netsuite/invoices', () => {
    it('should create a new invoice', async () => {
      const newInvoiceRow = {
        id: 'new-inv-id',
        tran_id: 'INV-1704067200000',
        entity: 'cust-456',
        entity_name: 'New Customer',
        tran_date: '2024-01-20',
        due_date: '2024-02-20',
        status: 'Open',
        currency: 'USD',
        subtotal: '500.00',
        tax_total: '40.00',
        total: '540.00',
        amount_paid: '0.00',
        amount_remaining: '540.00',
        items: [{ item: 'Service', quantity: 1, rate: 500, amount: 500 }],
        memo: 'New invoice',
        updated_at: '2024-01-20T00:00:00Z',
      };
      mockDatabase.query.mockResolvedValueOnce({ rows: [newInvoiceRow] });

      const response = await request(app)
        .post('/api/netsuite/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          entity: 'cust-456',
          entityName: 'New Customer',
          dueDate: '2024-02-20',
          subtotal: 500,
          taxTotal: 40,
          total: 540,
          items: [{ item: 'Service', quantity: 1, rate: 500, amount: 500 }],
          memo: 'New invoice',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.entity).toBe('cust-456');
      expect(response.body.data.tranId).toMatch(/^INV-\d+$/);
    });

    it('should create invoice with different statuses', async () => {
      const paidInvoiceRow = {
        ...mockInvoiceRow,
        id: 'paid-inv',
        status: 'Paid In Full',
        amount_paid: '1080.00',
        amount_remaining: '0.00',
      };
      mockDatabase.query.mockResolvedValueOnce({ rows: [paidInvoiceRow] });

      const response = await request(app)
        .post('/api/netsuite/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          entity: 'cust-123',
          entityName: 'Test Corp',
          dueDate: '2024-02-15',
          subtotal: 1000,
          total: 1080,
          status: 'Paid In Full',
          amountPaid: 1080,
          amountRemaining: 0,
          items: [{ item: 'Item', quantity: 1, rate: 1000, amount: 1000 }],
        });

      expect(response.status).toBe(201);
    });

    it('should return 400 when entity is missing', async () => {
      const response = await request(app)
        .post('/api/netsuite/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          entityName: 'Test',
          dueDate: '2024-02-20',
          subtotal: 100,
          total: 100,
          items: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when entityName is missing', async () => {
      const response = await request(app)
        .post('/api/netsuite/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          entity: 'cust-123',
          dueDate: '2024-02-20',
          subtotal: 100,
          total: 100,
          items: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when dueDate is missing', async () => {
      const response = await request(app)
        .post('/api/netsuite/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          entity: 'cust-123',
          entityName: 'Test',
          subtotal: 100,
          total: 100,
          items: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when subtotal is missing', async () => {
      const response = await request(app)
        .post('/api/netsuite/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          entity: 'cust-123',
          entityName: 'Test',
          dueDate: '2024-02-20',
          total: 100,
          items: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when total is missing', async () => {
      const response = await request(app)
        .post('/api/netsuite/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          entity: 'cust-123',
          entityName: 'Test',
          dueDate: '2024-02-20',
          subtotal: 100,
          items: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when items is missing', async () => {
      const response = await request(app)
        .post('/api/netsuite/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          entity: 'cust-123',
          entityName: 'Test',
          dueDate: '2024-02-20',
          subtotal: 100,
          total: 100,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should create invoice with multiple line items', async () => {
      const multiItemInvoice = {
        ...mockInvoiceRow,
        items: [
          { item: 'Item 1', quantity: 1, rate: 100, amount: 100 },
          { item: 'Item 2', quantity: 2, rate: 50, amount: 100 },
          { item: 'Item 3', quantity: 5, rate: 20, amount: 100 },
        ],
      };
      mockDatabase.query.mockResolvedValueOnce({ rows: [multiItemInvoice] });

      const response = await request(app)
        .post('/api/netsuite/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          entity: 'cust-123',
          entityName: 'Test Corp',
          dueDate: '2024-02-20',
          subtotal: 300,
          total: 300,
          items: [
            { item: 'Item 1', quantity: 1, rate: 100, amount: 100 },
            { item: 'Item 2', quantity: 2, rate: 50, amount: 100 },
            { item: 'Item 3', quantity: 5, rate: 20, amount: 100 },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.items).toHaveLength(3);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/netsuite/invoices')
        .send({
          entity: 'cust-123',
          entityName: 'Test',
          dueDate: '2024-02-20',
          subtotal: 100,
          total: 100,
          items: [],
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/netsuite/query', () => {
    it('should accept SuiteQL query parameter', async () => {
      const response = await request(app)
        .get('/api/netsuite/query')
        .query({ q: 'SELECT id, companyName FROM customer' })
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('hasMore');
      expect(response.body.data).toHaveProperty('items');
      expect(response.body.data).toHaveProperty('totalResults');
    });

    it('should return 400 when query parameter is missing', async () => {
      const response = await request(app)
        .get('/api/netsuite/query')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return mock empty results', async () => {
      const response = await request(app)
        .get('/api/netsuite/query')
        .query({ q: 'SELECT * FROM nonexistent' })
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.body.data).toEqual({
        hasMore: false,
        items: [],
        count: 0,
        offset: 0,
        totalResults: 0,
      });
    });
  });

  describe('Invoice Status Tests', () => {
    const statusTestCases = [
      { status: 'Open', amountPaid: '0.00', amountRemaining: '1000.00' },
      { status: 'Paid In Full', amountPaid: '1000.00', amountRemaining: '0.00' },
      { status: 'Pending Approval', amountPaid: '0.00', amountRemaining: '1000.00' },
      { status: 'Voided', amountPaid: '0.00', amountRemaining: '0.00' },
    ];

    statusTestCases.forEach(({ status, amountPaid, amountRemaining }) => {
      it(`should handle invoice with status: ${status}`, async () => {
        const invoiceWithStatus = {
          ...mockInvoiceRow,
          status,
          amount_paid: amountPaid,
          amount_remaining: amountRemaining,
        };
        mockDatabase.query.mockResolvedValueOnce({ rows: [invoiceWithStatus] });

        const response = await request(app)
          .get('/api/netsuite/invoices/inv-123')
          .set('Authorization', `Bearer ${validToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe(status);
        expect(response.body.data.amountPaid).toBe(parseFloat(amountPaid));
        expect(response.body.data.amountRemaining).toBe(parseFloat(amountRemaining));
      });
    });
  });
});
