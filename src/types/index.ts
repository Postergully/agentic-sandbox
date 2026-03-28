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
export type ConnectorType = 'netsuite' | 'salesforce' | 'hubspot' | 'quickbooks' | 'snowflake';

export type AppGroup = 'ERP' | 'CRM' | 'Marketing' | 'Accounting';

export type AuthType = 'OAUTH' | 'API_KEY' | 'BASIC';

export interface Connector {
  _key: string;
  name: string;
  type: string;
  appGroup: AppGroup;
  appGroupId: string;
  authType: AuthType;
  appDescription: string;
  appCategories: string[];
  iconPath: string;
  isActive: boolean;
  isConfigured: boolean;
  isAuthenticated: boolean;
  supportsRealtime: boolean;
  createdAtTimestamp: number;
  updatedAtTimestamp: number;
}

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

// Snowflake Metadata Types
export interface SnowflakeDatabase {
  id: string;
  name: string;
  owner: string;
  createdAt: string;
  comment?: string;
}

export interface SnowflakeSchema {
  id: string;
  databaseId: string;
  name: string;
  owner: string;
  createdAt: string;
}

export interface SnowflakeTable {
  id: string;
  schemaId: string;
  name: string;
  rowCount: number;
  bytes: number;
  createdAt: string;
}

export interface SnowflakeColumn {
  id: string;
  tableId: string;
  name: string;
  dataType: string;
  nullable: boolean;
  ordinalPosition: number;
}

export interface SnowflakeWarehouse {
  id: string;
  name: string;
  size: 'X-Small' | 'Small' | 'Medium' | 'Large' | 'X-Large';
  state: 'STARTED' | 'SUSPENDED' | 'RESIZING';
  autoSuspendSeconds: number;
  createdAt: string;
}

export interface SnowflakeQueryHistoryEntry {
  id: string;
  statementHandle: string;
  sqlText: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED_WITH_ERROR' | 'ABORTED';
  rowsProduced?: number;
  executionTimeMs?: number;
  createdAt: string;
  completedAt?: string;
}

// Snowflake Sample Data Types
export interface SnowflakeSampleCustomer {
  id: string;
  customerId: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  industry?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SnowflakeSampleOrder {
  id: string;
  orderId: string;
  customerId: string;
  orderDate: string;
  status: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  totalAmount: number;
  shippingAddress?: string;
}

export interface SnowflakeSampleProduct {
  id: string;
  productId: string;
  name: string;
  category: string;
  price: number;
  stockQuantity: number;
  description?: string;
}

export interface SnowflakeSampleOrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

// Snowflake Statement Types
export interface SnowflakeStatementRequest {
  statement: string;
  timeout?: number;
  database?: string;
  schema?: string;
  warehouse?: string;
  role?: string;
  bindings?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}

export interface SnowflakeStatementStatus {
  statementHandle: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED_WITH_ERROR' | 'ABORTED';
  message: string;
  createdOn: number;
  sqlState: string;
  code: string;
}

// Mock Server Registry Types
export type MockServerStatus = 'creating' | 'active' | 'stopped' | 'error';

export interface MockServerInstance {
  id?: string;
  instanceId: string;              // e.g., netsuite_sharechat_331
  connector: string;               // e.g., netsuite
  orgId: string;                   // e.g., sharechat
  jobId?: string;                  // e.g., 331
  status: MockServerStatus;
  errorMessage?: string;
  createdAt?: Date;
  updatedAt?: Date;
  lastAccessedAt?: Date;
  generationBrief?: object;        // GenerationBrief JSONB
  connectorSchema?: object;        // ConnectorSchema JSONB
  sslConfig?: object;              // SSL config JSONB
  baseUrl?: string;
  apiBasePath?: string;
  authEndpoint?: string;
  mockCredentials?: object;
  entityCount?: number;
  recordCounts?: object;
  apiDocsSource?: string;
  pgSchema: string;
}

export interface RegistryFilter {
  connector?: string;
  orgId?: string;
  status?: MockServerStatus;
}

// Instance Router Types
export interface InstanceContext {
  instanceId: string;
  connector: string;
  pgSchema: string;
  baseUrl?: string;
  apiBasePath?: string;
  orgId: string;
}

export interface InstanceRequest extends Request {
  instance?: InstanceContext;
}
