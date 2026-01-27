import { v4 as uuidv4 } from 'uuid';
import database from '../config/database';
import { NetSuiteCustomer, NetSuiteInvoice, QueryParams } from '../types';
import logger from '../utils/logger';

class NetSuiteService {
  // Customer operations
  async getCustomers(params: QueryParams = {}): Promise<{ data: NetSuiteCustomer[]; total: number }> {
    const { page = 1, limit = 50, sort = 'created_at', order = 'desc', search } = params;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM netsuite_customers';
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (search) {
      query += ` WHERE company_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex}`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY ${sort} ${order} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    const result = await database.query(query, queryParams);

    const countQuery = search
      ? 'SELECT COUNT(*) FROM netsuite_customers WHERE company_name ILIKE $1 OR email ILIKE $1'
      : 'SELECT COUNT(*) FROM netsuite_customers';

    const countResult = await database.query(countQuery, search ? [`%${search}%`] : []);
    const total = parseInt(countResult.rows[0].count, 10);

    return {
      data: result.rows.map(this.mapCustomerFromDb),
      total,
    };
  }

  async getCustomerById(id: string): Promise<NetSuiteCustomer | null> {
    const result = await database.query(
      'SELECT * FROM netsuite_customers WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapCustomerFromDb(result.rows[0]);
  }

  async createCustomer(data: Partial<NetSuiteCustomer>): Promise<NetSuiteCustomer> {
    const id = uuidv4();

    const result = await database.query(
      `INSERT INTO netsuite_customers (
        id, company_name, first_name, last_name, email, phone, is_person,
        subsidiary, currency, terms, balance, unbilled_orders, overdue_balance,
        billing_address, shipping_address, custom_fields
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        id,
        data.companyName,
        data.firstName || null,
        data.lastName || null,
        data.email,
        data.phone || null,
        data.isPerson || false,
        data.subsidiary || 'Parent Company',
        data.currency || 'USD',
        data.terms || 'Net 30',
        data.balance || 0,
        data.unbilledOrders || 0,
        data.overdueBalance || 0,
        JSON.stringify(data.billingAddress || {}),
        JSON.stringify(data.shippingAddress || {}),
        JSON.stringify(data.customFields || {}),
      ]
    );

    logger.info(`Created NetSuite customer: ${id}`);
    return this.mapCustomerFromDb(result.rows[0]);
  }

  async updateCustomer(id: string, data: Partial<NetSuiteCustomer>): Promise<NetSuiteCustomer | null> {
    const existing = await this.getCustomerById(id);
    if (!existing) {
      return null;
    }

    const result = await database.query(
      `UPDATE netsuite_customers SET
        company_name = COALESCE($2, company_name),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        balance = COALESCE($5, balance),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *`,
      [id, data.companyName, data.email, data.phone, data.balance]
    );

    logger.info(`Updated NetSuite customer: ${id}`);
    return this.mapCustomerFromDb(result.rows[0]);
  }

  // Invoice operations
  async getInvoices(params: QueryParams = {}): Promise<{ data: NetSuiteInvoice[]; total: number }> {
    const { page = 1, limit = 50, sort = 'tran_date', order = 'desc' } = params;
    const offset = (page - 1) * limit;

    const query = `
      SELECT * FROM netsuite_invoices
      ORDER BY ${sort} ${order}
      LIMIT $1 OFFSET $2
    `;

    const result = await database.query(query, [limit, offset]);

    const countResult = await database.query('SELECT COUNT(*) FROM netsuite_invoices');
    const total = parseInt(countResult.rows[0].count, 10);

    return {
      data: result.rows.map(this.mapInvoiceFromDb),
      total,
    };
  }

  async getInvoiceById(id: string): Promise<NetSuiteInvoice | null> {
    const result = await database.query(
      'SELECT * FROM netsuite_invoices WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapInvoiceFromDb(result.rows[0]);
  }

  async createInvoice(data: Partial<NetSuiteInvoice>): Promise<NetSuiteInvoice> {
    const id = uuidv4();
    const tranId = `INV-${Date.now()}`;

    const result = await database.query(
      `INSERT INTO netsuite_invoices (
        id, tran_id, entity, entity_name, tran_date, due_date, status,
        currency, subtotal, tax_total, total, amount_paid, amount_remaining,
        items, memo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        id,
        tranId,
        data.entity,
        data.entityName,
        data.tranDate || new Date().toISOString(),
        data.dueDate,
        data.status || 'Open',
        data.currency || 'USD',
        data.subtotal,
        data.taxTotal || 0,
        data.total,
        data.amountPaid || 0,
        data.amountRemaining || data.total,
        JSON.stringify(data.items || []),
        data.memo || null,
      ]
    );

    logger.info(`Created NetSuite invoice: ${tranId}`);
    return this.mapInvoiceFromDb(result.rows[0]);
  }

  // Helper methods
  private mapCustomerFromDb(row: any): NetSuiteCustomer {
    return {
      id: row.id,
      companyName: row.company_name,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      isPerson: row.is_person,
      subsidiary: row.subsidiary,
      currency: row.currency,
      terms: row.terms,
      balance: parseFloat(row.balance),
      unbilledOrders: parseFloat(row.unbilled_orders),
      overdueBalance: parseFloat(row.overdue_balance),
      billingAddress: row.billing_address,
      shippingAddress: row.shipping_address,
      customFields: row.custom_fields,
      lastModifiedDate: row.updated_at,
      dateCreated: row.created_at,
    };
  }

  private mapInvoiceFromDb(row: any): NetSuiteInvoice {
    return {
      id: row.id,
      tranId: row.tran_id,
      entity: row.entity,
      entityName: row.entity_name,
      tranDate: row.tran_date,
      dueDate: row.due_date,
      status: row.status,
      currency: row.currency,
      subtotal: parseFloat(row.subtotal),
      taxTotal: parseFloat(row.tax_total),
      total: parseFloat(row.total),
      amountPaid: parseFloat(row.amount_paid),
      amountRemaining: parseFloat(row.amount_remaining),
      items: row.items,
      memo: row.memo,
      lastModifiedDate: row.updated_at,
    };
  }
}

export default new NetSuiteService();
