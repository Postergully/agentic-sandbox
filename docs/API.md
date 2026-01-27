# API Documentation

Complete API reference for Agentic Sandbox v1.0

Base URL: `http://localhost:3000`

## Authentication

All API endpoints (except health checks and OAuth endpoints) require authentication using Bearer tokens.

### Headers
```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

## Response Format

All responses follow a consistent format:

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "timestamp": "2024-01-27T12:00:00Z"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": { ... }
  }
}
```

## Health Check Endpoints

### GET /health

Basic health check endpoint.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-27T12:00:00Z",
    "uptime": 1234.56,
    "environment": "development"
  }
}
```

### GET /health/detailed

Detailed health check with service status.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-27T12:00:00Z",
    "uptime": 1234.56,
    "environment": "development",
    "services": {
      "database": "connected",
      "redis": "connected"
    },
    "memory": {
      "rss": "150MB",
      "heapUsed": "80MB",
      "heapTotal": "120MB"
    }
  }
}
```

## OAuth Endpoints

### GET /oauth/authorize

OAuth 2.0 authorization endpoint.

**Query Parameters:**
- `client_id` (required): Client identifier
- `redirect_uri` (required): Callback URL
- `response_type` (required): Must be "code"
- `scope` (optional): Requested scopes
- `state` (optional): State parameter for CSRF protection
- `connector_id` (optional): Connector identifier (default: "netsuite")

**Response:**
Redirects to `redirect_uri` with authorization code:
```
http://your-callback?code=AUTH_CODE&state=STATE
```

### POST /oauth/token

Exchange authorization code for access token.

**Request Body:**
```json
{
  "grant_type": "authorization_code",
  "code": "AUTH_CODE",
  "client_id": "agentic-sandbox-client",
  "client_secret": "agentic-sandbox-secret",
  "redirect_uri": "http://localhost:3000/callback"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 86400,
  "scope": "read write"
}
```

**Error Responses:**
- `400` - Invalid request or unsupported grant type
- `401` - Invalid client credentials

### GET /oauth/userinfo

Get authenticated user information.

**Headers:**
```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sub": "user-id",
    "email": "mock.user@example.com",
    "name": "Mock User",
    "picture": "https://via.placeholder.com/150"
  }
}
```

## NetSuite API

### Customers

#### GET /api/netsuite/customers

List all customers with pagination and search.

**Query Parameters:**
- `page` (optional, default: 1): Page number
- `limit` (optional, default: 50, max: 100): Items per page
- `sort` (optional, default: "created_at"): Sort field
- `order` (optional, default: "desc"): Sort order (asc|desc)
- `search` (optional): Search by company name or email

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "companyName": "Acme Corporation",
      "firstName": "John",
      "lastName": "Smith",
      "email": "john.smith@acme.com",
      "phone": "+1-555-0101",
      "isPerson": false,
      "subsidiary": "Parent Company",
      "currency": "USD",
      "terms": "Net 30",
      "balance": 15000.00,
      "unbilledOrders": 5000.00,
      "overdueBalance": 2000.00,
      "billingAddress": {
        "addr1": "123 Main St",
        "city": "New York",
        "state": "NY",
        "zip": "10001",
        "country": "US"
      },
      "shippingAddress": { ... },
      "customFields": {},
      "lastModifiedDate": "2024-01-27T12:00:00Z",
      "dateCreated": "2024-01-15T10:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 5,
    "timestamp": "2024-01-27T12:00:00Z"
  }
}
```

#### GET /api/netsuite/customers/:id

Get a specific customer by ID.

**URL Parameters:**
- `id` (required): Customer UUID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "companyName": "Acme Corporation",
    ...
  }
}
```

**Error Responses:**
- `404` - Customer not found

#### POST /api/netsuite/customers

Create a new customer.

**Request Body:**
```json
{
  "companyName": "New Company Inc",
  "email": "contact@newcompany.com",
  "firstName": "Jane",
  "lastName": "Doe",
  "phone": "+1-555-0199",
  "isPerson": false,
  "subsidiary": "Parent Company",
  "currency": "USD",
  "terms": "Net 30",
  "billingAddress": {
    "addr1": "456 Oak St",
    "city": "Boston",
    "state": "MA",
    "zip": "02101",
    "country": "US"
  }
}
```

**Required Fields:**
- `companyName`
- `email`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "newly-generated-uuid",
    "companyName": "New Company Inc",
    ...
  }
}
```

**Status Code:** `201 Created`

#### PATCH /api/netsuite/customers/:id

Update an existing customer.

**URL Parameters:**
- `id` (required): Customer UUID

**Request Body:**
```json
{
  "email": "newemail@company.com",
  "phone": "+1-555-0200",
  "balance": 20000.00
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "companyName": "Acme Corporation",
    "email": "newemail@company.com",
    ...
  }
}
```

**Error Responses:**
- `404` - Customer not found

### Invoices

#### GET /api/netsuite/invoices

List all invoices with pagination.

**Query Parameters:**
- `page` (optional, default: 1): Page number
- `limit` (optional, default: 50, max: 100): Items per page
- `sort` (optional, default: "tran_date"): Sort field
- `order` (optional, default: "desc"): Sort order (asc|desc)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "tranId": "INV-2024-0001",
      "entity": "550e8400-e29b-41d4-a716-446655440001",
      "entityName": "Acme Corporation",
      "tranDate": "2024-01-15",
      "dueDate": "2024-02-14",
      "status": "Open",
      "currency": "USD",
      "subtotal": 10000.00,
      "taxTotal": 800.00,
      "total": 10800.00,
      "amountPaid": 0.00,
      "amountRemaining": 10800.00,
      "items": [
        {
          "item": "PROD-001",
          "description": "Professional Services",
          "quantity": 40,
          "rate": 250.00,
          "amount": 10000.00,
          "taxRate": 0.08
        }
      ],
      "memo": "Q1 2024 Professional Services",
      "lastModifiedDate": "2024-01-15T14:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 5,
    "timestamp": "2024-01-27T12:00:00Z"
  }
}
```

#### GET /api/netsuite/invoices/:id

Get a specific invoice by ID.

**URL Parameters:**
- `id` (required): Invoice UUID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "tranId": "INV-2024-0001",
    ...
  }
}
```

**Error Responses:**
- `404` - Invoice not found

#### POST /api/netsuite/invoices

Create a new invoice.

**Request Body:**
```json
{
  "entity": "550e8400-e29b-41d4-a716-446655440001",
  "entityName": "Acme Corporation",
  "dueDate": "2024-03-15",
  "status": "Open",
  "currency": "USD",
  "subtotal": 5000.00,
  "taxTotal": 400.00,
  "total": 5400.00,
  "items": [
    {
      "item": "PROD-002",
      "description": "Consulting Services",
      "quantity": 20,
      "rate": 250.00,
      "amount": 5000.00,
      "taxRate": 0.08
    }
  ],
  "memo": "January consulting invoice"
}
```

**Required Fields:**
- `entity`
- `entityName`
- `dueDate`
- `subtotal`
- `total`
- `items`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "newly-generated-uuid",
    "tranId": "INV-1706361234567",
    ...
  }
}
```

**Status Code:** `201 Created`

#### GET /api/netsuite/query

Execute a SuiteQL query (mock endpoint).

**Query Parameters:**
- `q` (required): SuiteQL query string

**Example:**
```
GET /api/netsuite/query?q=SELECT id, companyName FROM customer WHERE balance > 10000
```

**Response:**
```json
{
  "success": true,
  "data": {
    "hasMore": false,
    "items": [],
    "count": 0,
    "offset": 0,
    "totalResults": 0
  }
}
```

**Note:** This is a mock endpoint. In production, it would parse and execute the query.

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `UNAUTHORIZED` | 401 | No valid authentication token provided |
| `TOKEN_REVOKED` | 401 | Token has been revoked |
| `TOKEN_EXPIRED` | 401 | Token has expired |
| `INVALID_TOKEN` | 401 | Token is invalid or malformed |
| `INVALID_TOKEN_TYPE` | 401 | Token type is not 'access' |
| `NOT_FOUND` | 404 | Resource not found |
| `CUSTOMER_NOT_FOUND` | 404 | Customer with given ID not found |
| `INVOICE_NOT_FOUND` | 404 | Invoice with given ID not found |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `AUTH_RATE_LIMIT_EXCEEDED` | 429 | Too many auth attempts |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |

## Rate Limiting

Default rate limits:
- General API: 100 requests per 15 minutes
- Authentication: 5 attempts per 15 minutes
- Strict endpoints: 10 requests per minute

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1706361600
```

## Pagination

Paginated endpoints return metadata:
```json
{
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "timestamp": "2024-01-27T12:00:00Z"
  }
}
```

## Examples

### Complete Authentication Flow

```bash
# 1. Get authorization code
curl "http://localhost:3000/oauth/authorize?client_id=agentic-sandbox-client&redirect_uri=http://localhost:3000/callback&response_type=code"

# 2. Exchange for token
curl -X POST http://localhost:3000/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "YOUR_CODE",
    "client_id": "agentic-sandbox-client",
    "client_secret": "agentic-sandbox-secret",
    "redirect_uri": "http://localhost:3000/callback"
  }'

# 3. Use token to access API
curl http://localhost:3000/api/netsuite/customers \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Search and Pagination

```bash
# Search customers with pagination
curl "http://localhost:3000/api/netsuite/customers?search=acme&page=1&limit=10&sort=balance&order=desc" \
  -H "Authorization: Bearer YOUR_TOKEN"
```
