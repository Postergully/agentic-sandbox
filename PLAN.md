# Phase 2 Implementation Plan - Connector Expansion

**Status:** DRAFT - Awaiting Approval
**Created:** 2026-01-27
**Target:** Expand connector support from NetSuite to include Salesforce, HubSpot, and QuickBooks

---

## 1. Phase 2 Goals

### Primary Objectives
1. **Implement 3 additional connectors**: Salesforce, HubSpot, and QuickBooks
2. **Standardize connector architecture**: Create a reusable pattern for all connectors
3. **Add data generation**: Implement Faker.js-based data generation for each connector
4. **Connector-specific OAuth**: Implement OAuth 2.0 flows tailored to each connector
5. **API parity**: Match real connector API response formats

### Success Criteria
- All 4 connectors (including NetSuite) fully operational with CRUD operations
- Each connector has at least 3 core entities implemented
- OAuth flows work correctly for each connector
- Data generation produces 1000+ realistic records per connector
- 80%+ test coverage for new code
- All existing tests continue to pass

---

## 2. Connector Priority

Based on TECHNICAL_SPEC.md Section 3.2 Priority Matrix:

| Priority | Connector | Auth Type | Complexity | Phase 2 Scope |
|----------|-----------|-----------|------------|---------------|
| 1 | **Salesforce** | OAuth 2.0 | High | Account, Contact, Opportunity |
| 2 | **HubSpot** | OAuth 2.0 | Medium | Contact, Company, Deal |
| 3 | **QuickBooks** | OAuth 2.0 | Medium | Customer, Invoice, Payment |

### Rationale
- **Salesforce first**: Highest market share (23%), most complex API, sets pattern for others
- **HubSpot second**: Clean REST API, good documentation, complements Salesforce CRM coverage
- **QuickBooks third**: Financial data pairs well with NetSuite, different domain than CRM

---

## 3. File-by-File Implementation Plan

### 3.1 New Files to Create

#### Phase 2A: Base Infrastructure (Create First)

```
src/connectors/base/
├── BaseConnector.ts         # Abstract base class for all connectors
├── BaseService.ts           # Abstract service with common CRUD patterns
├── types.ts                 # Shared connector types
└── index.ts                 # Exports

src/generators/
├── BaseGenerator.ts         # Abstract data generator class
├── FakerHelpers.ts          # Common Faker.js utilities
├── IndustryTemplates.ts     # Industry-specific data templates
└── index.ts                 # Exports
```

#### Phase 2B: Salesforce Connector

```
src/connectors/salesforce/
├── types.ts                 # SalesforceAccount, SalesforceContact, SalesforceOpportunity
├── SalesforceService.ts     # Service layer with CRUD operations
├── SalesforceRoutes.ts      # Express routes matching SF API paths
├── SalesforceOAuth.ts       # SF-specific OAuth handler
└── index.ts                 # Exports

src/generators/salesforce/
├── SalesforceGenerator.ts   # Main generator class
├── AccountGenerator.ts      # Account-specific generation
├── ContactGenerator.ts      # Contact-specific generation
├── OpportunityGenerator.ts  # Opportunity-specific generation
└── index.ts                 # Exports

tests/unit/
├── salesforceService.test.ts
├── salesforceGenerator.test.ts

tests/integration/
├── salesforceApi.test.ts
├── salesforceOAuth.test.ts
```

#### Phase 2C: HubSpot Connector

```
src/connectors/hubspot/
├── types.ts                 # HubSpotContact, HubSpotCompany, HubSpotDeal
├── HubSpotService.ts        # Service layer
├── HubSpotRoutes.ts         # Routes matching HS API v3
├── HubSpotOAuth.ts          # HS-specific OAuth handler
└── index.ts                 # Exports

src/generators/hubspot/
├── HubSpotGenerator.ts      # Main generator class
├── ContactGenerator.ts      # Contact properties generation
├── CompanyGenerator.ts      # Company properties generation
├── DealGenerator.ts         # Deal properties generation
└── index.ts                 # Exports

tests/unit/
├── hubspotService.test.ts
├── hubspotGenerator.test.ts

tests/integration/
├── hubspotApi.test.ts
├── hubspotOAuth.test.ts
```

#### Phase 2D: QuickBooks Connector

```
src/connectors/quickbooks/
├── types.ts                 # QBCustomer, QBInvoice, QBPayment
├── QuickBooksService.ts     # Service layer
├── QuickBooksRoutes.ts      # Routes matching QB API v3
├── QuickBooksOAuth.ts       # QB-specific OAuth handler
└── index.ts                 # Exports

src/generators/quickbooks/
├── QuickBooksGenerator.ts   # Main generator class
├── CustomerGenerator.ts     # Customer generation
├── InvoiceGenerator.ts      # Invoice with line items
├── PaymentGenerator.ts      # Payment generation
└── index.ts                 # Exports

tests/unit/
├── quickbooksService.test.ts
├── quickbooksGenerator.test.ts

tests/integration/
├── quickbooksApi.test.ts
├── quickbooksOAuth.test.ts
```

### 3.2 Existing Files to Modify

| File | Changes Required | Priority |
|------|------------------|----------|
| `src/types/index.ts` | Add types for SF, HS, QB entities | High |
| `src/app.ts` | Register new connector routes | High |
| `src/routes/auth.ts` | Support connector-specific OAuth flows | High |
| `src/middleware/auth.ts` | Handle connector-specific token formats | Medium |
| `src/config/database.ts` | Add connection pooling for new tables | Low |
| `package.json` | Add @faker-js/faker dependency | High |
| `jest.config.js` | Update test patterns for new tests | Low |

### 3.3 Database Migrations to Create

```
migrations/
├── 002_salesforce_tables.sql
├── 003_hubspot_tables.sql
├── 004_quickbooks_tables.sql
└── 005_connector_oauth_clients.sql
```

### 3.4 Implementation Order

```
Week 1: Base Infrastructure
  └── BaseConnector, BaseService, BaseGenerator
  └── Refactor NetSuite to use base classes
  └── Add @faker-js/faker dependency

Week 2: Salesforce Connector
  └── Database tables
  └── Types and service layer
  └── Routes and OAuth
  └── Data generator
  └── Tests

Week 3: HubSpot Connector
  └── Database tables
  └── Types and service layer
  └── Routes and OAuth
  └── Data generator
  └── Tests

Week 4: QuickBooks Connector
  └── Database tables
  └── Types and service layer
  └── Routes and OAuth
  └── Data generator
  └── Tests

Week 5: Integration & Polish
  └── Cross-connector testing
  └── Data generation seeding
  └── Documentation
  └── Performance testing
```

---

## 4. Architecture Decisions

### 4.1 Connector Structure Pattern

All connectors will follow this standardized pattern:

```typescript
// Base class hierarchy
abstract class BaseConnector {
  abstract readonly name: string;
  abstract readonly authType: 'oauth1' | 'oauth2' | 'api_key';
  abstract getRoutes(): Router;
  abstract getOAuthHandler(): IOAuthHandler;
}

abstract class BaseService<T> {
  abstract tableName: string;
  abstract mapFromDb(row: any): T;
  abstract mapToDb(entity: Partial<T>): any;

  async getAll(params: QueryParams): Promise<PaginatedResult<T>>;
  async getById(id: string): Promise<T | null>;
  async create(data: Partial<T>): Promise<T>;
  async update(id: string, data: Partial<T>): Promise<T | null>;
  async delete(id: string): Promise<boolean>;
}
```

### 4.2 Shared vs Connector-Specific Code

| Shared (in `/base/`) | Connector-Specific |
|----------------------|--------------------|
| Database CRUD operations | Entity types/interfaces |
| Pagination logic | API response formatting |
| Error handling | OAuth flow details |
| Token validation | Field mapping |
| Rate limiting | Query language (SOQL, etc.) |
| Logging patterns | Data generation templates |

### 4.3 Database Schema Changes

#### New Tables Per Connector

**Salesforce Tables:**
```sql
-- salesforce_accounts (mimics Account SObject)
CREATE TABLE salesforce_accounts (
  id UUID PRIMARY KEY,
  sf_id VARCHAR(18) UNIQUE NOT NULL,  -- Salesforce 18-char ID
  name VARCHAR(255) NOT NULL,
  industry VARCHAR(100),
  annual_revenue NUMERIC(15, 2),
  number_of_employees INTEGER,
  billing_city VARCHAR(100),
  billing_state VARCHAR(100),
  billing_postal_code VARCHAR(20),
  billing_country VARCHAR(100),
  phone VARCHAR(40),
  website VARCHAR(255),
  type VARCHAR(100),
  owner_id VARCHAR(18),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- salesforce_contacts (mimics Contact SObject)
CREATE TABLE salesforce_contacts (
  id UUID PRIMARY KEY,
  sf_id VARCHAR(18) UNIQUE NOT NULL,
  account_id VARCHAR(18) REFERENCES salesforce_accounts(sf_id),
  first_name VARCHAR(100),
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(40),
  title VARCHAR(128),
  department VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- salesforce_opportunities (mimics Opportunity SObject)
CREATE TABLE salesforce_opportunities (
  id UUID PRIMARY KEY,
  sf_id VARCHAR(18) UNIQUE NOT NULL,
  account_id VARCHAR(18) REFERENCES salesforce_accounts(sf_id),
  name VARCHAR(255) NOT NULL,
  stage_name VARCHAR(100) NOT NULL,
  amount NUMERIC(15, 2),
  close_date DATE,
  probability INTEGER,
  type VARCHAR(100),
  lead_source VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**HubSpot Tables:**
```sql
-- hubspot_contacts
CREATE TABLE hubspot_contacts (
  id UUID PRIMARY KEY,
  hs_id BIGINT UNIQUE NOT NULL,
  email VARCHAR(255),
  firstname VARCHAR(100),
  lastname VARCHAR(100),
  phone VARCHAR(40),
  company VARCHAR(255),
  lifecyclestage VARCHAR(100),
  properties JSONB,  -- Flexible custom properties
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- hubspot_companies
CREATE TABLE hubspot_companies (
  id UUID PRIMARY KEY,
  hs_id BIGINT UNIQUE NOT NULL,
  name VARCHAR(255),
  domain VARCHAR(255),
  industry VARCHAR(100),
  numberofemployees INTEGER,
  annualrevenue NUMERIC(15, 2),
  properties JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- hubspot_deals
CREATE TABLE hubspot_deals (
  id UUID PRIMARY KEY,
  hs_id BIGINT UNIQUE NOT NULL,
  dealname VARCHAR(255) NOT NULL,
  dealstage VARCHAR(100),
  amount NUMERIC(15, 2),
  closedate DATE,
  pipeline VARCHAR(100),
  properties JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**QuickBooks Tables:**
```sql
-- quickbooks_customers
CREATE TABLE quickbooks_customers (
  id UUID PRIMARY KEY,
  qb_id VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  given_name VARCHAR(100),
  family_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(40),
  balance NUMERIC(15, 2) DEFAULT 0,
  billing_address JSONB,
  shipping_address JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- quickbooks_invoices
CREATE TABLE quickbooks_invoices (
  id UUID PRIMARY KEY,
  qb_id VARCHAR(50) UNIQUE NOT NULL,
  doc_number VARCHAR(50),
  customer_id VARCHAR(50) REFERENCES quickbooks_customers(qb_id),
  txn_date DATE NOT NULL,
  due_date DATE,
  total_amt NUMERIC(15, 2),
  balance NUMERIC(15, 2),
  status VARCHAR(50),  -- 'Paid', 'Open', 'Overdue'
  line_items JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- quickbooks_payments
CREATE TABLE quickbooks_payments (
  id UUID PRIMARY KEY,
  qb_id VARCHAR(50) UNIQUE NOT NULL,
  customer_id VARCHAR(50) REFERENCES quickbooks_customers(qb_id),
  txn_date DATE NOT NULL,
  total_amt NUMERIC(15, 2),
  payment_method VARCHAR(100),
  linked_invoices JSONB,  -- Array of invoice references
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.4 OAuth Client Configuration

Each connector will have its own OAuth client configuration stored in the database:

```sql
-- Connector-specific OAuth clients
CREATE TABLE connector_oauth_clients (
  id UUID PRIMARY KEY,
  connector VARCHAR(50) NOT NULL,  -- 'salesforce', 'hubspot', 'quickbooks'
  client_id VARCHAR(255) UNIQUE NOT NULL,
  client_secret TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL,
  scopes TEXT[] NOT NULL,
  token_endpoint_auth_method VARCHAR(50) DEFAULT 'client_secret_post',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data
INSERT INTO connector_oauth_clients (connector, client_id, client_secret, redirect_uris, scopes) VALUES
('salesforce', 'salesforce_mock_client', 'sf_mock_secret_12345',
 ARRAY['http://localhost:3000/oauth/callback/salesforce'],
 ARRAY['api', 'refresh_token', 'offline_access']),
('hubspot', 'hubspot_mock_client', 'hs_mock_secret_67890',
 ARRAY['http://localhost:3000/oauth/callback/hubspot'],
 ARRAY['crm.objects.contacts.read', 'crm.objects.companies.read', 'crm.objects.deals.read']),
('quickbooks', 'quickbooks_mock_client', 'qb_mock_secret_11111',
 ARRAY['http://localhost:3000/oauth/callback/quickbooks'],
 ARRAY['com.intuit.quickbooks.accounting']);
```

---

## 5. Testing Strategy

### 5.1 Test Categories

| Category | Coverage Target | Tools |
|----------|-----------------|-------|
| Unit Tests | 80% | Jest |
| Integration Tests | Key flows | Jest + Supertest |
| E2E Tests | OAuth flows | Playwright (Phase 2+) |

### 5.2 Test Structure Per Connector

```
tests/
├── unit/
│   ├── salesforceService.test.ts    # ~25 tests
│   ├── salesforceGenerator.test.ts  # ~15 tests
│   ├── hubspotService.test.ts       # ~25 tests
│   ├── hubspotGenerator.test.ts     # ~15 tests
│   ├── quickbooksService.test.ts    # ~25 tests
│   └── quickbooksGenerator.test.ts  # ~15 tests
├── integration/
│   ├── salesforceApi.test.ts        # ~30 tests
│   ├── salesforceOAuth.test.ts      # ~15 tests
│   ├── hubspotApi.test.ts           # ~30 tests
│   ├── hubspotOAuth.test.ts         # ~15 tests
│   ├── quickbooksApi.test.ts        # ~30 tests
│   └── quickbooksOAuth.test.ts      # ~15 tests
└── e2e/
    └── (deferred to later)
```

### 5.3 Test Patterns

Each connector's tests will follow the patterns established in Phase 1:

1. **Service Unit Tests**
   - CRUD operations with mocked database
   - Data mapping verification
   - Error handling
   - Pagination and filtering

2. **Integration Tests**
   - Full HTTP request/response cycle
   - Authentication validation
   - Response format verification
   - Error response codes

3. **Generator Tests**
   - Data realism validation
   - Relationship integrity
   - Edge case generation

### 5.4 Estimated Test Count

| Connector | Unit Tests | Integration Tests | Total |
|-----------|------------|-------------------|-------|
| Salesforce | 40 | 45 | 85 |
| HubSpot | 40 | 45 | 85 |
| QuickBooks | 40 | 45 | 85 |
| Base/Shared | 20 | 10 | 30 |
| **Total New** | **140** | **145** | **285** |

Combined with existing 163 tests = **448 total tests**

---

## 6. Complexity Estimates

**Note:** These are relative complexity indicators, not time predictions.

| Component | Complexity | Notes |
|-----------|------------|-------|
| **Base Infrastructure** | Medium | Abstraction layer, refactoring existing code |
| **Salesforce Connector** | High | Complex API structure, SOQL support, many fields |
| **HubSpot Connector** | Medium | Clean API, standard patterns |
| **QuickBooks Connector** | Medium-High | Financial relationships, line items |
| **Data Generation** | Medium | Faker.js integration, relationship handling |
| **Testing** | Medium | Following established patterns |
| **Database Migrations** | Low | Straightforward schema additions |

### Dependency Graph

```
Base Infrastructure
    ↓
┌───┴───┬───────────┐
↓       ↓           ↓
SF      HS          QB
Connector Connector Connector
    ↓       ↓           ↓
    └───┬───┴───────────┘
        ↓
  Cross-connector
    Integration
```

---

## 7. Questions/Decisions Needing Approval

### 7.1 Connector Priority Selection

**Question:** Which 2-3 connectors should we implement in Phase 2?

**Recommendation:** Salesforce + HubSpot + QuickBooks (all 3)

**Alternatives:**
- Option A: Salesforce + HubSpot only (reduced scope)
- Option B: Salesforce + QuickBooks only (CRM + Finance)
- Option C: All 3 as planned

**Trade-offs:**
- Fewer connectors = faster delivery, less complexity
- All 3 = comprehensive demo capability, more enterprise appeal

### 7.2 Data Generation Approach

**Question:** Should we use Faker.js only, or integrate with Gretel.ai/Tonic.ai?

**Recommendation:** Start with Faker.js only

**Rationale:**
- Faster implementation
- No external API dependencies
- Zero cost
- Sufficient for Phase 2 needs
- Can integrate external tools in Phase 3 if needed

**Alternative:** Hybrid approach (add Gretel.ai for text fields)
- Pro: More realistic text content
- Con: External dependency, API costs, complexity

### 7.3 API Response Format

**Question:** Should mock APIs return exact real API format or simplified format?

**Recommendation:** Match real API formats as closely as possible

**Rationale:**
- Primary use case is testing AI agents against realistic APIs
- Closer match = better testing value
- Documented in TECHNICAL_SPEC.md as requirement

**Specifics:**
- Salesforce: `{ attributes: {...}, Id, Name, ... }` format
- HubSpot: `{ results: [...], paging: {...} }` format
- QuickBooks: Query response format with metadata

### 7.4 Refactoring NetSuite

**Question:** Should we refactor existing NetSuite connector to use new base classes?

**Recommendation:** Yes, refactor as part of base infrastructure work

**Rationale:**
- Validates base class design
- Ensures consistency
- Reduces technical debt
- All tests already exist to validate refactoring

### 7.5 Database Table Naming

**Question:** Use `connector_entity` naming (e.g., `salesforce_accounts`) or namespaced schemas?

**Recommendation:** Use `connector_entity` naming with single schema

**Rationale:**
- Simpler queries
- Easier cross-connector operations
- Consistent with Phase 1 approach (`netsuite_customers`)

---

## 8. Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| API format changes in real connectors | Medium | Medium | Version APIs, monitor updates |
| Base class abstraction too rigid | Medium | High | Review with multiple connectors before finalizing |
| Data generation doesn't match real patterns | Medium | Medium | Validate against sample real data |
| OAuth flow differences cause issues | Low | Medium | Test each flow independently |
| Performance degradation with more data | Low | Medium | Use indexes, benchmark early |

---

## 9. Deliverables Checklist

### Phase 2A: Base Infrastructure
- [ ] `BaseConnector` abstract class
- [ ] `BaseService` abstract class
- [ ] `BaseGenerator` class with Faker.js
- [ ] Refactored NetSuite connector
- [ ] All existing tests passing

### Phase 2B: Salesforce Connector
- [ ] Database migration
- [ ] Types and interfaces
- [ ] Service layer (Account, Contact, Opportunity)
- [ ] Routes matching Salesforce API paths
- [ ] OAuth 2.0 handler
- [ ] Data generator
- [ ] Unit tests (40+)
- [ ] Integration tests (45+)

### Phase 2C: HubSpot Connector
- [ ] Database migration
- [ ] Types and interfaces
- [ ] Service layer (Contact, Company, Deal)
- [ ] Routes matching HubSpot API v3
- [ ] OAuth 2.0 handler
- [ ] Data generator
- [ ] Unit tests (40+)
- [ ] Integration tests (45+)

### Phase 2D: QuickBooks Connector
- [ ] Database migration
- [ ] Types and interfaces
- [ ] Service layer (Customer, Invoice, Payment)
- [ ] Routes matching QuickBooks API v3
- [ ] OAuth 2.0 handler
- [ ] Data generator
- [ ] Unit tests (40+)
- [ ] Integration tests (45+)

### Phase 2E: Integration
- [ ] All connectors registered in app.ts
- [ ] Cross-connector OAuth client table populated
- [ ] Data seeding scripts for all connectors
- [ ] Updated API documentation
- [ ] Performance validation

---

## 10. Next Steps (After Approval)

1. Install `@faker-js/faker` dependency
2. Create base infrastructure files
3. Write database migrations
4. Implement connectors in priority order
5. Write tests alongside implementation
6. Validate with integration testing
7. Document API endpoints

---

**STOP HERE - Awaiting approval before implementation begins.**

Please review and confirm:
1. Connector priority selection (Section 7.1)
2. Data generation approach (Section 7.2)
3. API response format strategy (Section 7.3)
4. NetSuite refactoring decision (Section 7.4)
5. Any scope adjustments needed
