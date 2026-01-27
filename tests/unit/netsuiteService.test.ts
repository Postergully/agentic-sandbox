import netsuiteService from '../../src/services/netsuiteService';
import database from '../../src/config/database';
import { QueryParams } from '../../src/types';

// Mock dependencies
jest.mock('../../src/config/database');
jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const mockDatabase = database as jest.Mocked<typeof database>;

describe('NetSuiteService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Customer Operations', () => {
    describe('getCustomers', () => {
      const mockCustomerRow = {
        id: 'cust-123',
        company_name: 'Acme Corp',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@acme.com',
        phone: '555-1234',
        is_person: false,
        subsidiary: 'Parent Company',
        currency: 'USD',
        terms: 'Net 30',
        balance: '1000.00',
        unbilled_orders: '500.00',
        overdue_balance: '0.00',
        billing_address: { city: 'New York' },
        shipping_address: { city: 'Los Angeles' },
        custom_fields: {},
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      it('should return customers with pagination defaults', async () => {
        mockDatabase.query
          .mockResolvedValueOnce({ rows: [mockCustomerRow] } as any)
          .mockResolvedValueOnce({ rows: [{ count: '1' }] } as any);

        const result = await netsuiteService.getCustomers();

        expect(result.data).toHaveLength(1);
        expect(result.total).toBe(1);
        expect(result.data[0].companyName).toBe('Acme Corp');
        expect(result.data[0].balance).toBe(1000);
      });

      it('should apply pagination parameters correctly', async () => {
        mockDatabase.query
          .mockResolvedValueOnce({ rows: [] } as any)
          .mockResolvedValueOnce({ rows: [{ count: '100' }] } as any);

        const params: QueryParams = { page: 2, limit: 25 };
        await netsuiteService.getCustomers(params);

        expect(mockDatabase.query).toHaveBeenCalledWith(
          expect.stringContaining('LIMIT $1 OFFSET $2'),
          [25, 25]
        );
      });

      it('should apply sorting parameters', async () => {
        mockDatabase.query
          .mockResolvedValueOnce({ rows: [] } as any)
          .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);

        const params: QueryParams = { sort: 'company_name', order: 'asc' };
        await netsuiteService.getCustomers(params);

        expect(mockDatabase.query).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY company_name asc'),
          expect.any(Array)
        );
      });

      it('should apply search filter', async () => {
        mockDatabase.query
          .mockResolvedValueOnce({ rows: [] } as any)
          .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);

        const params: QueryParams = { search: 'acme' };
        await netsuiteService.getCustomers(params);

        expect(mockDatabase.query).toHaveBeenCalledWith(
          expect.stringContaining('WHERE company_name ILIKE'),
          expect.arrayContaining(['%acme%'])
        );
      });

      it('should correctly map database rows to customer objects', async () => {
        mockDatabase.query
          .mockResolvedValueOnce({ rows: [mockCustomerRow] } as any)
          .mockResolvedValueOnce({ rows: [{ count: '1' }] } as any);

        const result = await netsuiteService.getCustomers();
        const customer = result.data[0];

        expect(customer).toEqual({
          id: 'cust-123',
          companyName: 'Acme Corp',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@acme.com',
          phone: '555-1234',
          isPerson: false,
          subsidiary: 'Parent Company',
          currency: 'USD',
          terms: 'Net 30',
          balance: 1000,
          unbilledOrders: 500,
          overdueBalance: 0,
          billingAddress: { city: 'New York' },
          shippingAddress: { city: 'Los Angeles' },
          customFields: {},
          dateCreated: '2024-01-01T00:00:00Z',
          lastModifiedDate: '2024-01-02T00:00:00Z',
        });
      });
    });

    describe('getCustomerById', () => {
      it('should return customer when found', async () => {
        const mockRow = {
          id: 'cust-123',
          company_name: 'Test Corp',
          email: 'test@corp.com',
          balance: '500.00',
          unbilled_orders: '0.00',
          overdue_balance: '0.00',
        };
        mockDatabase.query.mockResolvedValueOnce({ rows: [mockRow] } as any);

        const result = await netsuiteService.getCustomerById('cust-123');

        expect(result).not.toBeNull();
        expect(result?.id).toBe('cust-123');
        expect(mockDatabase.query).toHaveBeenCalledWith(
          'SELECT * FROM netsuite_customers WHERE id = $1',
          ['cust-123']
        );
      });

      it('should return null when customer not found', async () => {
        mockDatabase.query.mockResolvedValueOnce({ rows: [] } as any);

        const result = await netsuiteService.getCustomerById('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('createCustomer', () => {
      it('should create customer with required fields', async () => {
        const mockReturnRow = {
          id: 'new-cust-id',
          company_name: 'New Corp',
          email: 'new@corp.com',
          balance: '0.00',
          unbilled_orders: '0.00',
          overdue_balance: '0.00',
        };
        mockDatabase.query.mockResolvedValueOnce({ rows: [mockReturnRow] } as any);

        const customerData = {
          companyName: 'New Corp',
          email: 'new@corp.com',
        };
        const result = await netsuiteService.createCustomer(customerData);

        expect(result.companyName).toBe('New Corp');
        expect(result.email).toBe('new@corp.com');
        expect(mockDatabase.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO netsuite_customers'),
          expect.arrayContaining(['New Corp', 'new@corp.com'])
        );
      });

      it('should apply default values for optional fields', async () => {
        const mockReturnRow = {
          id: 'new-id',
          company_name: 'Test',
          email: 'test@test.com',
          is_person: false,
          subsidiary: 'Parent Company',
          currency: 'USD',
          terms: 'Net 30',
          balance: '0.00',
          unbilled_orders: '0.00',
          overdue_balance: '0.00',
        };
        mockDatabase.query.mockResolvedValueOnce({ rows: [mockReturnRow] } as any);

        await netsuiteService.createCustomer({
          companyName: 'Test',
          email: 'test@test.com',
        });

        expect(mockDatabase.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([
            expect.any(String), // id (UUID)
            'Test', // companyName
            null, // firstName
            null, // lastName
            'test@test.com', // email
            null, // phone
            false, // isPerson
            'Parent Company', // subsidiary
            'USD', // currency
            'Net 30', // terms
            0, // balance
            0, // unbilledOrders
            0, // overdueBalance
          ])
        );
      });

      it('should create customer with all optional fields', async () => {
        const mockReturnRow = {
          id: 'full-cust-id',
          company_name: 'Full Corp',
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'jane@full.com',
          phone: '555-9999',
          is_person: true,
          subsidiary: 'West Coast',
          currency: 'EUR',
          terms: 'Net 60',
          balance: '1000.00',
          unbilled_orders: '200.00',
          overdue_balance: '100.00',
          billing_address: { city: 'Berlin' },
          shipping_address: { city: 'Munich' },
          custom_fields: { vip: true },
        };
        mockDatabase.query.mockResolvedValueOnce({ rows: [mockReturnRow] } as any);

        const customerData = {
          companyName: 'Full Corp',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@full.com',
          phone: '555-9999',
          isPerson: true,
          subsidiary: 'West Coast',
          currency: 'EUR',
          terms: 'Net 60',
          balance: 1000,
          unbilledOrders: 200,
          overdueBalance: 100,
          billingAddress: { city: 'Berlin' },
          shippingAddress: { city: 'Munich' },
          customFields: { vip: true },
        };

        const result = await netsuiteService.createCustomer(customerData);

        expect(result.firstName).toBe('Jane');
        expect(result.isPerson).toBe(true);
      });
    });

    describe('updateCustomer', () => {
      it('should update existing customer', async () => {
        // Mock getCustomerById call
        mockDatabase.query.mockResolvedValueOnce({
          rows: [{ id: 'cust-123', company_name: 'Old Name', email: 'old@email.com', balance: '0.00', unbilled_orders: '0.00', overdue_balance: '0.00' }],
        } as any);

        // Mock update call
        mockDatabase.query.mockResolvedValueOnce({
          rows: [{ id: 'cust-123', company_name: 'New Name', email: 'new@email.com', balance: '0.00', unbilled_orders: '0.00', overdue_balance: '0.00' }],
        } as any);

        const result = await netsuiteService.updateCustomer('cust-123', {
          companyName: 'New Name',
          email: 'new@email.com',
        });

        expect(result).not.toBeNull();
        expect(result?.companyName).toBe('New Name');
      });

      it('should return null for non-existent customer', async () => {
        mockDatabase.query.mockResolvedValueOnce({ rows: [] } as any);

        const result = await netsuiteService.updateCustomer('nonexistent', {
          companyName: 'Test',
        });

        expect(result).toBeNull();
      });

      it('should only update specified fields using COALESCE', async () => {
        mockDatabase.query.mockResolvedValueOnce({
          rows: [{ id: 'cust-123', company_name: 'Name', email: 'email@test.com', balance: '100.00', unbilled_orders: '0.00', overdue_balance: '0.00' }],
        } as any);
        mockDatabase.query.mockResolvedValueOnce({
          rows: [{ id: 'cust-123', company_name: 'Name', email: 'updated@test.com', balance: '100.00', unbilled_orders: '0.00', overdue_balance: '0.00' }],
        } as any);

        await netsuiteService.updateCustomer('cust-123', { email: 'updated@test.com' });

        expect(mockDatabase.query).toHaveBeenLastCalledWith(
          expect.stringContaining('COALESCE'),
          expect.any(Array)
        );
      });
    });
  });

  describe('Invoice Operations', () => {
    const mockInvoiceRow = {
      id: 'inv-123',
      tran_id: 'INV-001',
      entity: 'cust-123',
      entity_name: 'Acme Corp',
      tran_date: '2024-01-01',
      due_date: '2024-02-01',
      status: 'Open',
      currency: 'USD',
      subtotal: '1000.00',
      tax_total: '100.00',
      total: '1100.00',
      amount_paid: '0.00',
      amount_remaining: '1100.00',
      items: [{ item: 'Item 1', quantity: 1, rate: 1000, amount: 1000 }],
      memo: 'Test invoice',
      updated_at: '2024-01-01T00:00:00Z',
    };

    describe('getInvoices', () => {
      it('should return invoices with pagination defaults', async () => {
        mockDatabase.query
          .mockResolvedValueOnce({ rows: [mockInvoiceRow] } as any)
          .mockResolvedValueOnce({ rows: [{ count: '1' }] } as any);

        const result = await netsuiteService.getInvoices();

        expect(result.data).toHaveLength(1);
        expect(result.total).toBe(1);
        expect(result.data[0].tranId).toBe('INV-001');
      });

      it('should apply pagination parameters', async () => {
        mockDatabase.query
          .mockResolvedValueOnce({ rows: [] } as any)
          .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);

        await netsuiteService.getInvoices({ page: 3, limit: 10 });

        expect(mockDatabase.query).toHaveBeenCalledWith(
          expect.stringContaining('LIMIT $1 OFFSET $2'),
          [10, 20]
        );
      });

      it('should apply sorting by default on tran_date', async () => {
        mockDatabase.query
          .mockResolvedValueOnce({ rows: [] } as any)
          .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);

        await netsuiteService.getInvoices();

        expect(mockDatabase.query).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY tran_date desc'),
          expect.any(Array)
        );
      });

      it('should correctly map database rows to invoice objects', async () => {
        mockDatabase.query
          .mockResolvedValueOnce({ rows: [mockInvoiceRow] } as any)
          .mockResolvedValueOnce({ rows: [{ count: '1' }] } as any);

        const result = await netsuiteService.getInvoices();
        const invoice = result.data[0];

        expect(invoice).toEqual({
          id: 'inv-123',
          tranId: 'INV-001',
          entity: 'cust-123',
          entityName: 'Acme Corp',
          tranDate: '2024-01-01',
          dueDate: '2024-02-01',
          status: 'Open',
          currency: 'USD',
          subtotal: 1000,
          taxTotal: 100,
          total: 1100,
          amountPaid: 0,
          amountRemaining: 1100,
          items: [{ item: 'Item 1', quantity: 1, rate: 1000, amount: 1000 }],
          memo: 'Test invoice',
          lastModifiedDate: '2024-01-01T00:00:00Z',
        });
      });
    });

    describe('getInvoiceById', () => {
      it('should return invoice when found', async () => {
        mockDatabase.query.mockResolvedValueOnce({ rows: [mockInvoiceRow] } as any);

        const result = await netsuiteService.getInvoiceById('inv-123');

        expect(result).not.toBeNull();
        expect(result?.id).toBe('inv-123');
        expect(result?.total).toBe(1100);
      });

      it('should return null when invoice not found', async () => {
        mockDatabase.query.mockResolvedValueOnce({ rows: [] } as any);

        const result = await netsuiteService.getInvoiceById('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('createInvoice', () => {
      it('should create invoice with required fields', async () => {
        const mockReturnRow = {
          id: 'new-inv-id',
          tran_id: 'INV-1234567890',
          entity: 'cust-123',
          entity_name: 'Test Customer',
          tran_date: '2024-01-15',
          due_date: '2024-02-15',
          status: 'Open',
          currency: 'USD',
          subtotal: '500.00',
          tax_total: '50.00',
          total: '550.00',
          amount_paid: '0.00',
          amount_remaining: '550.00',
          items: [],
          memo: null,
        };
        mockDatabase.query.mockResolvedValueOnce({ rows: [mockReturnRow] } as any);

        const invoiceData = {
          entity: 'cust-123',
          entityName: 'Test Customer',
          dueDate: '2024-02-15',
          subtotal: 500,
          taxTotal: 50,
          total: 550,
          items: [{ item: 'Test Item', description: 'Test description', quantity: 1, rate: 500, amount: 500 }],
        };

        const result = await netsuiteService.createInvoice(invoiceData);

        expect(result.entity).toBe('cust-123');
        expect(result.status).toBe('Open');
        expect(mockDatabase.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO netsuite_invoices'),
          expect.any(Array)
        );
      });

      it('should generate a unique tranId', async () => {
        const mockReturnRow = {
          id: 'inv-id',
          tran_id: 'INV-1704067200000',
          entity: 'cust-1',
          entity_name: 'Customer',
          subtotal: '100.00',
          tax_total: '0.00',
          total: '100.00',
          amount_paid: '0.00',
          amount_remaining: '100.00',
          items: [],
        };
        mockDatabase.query.mockResolvedValueOnce({ rows: [mockReturnRow] } as any);

        const result = await netsuiteService.createInvoice({
          entity: 'cust-1',
          entityName: 'Customer',
          dueDate: '2024-02-01',
          subtotal: 100,
          total: 100,
        });

        expect(result.tranId).toMatch(/^INV-\d+$/);
      });

      it('should set default values for optional fields', async () => {
        const mockReturnRow = {
          id: 'inv-id',
          tran_id: 'INV-123',
          entity: 'cust-1',
          entity_name: 'Customer',
          tran_date: new Date().toISOString(),
          due_date: '2024-02-01',
          status: 'Open',
          currency: 'USD',
          subtotal: '100.00',
          tax_total: '0.00',
          total: '100.00',
          amount_paid: '0.00',
          amount_remaining: '100.00',
          items: [],
          memo: null,
        };
        mockDatabase.query.mockResolvedValueOnce({ rows: [mockReturnRow] } as any);

        await netsuiteService.createInvoice({
          entity: 'cust-1',
          entityName: 'Customer',
          dueDate: '2024-02-01',
          subtotal: 100,
          total: 100,
        });

        expect(mockDatabase.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([
            'Open', // status default
            'USD', // currency default
          ])
        );
      });

      it('should calculate amountRemaining from total when not provided', async () => {
        const mockReturnRow = {
          id: 'inv-id',
          tran_id: 'INV-123',
          entity: 'cust-1',
          entity_name: 'Customer',
          subtotal: '1000.00',
          tax_total: '0.00',
          total: '1000.00',
          amount_paid: '0.00',
          amount_remaining: '1000.00',
          items: [],
        };
        mockDatabase.query.mockResolvedValueOnce({ rows: [mockReturnRow] } as any);

        await netsuiteService.createInvoice({
          entity: 'cust-1',
          entityName: 'Customer',
          dueDate: '2024-02-01',
          subtotal: 1000,
          total: 1000,
        });

        // amountRemaining should default to total
        expect(mockDatabase.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([1000]) // amountRemaining = total
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should propagate database errors from getCustomers', async () => {
      const dbError = new Error('Database connection failed');
      mockDatabase.query.mockRejectedValueOnce(dbError);

      await expect(netsuiteService.getCustomers()).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should propagate database errors from createCustomer', async () => {
      const dbError = new Error('Unique constraint violation');
      mockDatabase.query.mockRejectedValueOnce(dbError);

      await expect(
        netsuiteService.createCustomer({ companyName: 'Test', email: 'test@test.com' })
      ).rejects.toThrow('Unique constraint violation');
    });

    it('should propagate database errors from getInvoices', async () => {
      const dbError = new Error('Query timeout');
      mockDatabase.query.mockRejectedValueOnce(dbError);

      await expect(netsuiteService.getInvoices()).rejects.toThrow('Query timeout');
    });
  });
});
