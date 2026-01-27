import { Router, Response } from 'express';
import { AuthRequest, ApiResponse, QueryParams } from '../types';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import netsuiteService from '../services/netsuiteService';
import logger from '../utils/logger';

const router = Router();

// All NetSuite routes require authentication
router.use(authenticate);

// GET /api/netsuite/customers - List customers
router.get('/customers', asyncHandler(async (req: AuthRequest, res: Response) => {
  const queryParams: QueryParams = {
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 50, 100),
    sort: (req.query.sort as string) || 'created_at',
    order: (req.query.order as 'asc' | 'desc') || 'desc',
    search: req.query.search as string,
  };

  const { data, total } = await netsuiteService.getCustomers(queryParams);

  const response: ApiResponse = {
    success: true,
    data,
    meta: {
      page: queryParams.page,
      limit: queryParams.limit,
      total,
      timestamp: new Date().toISOString(),
    },
  };

  res.json(response);
}));

// GET /api/netsuite/customers/:id - Get customer by ID
router.get('/customers/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const customer = await netsuiteService.getCustomerById(id);

  if (!customer) {
    throw new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');
  }

  const response: ApiResponse = {
    success: true,
    data: customer,
  };

  res.json(response);
}));

// POST /api/netsuite/customers - Create customer
router.post('/customers', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { companyName, email, ...rest } = req.body;

  if (!companyName || !email) {
    throw new AppError(
      'companyName and email are required',
      400,
      'VALIDATION_ERROR'
    );
  }

  const customer = await netsuiteService.createCustomer({
    companyName,
    email,
    ...rest,
  });

  logger.info(`Customer created by user ${req.user?.id}: ${customer.id}`);

  const response: ApiResponse = {
    success: true,
    data: customer,
  };

  res.status(201).json(response);
}));

// PATCH /api/netsuite/customers/:id - Update customer
router.patch('/customers/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const customer = await netsuiteService.updateCustomer(id, req.body);

  if (!customer) {
    throw new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');
  }

  logger.info(`Customer updated by user ${req.user?.id}: ${id}`);

  const response: ApiResponse = {
    success: true,
    data: customer,
  };

  res.json(response);
}));

// GET /api/netsuite/invoices - List invoices
router.get('/invoices', asyncHandler(async (req: AuthRequest, res: Response) => {
  const queryParams: QueryParams = {
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 50, 100),
    sort: (req.query.sort as string) || 'tran_date',
    order: (req.query.order as 'asc' | 'desc') || 'desc',
  };

  const { data, total } = await netsuiteService.getInvoices(queryParams);

  const response: ApiResponse = {
    success: true,
    data,
    meta: {
      page: queryParams.page,
      limit: queryParams.limit,
      total,
      timestamp: new Date().toISOString(),
    },
  };

  res.json(response);
}));

// GET /api/netsuite/invoices/:id - Get invoice by ID
router.get('/invoices/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const invoice = await netsuiteService.getInvoiceById(id);

  if (!invoice) {
    throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND');
  }

  const response: ApiResponse = {
    success: true,
    data: invoice,
  };

  res.json(response);
}));

// POST /api/netsuite/invoices - Create invoice
router.post('/invoices', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { entity, entityName, dueDate, subtotal, total, items, ...rest } = req.body;

  if (!entity || !entityName || !dueDate || !subtotal || !total || !items) {
    throw new AppError(
      'Required fields: entity, entityName, dueDate, subtotal, total, items',
      400,
      'VALIDATION_ERROR'
    );
  }

  const invoice = await netsuiteService.createInvoice({
    entity,
    entityName,
    dueDate,
    subtotal,
    total,
    items,
    ...rest,
  });

  logger.info(`Invoice created by user ${req.user?.id}: ${invoice.tranId}`);

  const response: ApiResponse = {
    success: true,
    data: invoice,
  };

  res.status(201).json(response);
}));

// GET /api/netsuite/query - SuiteQL query endpoint (mock)
router.get('/query', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { q } = req.query;

  if (!q) {
    throw new AppError('Query parameter "q" is required', 400, 'VALIDATION_ERROR');
  }

  logger.info(`SuiteQL query executed: ${q}`);

  // Mock response - in a real implementation, this would parse and execute the query
  const response: ApiResponse = {
    success: true,
    data: {
      hasMore: false,
      items: [],
      count: 0,
      offset: 0,
      totalResults: 0,
    },
  };

  res.json(response);
}));

export default router;
