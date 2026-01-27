import { Request } from 'express';

// Authentication Types
export interface AuthUser {
  id: string;
  email: string;
  connectorId: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

// Token Types
export interface TokenPayload {
  userId: string;
  email: string;
  connectorId: string;
  type: 'access' | 'refresh';
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ErrorResponse;
  meta?: ResponseMeta;
}

export interface ErrorResponse {
  code: string;
  message: string;
  details?: any;
}

export interface ResponseMeta {
  page?: number;
  limit?: number;
  total?: number;
  timestamp: string;
}

// Connector Types
export type ConnectorType = 'netsuite' | 'salesforce' | 'hubspot' | 'quickbooks';

export interface ConnectorConfig {
  id: string;
  name: string;
  type: ConnectorType;
  authType: 'oauth1' | 'oauth2' | 'api_key';
  baseUrl: string;
  enabled: boolean;
  settings: Record<string, any>;
}

// NetSuite Types
export interface NetSuiteCustomer {
  id: string;
  companyName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  isPerson?: boolean;
  subsidiary?: string;
  currency?: string;
  terms?: string;
  balance: number;
  unbilledOrders: number;
  overdueBalance: number;
  lastModifiedDate: string;
  dateCreated: string;
  billingAddress?: Address;
  shippingAddress?: Address;
  customFields?: Record<string, any>;
}

export interface NetSuiteInvoice {
  id: string;
  tranId: string;
  entity: string;
  entityName: string;
  tranDate: string;
  dueDate: string;
  status: 'Open' | 'Paid In Full' | 'Pending Approval' | 'Voided';
  currency: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  amountRemaining: number;
  items: InvoiceItem[];
  memo?: string;
  lastModifiedDate: string;
}

export interface InvoiceItem {
  item: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  taxCode?: string;
  taxRate?: number;
}

export interface Address {
  addressee?: string;
  addr1?: string;
  addr2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

// Query Parameters
export interface QueryParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  filters?: Record<string, any>;
}

// Data Generation Types
export interface DataGenerationRequest {
  connector: ConnectorType;
  entity: string;
  count: number;
  industry?: string;
  scenario?: 'moderate' | 'difficult' | 'edge';
  seed?: number;
}

export interface DataGenerationResponse {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  recordsGenerated: number;
  message?: string;
}
