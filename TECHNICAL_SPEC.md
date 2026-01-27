# Agentic Sandbox - Technical Specification

**Version:** 1.0
**Last Updated:** 2026-01-27
**Status:** Draft

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Technology Stack](#2-technology-stack)
3. [Connector Priority](#3-connector-priority)
4. [Data Generation Strategy](#4-data-generation-strategy)
5. [Authentication Design](#5-authentication-design)
6. [Database Schema](#6-database-schema)
7. [API Specification](#7-api-specification)
8. [Development Phases](#8-development-phases)
9. [Technical Risks](#9-technical-risks)
10. [Deployment Architecture](#10-deployment-architecture)

---

## 1. System Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Applications                      │
│                    (AI Agents, Test Harnesses)                  │
└───────────────────┬─────────────────────────────────────────────┘
                    │
                    │ HTTPS
                    │
┌───────────────────▼─────────────────────────────────────────────┐
│                       API Gateway Layer                          │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐ │
│  │ Auth Service │ Rate Limiter │   Routing    │   Logging    │ │
│  └──────────────┴──────────────┴──────────────┴──────────────┘ │
└───────────────────┬─────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
┌───────▼─────┐ ┌──▼───────┐ ┌─▼──────────┐
│  Connector  │ │  OAuth   │ │   Admin    │
│   Service   │ │  Service │ │  Service   │
│             │ │          │ │            │
│ - NetSuite  │ │ - Token  │ │ - Config   │
│ - Salesforce│ │   Mgmt   │ │ - Scenario │
│ - HubSpot   │ │ - Flow   │ │ - Analytics│
│ - QuickBooks│ │   Engine │ │            │
└─────┬───────┘ └──┬───────┘ └─┬──────────┘
      │            │            │
      └────────────┼────────────┘
                   │
        ┌──────────▼──────────┐
        │  PostgreSQL with    │
        │  Redis Cache Layer  │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ Synthetic Data Gen  │
        │  (Gretel.ai/Tonic)  │
        └─────────────────────┘
```

### 1.2 Component Breakdown

#### 1.2.1 API Gateway
- **Purpose**: Single entry point for all client requests
- **Responsibilities**:
  - Request routing and load balancing
  - Authentication/authorization enforcement
  - Rate limiting and throttling
  - Request/response transformation
  - Monitoring and logging
- **Technology**: Kong Gateway or AWS API Gateway

#### 1.2.2 Connector Service
- **Purpose**: Mimics real enterprise connector APIs
- **Responsibilities**:
  - Endpoint implementation matching real APIs
  - Data transformation and serialization
  - Schema validation
  - Error simulation (4xx/5xx responses)
  - Network delay simulation (100-2000ms)
- **Architecture Pattern**: Hub-and-spoke with connector plugins

#### 1.2.3 OAuth Service
- **Purpose**: Mock OAuth 2.0 authorization server
- **Responsibilities**:
  - Authorization code flow
  - Token issuance and validation
  - JWKS endpoint for token verification
  - Multi-tenant issuer support
  - Session management
- **Endpoints**:
  - `/authorize` - Authorization endpoint
  - `/token` - Token endpoint
  - `/userinfo` - User information endpoint
  - `/.well-known/openid-configuration` - Discovery endpoint
  - `/jwks` - JSON Web Key Set endpoint

#### 1.2.4 Admin Service
- **Purpose**: Configuration and management interface
- **Responsibilities**:
  - Connector configuration
  - Scenario management (moderate/difficult/edge)
  - Data generation triggers
  - Analytics and usage tracking
  - User management

#### 1.2.5 Data Generation Engine
- **Purpose**: Generate realistic synthetic data
- **Responsibilities**:
  - Industry-specific data generation
  - Schema-aware synthesis
  - Referential integrity maintenance
  - Batch and on-demand generation

### 1.3 Data Flow Diagrams

#### 1.3.1 Authentication Flow

```
┌──────┐                ┌──────────┐              ┌───────────┐
│Client│                │  OAuth   │              │Connector  │
│      │                │ Service  │              │ Service   │
└───┬──┘                └────┬─────┘              └─────┬─────┘
    │                        │                          │
    │ 1. GET /authorize      │                          │
    ├───────────────────────>│                          │
    │                        │                          │
    │ 2. Auth page (mock)    │                          │
    │<───────────────────────┤                          │
    │                        │                          │
    │ 3. Approve & redirect  │                          │
    ├───────────────────────>│                          │
    │                        │                          │
    │ 4. Redirect w/ code    │                          │
    │<───────────────────────┤                          │
    │                        │                          │
    │ 5. POST /token         │                          │
    ├───────────────────────>│                          │
    │                        │                          │
    │ 6. Access token        │                          │
    │<───────────────────────┤                          │
    │                        │                          │
    │ 7. API request w/ token                           │
    ├──────────────────────────────────────────────────>│
    │                        │                          │
    │                        │ 8. Validate token        │
    │                        │<─────────────────────────┤
    │                        │                          │
    │                        │ 9. Token valid           │
    │                        ├─────────────────────────>│
    │                        │                          │
    │ 10. Response with data                            │
    │<──────────────────────────────────────────────────┤
```

#### 1.3.2 Data Generation Flow

```
┌───────┐         ┌───────────┐        ┌────────────┐        ┌──────────┐
│ Admin │         │   Admin   │        │    Data    │        │PostgreSQL│
│  UI   │         │  Service  │        │  Gen Eng   │        │          │
└───┬───┘         └─────┬─────┘        └──────┬─────┘        └────┬─────┘
    │                   │                     │                   │
    │ 1. Create         │                     │                   │
    │    scenario       │                     │                   │
    ├──────────────────>│                     │                   │
    │                   │                     │                   │
    │                   │ 2. Save config      │                   │
    │                   ├─────────────────────────────────────────>│
    │                   │                     │                   │
    │                   │ 3. Trigger gen      │                   │
    │                   ├────────────────────>│                   │
    │                   │                     │                   │
    │                   │                     │ 4. Call Gretel API│
    │                   │                     ├──────────┐        │
    │                   │                     │          │        │
    │                   │                     │<─────────┘        │
    │                   │                     │                   │
    │                   │                     │ 5. Store data     │
    │                   │                     ├──────────────────>│
    │                   │                     │                   │
    │                   │ 6. Generation done  │                   │
    │                   │<────────────────────┤                   │
    │                   │                     │                   │
    │ 7. Success        │                     │                   │
    │<──────────────────┤                     │                   │
```

#### 1.3.3 API Request Flow

```
┌──────┐      ┌────────┐     ┌──────────┐     ┌───────┐     ┌─────────┐
│Client│      │Gateway │     │Connector │     │ Redis │     │Postgres │
└───┬──┘      └────┬───┘     └────┬─────┘     └───┬───┘     └────┬────┘
    │              │              │               │              │
    │ GET /api/    │              │               │              │
    │ salesforce/  │              │               │              │
    │ accounts     │              │               │              │
    ├─────────────>│              │               │              │
    │              │              │               │              │
    │              │ Validate     │               │              │
    │              │ token        │               │              │
    │              ├──────────────┤               │              │
    │              │              │               │              │
    │              │              │ Check cache   │              │
    │              │              ├──────────────>│              │
    │              │              │               │              │
    │              │              │ Cache miss    │              │
    │              │              │<──────────────┤              │
    │              │              │               │              │
    │              │              │ Query data    │              │
    │              │              ├──────────────────────────────>│
    │              │              │               │              │
    │              │              │ Return data   │              │
    │              │              │<──────────────────────────────┤
    │              │              │               │              │
    │              │              │ Store in cache│              │
    │              │              ├──────────────>│              │
    │              │              │               │              │
    │              │ Response     │               │              │
    │              │<─────────────┤               │              │
    │              │              │               │              │
    │ Response     │              │               │              │
    │<─────────────┤              │               │              │
```

---

## 2. Technology Stack

### 2.1 Backend Stack

#### 2.1.1 Primary Framework: **Node.js with TypeScript**

**Justification:**
- **Ecosystem**: Rich npm ecosystem with excellent API development libraries
- **Performance**: V8 engine provides excellent I/O performance for API operations
- **Type Safety**: TypeScript provides compile-time type checking for API contracts
- **Async Handling**: Native async/await for handling multiple concurrent API requests
- **Community**: Large community with extensive OAuth and API integration experience
- **Developer Velocity**: Faster prototyping and iteration cycles

**Alternative Considered:** Python with FastAPI
- **Pros**: Excellent for data science integration, clean async support, auto-generated OpenAPI docs
- **Cons**: Slightly slower for I/O-bound operations, smaller ecosystem for OAuth mocking

#### 2.1.2 API Framework: **Express.js with OpenAPI**

**Justification:**
- **Maturity**: Battle-tested with extensive middleware ecosystem
- **OpenAPI Integration**: Design-first approach using `express-openapi-validator`
- **Flexibility**: Easy to implement custom middleware for connector-specific logic
- **Middleware**: Rich ecosystem for auth, validation, rate limiting

**Key Dependencies:**
```json
{
  "express": "^4.19.0",
  "express-openapi-validator": "^5.1.0",
  "express-rate-limit": "^7.1.0",
  "helmet": "^7.1.0",
  "cors": "^2.8.5",
  "morgan": "^1.10.0"
}
```

#### 2.1.3 OAuth Implementation: **node-oidc-provider**

**Justification:**
- **Compliance**: OpenID Connect certified implementation
- **Flexibility**: Highly configurable for mock scenarios
- **Multi-tenant**: Built-in support for multiple issuers
- **Customizable**: Easy to customize flows for different connector types

**Configuration:**
```typescript
import Provider from 'oidc-provider';

const configuration = {
  clients: [{
    client_id: 'salesforce-mock',
    client_secret: 'mock-secret',
    redirect_uris: ['http://localhost:3000/callback'],
    response_types: ['code'],
    grant_types: ['authorization_code', 'refresh_token'],
  }],
  features: {
    devInteractions: { enabled: false },
    clientCredentials: { enabled: true },
    introspection: { enabled: true },
    revocation: { enabled: true },
  },
};
```

### 2.2 Database

#### 2.2.1 Primary Database: **PostgreSQL 15+**

**Justification:**
- **JSONB Support**: Native JSON storage for flexible connector data schemas
- **Performance**: Excellent query performance with proper indexing
- **Reliability**: ACID compliance for token and session management
- **Extensibility**: Support for custom types and functions
- **Full-Text Search**: Built-in FTS for searching generated data
- **Materialized Views**: For analytics and reporting

**Schema Features:**
- JSONB columns for flexible API response storage
- Partitioning for large dataset management
- Row-level security for multi-tenant isolation
- GIN indexes for JSONB queries

#### 2.2.2 Cache Layer: **Redis 7+**

**Justification:**
- **Speed**: Sub-millisecond latency for token validation
- **TTL Support**: Automatic expiration for token lifecycle management
- **Data Structures**: Rich data types (hashes, sets, sorted sets)
- **Pub/Sub**: Real-time event notifications
- **Persistence**: RDB and AOF for durability

**Use Cases:**
```
- Token storage and validation
- API response caching (5-minute TTL)
- Rate limiting counters
- Session management
- Real-time analytics
```

### 2.3 Frontend Stack

#### 2.3.1 Framework: **React 18 with TypeScript**

**Justification:**
- **Component Reusability**: Build connector cards as reusable components
- **Type Safety**: TypeScript for API contract enforcement
- **Ecosystem**: Rich UI component libraries
- **Developer Experience**: Excellent tooling and debugging

#### 2.3.2 UI Framework: **Tailwind CSS + shadcn/ui**

**Justification:**
- **Rapid Development**: Utility-first CSS for fast prototyping
- **Consistency**: Pre-built components with consistent design
- **Customization**: Easy theming for white-labeling
- **Accessibility**: Built-in a11y best practices

#### 2.3.3 State Management: **TanStack Query (React Query)**

**Justification:**
- **API-Centric**: Built for server state management
- **Caching**: Automatic request deduplication and caching
- **Optimistic Updates**: Better UX for mutations
- **DevTools**: Excellent debugging capabilities

### 2.4 Infrastructure

#### 2.4.1 Containerization: **Docker + Docker Compose**

**Justification:**
- **Consistency**: Same environment across dev, staging, production
- **Isolation**: Each service in its own container
- **Scalability**: Easy horizontal scaling with orchestration
- **Portability**: Works on any cloud provider

**Example docker-compose.yml:**
```yaml
version: '3.8'
services:
  api-gateway:
    image: kong:3.5
    ports:
      - "8000:8000"
      - "8443:8443"

  connector-service:
    build: ./services/connector
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/agentic
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  oauth-service:
    build: ./services/oauth
    ports:
      - "3001:3001"

  postgres:
    image: postgres:15-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
```

#### 2.4.2 Orchestration: **Kubernetes (for production)**

**Justification:**
- **Auto-Scaling**: HPA for traffic spikes
- **Self-Healing**: Automatic pod restarts
- **Rolling Updates**: Zero-downtime deployments
- **Service Mesh**: Istio for advanced traffic management

#### 2.4.3 Cloud Provider: **AWS (Primary), GCP (Alternative)**

**AWS Services:**
- **ECS/EKS**: Container orchestration
- **RDS**: Managed PostgreSQL
- **ElastiCache**: Managed Redis
- **API Gateway**: Edge routing and throttling
- **S3**: Static asset storage
- **CloudFront**: CDN for frontend
- **Secrets Manager**: Credential management
- **CloudWatch**: Monitoring and logging

### 2.5 Development Tools

#### 2.5.1 API Development
- **OpenAPI/Swagger**: API specification and documentation
- **Postman/Insomnia**: API testing
- **Mockoon**: Local API mocking during development

#### 2.5.2 Testing
- **Jest**: Unit and integration testing
- **Supertest**: HTTP assertion library
- **Playwright**: E2E testing
- **k6**: Load testing

#### 2.5.3 Code Quality
- **ESLint**: Linting
- **Prettier**: Code formatting
- **Husky**: Git hooks
- **TypeScript**: Type checking
- **SonarQube**: Code quality analysis

#### 2.5.4 CI/CD
- **GitHub Actions**: Primary CI/CD pipeline
- **ArgoCD**: GitOps deployment (alternative)
- **Terraform**: Infrastructure as Code

---

## 3. Connector Priority

### 3.1 Selection Criteria

Based on market research and use case analysis, connectors are prioritized by:

1. **Market Penetration**: % of enterprise customers using the platform
2. **API Complexity**: Value in having a realistic mock
3. **Auth Complexity**: OAuth flow sophistication
4. **Demo Value**: Impact on AI agent demonstrations
5. **Implementation Effort**: Engineering resources required

### 3.2 Priority Matrix

| Connector | Market Share | Auth Type | API Complexity | Priority Score | Phase |
|-----------|-------------|-----------|----------------|----------------|-------|
| Salesforce | 23% | OAuth 2.0 | High | 95 | 1 |
| HubSpot | 15% | OAuth 2.0 | Medium | 88 | 1 |
| NetSuite | 12% | OAuth 1.0a/TBA | Very High | 85 | 1 |
| QuickBooks | 18% | OAuth 2.0 | Medium | 82 | 1 |
| Stripe | 35% (SMB) | API Key | Medium | 80 | 2 |
| Google Workspace | 60% | OAuth 2.0 | High | 78 | 2 |
| Slack | 65% | OAuth 2.0 | Low | 75 | 2 |
| Microsoft 365 | 58% | OAuth 2.0 + OIDC | High | 74 | 2 |
| Jira | 22% | OAuth 2.0 | Medium | 70 | 3 |
| Zendesk | 18% | OAuth 2.0 | Medium | 68 | 3 |

### 3.3 Phase 1 Connectors (MVP)

#### 3.3.1 Salesforce

**Why First:**
- CRM leader with 23% market share
- Complex OAuth 2.0 with instance URLs
- Rich API with multiple objects (Accounts, Contacts, Opportunities)
- High demo value for sales AI agents

**API Surface:**
```
Authentication:
- OAuth 2.0 with authorization code flow
- Instance-specific URLs (e.g., https://na1.salesforce.com)
- Refresh token support

Core Endpoints:
- GET /services/data/v59.0/sobjects/Account
- GET /services/data/v59.0/sobjects/Account/{id}
- POST /services/data/v59.0/sobjects/Account
- PATCH /services/data/v59.0/sobjects/Account/{id}
- GET /services/data/v59.0/query?q=SELECT+Id,Name+FROM+Account
- GET /services/data/v59.0/sobjects/Opportunity
- GET /services/data/v59.0/sobjects/Contact
```

**Data Models:**
- Account: ~40 fields (Name, Industry, Revenue, etc.)
- Contact: ~35 fields (FirstName, LastName, Email, etc.)
- Opportunity: ~45 fields (Amount, StageName, CloseDate, etc.)
- Lead: ~30 fields
- Case: ~25 fields

#### 3.3.2 HubSpot

**Why Second:**
- Marketing automation leader
- Clean REST API with excellent docs
- OAuth 2.0 with scopes
- High usage in marketing AI agents

**API Surface:**
```
Authentication:
- OAuth 2.0 with granular scopes
- API key fallback

Core Endpoints:
- GET /crm/v3/objects/contacts
- GET /crm/v3/objects/companies
- GET /crm/v3/objects/deals
- POST /crm/v3/objects/contacts
- PATCH /crm/v3/objects/contacts/{id}
- GET /crm/v3/objects/contacts/search
```

**Data Models:**
- Contact: ~50 custom properties
- Company: ~40 custom properties
- Deal: ~35 custom properties
- Ticket: ~30 custom properties

#### 3.3.3 NetSuite (ERP/Financials)

**Why Third:**
- Leading cloud ERP platform
- Complex financial data structures
- OAuth 1.0a (Token-Based Authentication)
- High value for finance AI agents

**API Surface:**
```
Authentication:
- OAuth 1.0a or Token-Based Authentication (TBA)
- Account-specific data center URLs
- Role-based access control

Core Endpoints:
- GET /services/rest/record/v1/customer
- GET /services/rest/record/v1/invoice
- GET /services/rest/record/v1/salesOrder
- POST /services/rest/record/v1/customer
- GET /services/rest/query/v1/suiteql (SQL-like queries)
```

**Data Models:**
- Customer: ~60 fields (Company, Email, Balance, Terms)
- Invoice: ~50 fields (Entity, Total, Status, Date)
- Sales Order: ~55 fields
- Item: ~45 fields
- Transaction: ~40 fields

#### 3.3.4 QuickBooks Online

**Why Fourth:**
- SMB accounting leader
- Financial data with complex relationships
- OAuth 2.0 with refresh tokens
- Essential for finance automation

**API Surface:**
```
Authentication:
- OAuth 2.0 with 100-day refresh tokens
- Company ID required for all requests

Core Endpoints:
- GET /v3/company/{companyId}/query?query=SELECT * FROM Customer
- GET /v3/company/{companyId}/customer/{id}
- POST /v3/company/{companyId}/customer
- GET /v3/company/{companyId}/invoice
- GET /v3/company/{companyId}/payment
```

**Data Models:**
- Customer: ~35 fields
- Invoice: ~40 fields (Line items, taxes, payments)
- Payment: ~25 fields
- Account: ~20 fields
- Item: ~30 fields

### 3.4 Implementation Priority Rationale

**Phase 1 Focus:**
The four selected connectors cover the most critical enterprise use cases:

1. **CRM (Salesforce, HubSpot)**: Customer relationship management is the #1 use case for AI agents
2. **ERP (NetSuite)**: Financial and operational data for complex workflows
3. **Accounting (QuickBooks)**: Financial data for SMB segment

**Coverage:**
- 68% of enterprise software categories
- 3 different OAuth implementations
- Mix of simple and complex APIs
- Diverse data models (CRM, ERP, Financial)

---

## 4. Data Generation Strategy

### 4.1 Platform Comparison

#### 4.1.1 Gretel.ai

**Strengths:**
- **Developer-First**: Rich API and SDK ecosystem
- **Versatile Data Types**: Handles both structured (SQL) and unstructured (text, JSON) data
- **AI-Powered**: Gretel Navigator uses agentic AI for natural language data generation
- **Privacy-Focused**: Strong differential privacy guarantees
- **Open Source**: Free tier available, open-source libraries
- **Flexibility**: Custom model training on specific datasets

**Weaknesses:**
- **Complexity**: Steeper learning curve
- **Setup Time**: Requires model training for best results
- **Cost**: Usage-based pricing can scale

**Pricing:**
- Free tier: 100,000 records/month
- Developer: $99/month (500K records)
- Team: $499/month (2M records)
- Enterprise: Custom pricing

**Best For:**
- Complex, unstructured data generation
- Natural language content (emails, notes, descriptions)
- Custom industry-specific datasets
- High privacy requirements

#### 4.1.2 Tonic.ai

**Strengths:**
- **Database-Aware**: Maintains foreign key relationships across SQL databases
- **Referential Integrity**: Excellent for complex relational schemas
- **Subsetting**: Can create smaller versions of large production databases
- **Test Environment Focus**: Built for staging/QA environments
- **Fast Setup**: Quick configuration with minimal training

**Weaknesses:**
- **Structured Data Focus**: Less suitable for unstructured text
- **Database-Centric**: Primarily designed for SQL databases
- **Cost**: Higher pricing for enterprise features

**Pricing:**
- Free tier: Limited to small datasets
- Team: Starting at $500/month
- Enterprise: Custom pricing

**Best For:**
- SQL database population
- Maintaining complex relationships
- QA/staging environment data
- Enterprise ERP/CRM systems

#### 4.1.3 Custom Approach (Faker.js + Templates)

**Strengths:**
- **Full Control**: Complete customization of data generation logic
- **No External Dependencies**: No third-party API calls
- **Zero Cost**: Open-source libraries
- **Fast**: No network latency
- **Deterministic**: Reproducible with seed values

**Weaknesses:**
- **Development Time**: Requires building custom generators
- **Maintenance**: Must update schemas as APIs change
- **Limited Realism**: May not capture real-world data distributions
- **No AI Insights**: Manual pattern creation

**Technology Stack:**
```typescript
import { faker } from '@faker-js/faker';
import Handlebars from 'handlebars';

// Example generator
function generateSalesforceAccount() {
  return {
    Id: faker.string.uuid(),
    Name: faker.company.name(),
    Industry: faker.helpers.arrayElement([
      'Technology', 'Healthcare', 'Finance', 'Retail'
    ]),
    AnnualRevenue: faker.number.int({ min: 100000, max: 50000000 }),
    NumberOfEmployees: faker.number.int({ min: 10, max: 10000 }),
    BillingStreet: faker.location.streetAddress(),
    BillingCity: faker.location.city(),
    BillingState: faker.location.state(),
    BillingPostalCode: faker.location.zipCode(),
    Phone: faker.phone.number(),
    Website: faker.internet.url(),
    CreatedDate: faker.date.past({ years: 3 }),
  };
}
```

**Cost:**
- Development: 2-3 weeks per connector
- Maintenance: ~5 hours/month per connector
- Infrastructure: $0 (runs in-app)

### 4.2 Recommended Approach: **Hybrid Strategy**

#### 4.2.1 Strategy Overview

Use different tools for different data types:

| Data Type | Tool | Rationale |
|-----------|------|-----------|
| Structured relational data (NetSuite, QuickBooks) | **Tonic.ai** | Maintains foreign key integrity for financial data |
| CRM records with relationships (Salesforce, HubSpot) | **Gretel.ai** | Better for semi-structured data with text fields |
| Simple lookups and enumerations | **Faker.js** | Fast, deterministic, no external dependencies |
| Text content (emails, notes, descriptions) | **Gretel.ai Navigator** | Natural language generation with context |

#### 4.2.2 Implementation Architecture

```typescript
// Data generation orchestration
interface DataGenerator {
  generateDataset(
    connector: string,
    industry: string,
    scenario: string,
    count: number
  ): Promise<Dataset>;
}

class HybridDataGenerator implements DataGenerator {
  private gretelClient: GretelClient;
  private tonicClient: TonicClient;
  private fakerGenerator: FakerGenerator;

  async generateDataset(
    connector: string,
    industry: string,
    scenario: string,
    count: number
  ): Promise<Dataset> {
    switch (connector) {
      case 'salesforce':
        return this.generateSalesforceData(industry, scenario, count);
      case 'netsuite':
        return this.generateNetSuiteData(industry, scenario, count);
      case 'hubspot':
        return this.generateHubSpotData(industry, scenario, count);
      case 'quickbooks':
        return this.generateQuickBooksData(industry, scenario, count);
      default:
        throw new Error(`Unknown connector: ${connector}`);
    }
  }

  private async generateSalesforceData(
    industry: string,
    scenario: string,
    count: number
  ): Promise<SalesforceDataset> {
    // Use Gretel for main records
    const accounts = await this.gretelClient.generate({
      model: 'salesforce-accounts',
      context: { industry, scenario },
      count: count,
    });

    // Use Faker for simple enumerations
    const enrichedAccounts = accounts.map(account => ({
      ...account,
      Type: this.fakerGenerator.pickAccountType(),
      Rating: this.fakerGenerator.pickRating(),
    }));

    // Generate related records
    const contacts = await this.generateContacts(enrichedAccounts);
    const opportunities = await this.generateOpportunities(enrichedAccounts);

    return {
      accounts: enrichedAccounts,
      contacts,
      opportunities,
    };
  }

  private async generateNetSuiteData(
    industry: string,
    scenario: string,
    count: number
  ): Promise<NetSuiteDataset> {
    // Use Tonic for complex financial relationships
    return this.tonicClient.generateFromSchema({
      schema: 'netsuite_financial',
      industry,
      scenario,
      tables: ['customer', 'invoice', 'sales_order', 'transaction'],
      recordCount: count,
      maintainIntegrity: true,
    });
  }
}
```

#### 4.2.3 Cost Analysis (Annual, 1M records/month)

| Approach | Setup Cost | Annual Cost | Total Year 1 |
|----------|------------|-------------|--------------|
| **Gretel Only** | $5,000 | $15,000 | $20,000 |
| **Tonic Only** | $8,000 | $20,000 | $28,000 |
| **Custom Only** | $60,000 | $6,000 | $66,000 |
| **Hybrid (Recommended)** | $15,000 | $12,000 | $27,000 |

**Hybrid Breakdown:**
- Gretel.ai (500K records/month): $5,988/year
- Tonic.ai (Team tier): $6,000/year
- Development (Faker integration): $15,000 one-time
- **Total Year 1: $26,988**
- **Total Year 2+: $11,988/year**

### 4.3 Data Generation Scenarios

#### 4.3.1 Scenario Definitions

**Moderate Scenario:**
- Normal business operations
- Clean, consistent data
- Standard field population (80-90%)
- Realistic distributions
- No data quality issues

**Difficult Scenario:**
- Complex relationships
- Edge cases in business logic
- Partial data (50-70% field population)
- Duplicate records
- Inconsistent formatting
- Cross-object dependencies

**Edge Case Scenario:**
- Extreme values (very large/small numbers)
- Null/empty required fields (if allowed)
- Unicode and special characters
- Very long text fields
- Circular references
- Orphaned records
- Timestamp edge cases (leap years, DST)

#### 4.3.2 Industry-Specific Templates

**Healthcare:**
```json
{
  "industry": "healthcare",
  "entities": {
    "patient": ["name", "dob", "mrn", "insurance"],
    "provider": ["name", "npi", "specialty", "clinic"],
    "appointment": ["date", "patient_id", "provider_id", "status"],
    "claim": ["patient_id", "amount", "icd_codes", "status"]
  },
  "relationships": ["patient->appointment", "appointment->provider"],
  "compliance": ["HIPAA_safe_harbor"]
}
```

**Retail:**
```json
{
  "industry": "retail",
  "entities": {
    "customer": ["name", "email", "loyalty_tier", "lifetime_value"],
    "product": ["sku", "name", "category", "price", "inventory"],
    "order": ["customer_id", "items", "total", "status"],
    "return": ["order_id", "reason", "amount", "status"]
  },
  "relationships": ["customer->order", "order->product"]
}
```

**Financial Services:**
```json
{
  "industry": "financial",
  "entities": {
    "account": ["account_number", "type", "balance", "opened_date"],
    "customer": ["name", "ssn_masked", "risk_score", "kyc_status"],
    "transaction": ["account_id", "amount", "type", "timestamp"],
    "loan": ["customer_id", "amount", "rate", "term", "status"]
  },
  "compliance": ["PCI_DSS", "SOX"],
  "relationships": ["customer->account", "account->transaction"]
}
```

### 4.4 Generation Pipeline

```
┌──────────────┐
│  User Input  │
│  - Connector │
│  - Industry  │
│  - Scenario  │
│  - Count     │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│  Schema Loader   │
│  - Load API spec │
│  - Get templates │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐      ┌──────────────┐
│  Data Generator  │─────>│  Gretel API  │
│  - Route to tool │      └──────────────┘
│  - Apply context │
│  - Batch process │      ┌──────────────┐
│                  │─────>│  Tonic API   │
└──────┬───────────┘      └──────────────┘
       │
       │                  ┌──────────────┐
       └─────────────────>│  Faker.js    │
       │                  └──────────────┘
       ▼
┌──────────────────┐
│  Validator       │
│  - Schema check  │
│  - Relationships │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  Database Store  │
│  - Partition by  │
│    connector     │
│  - Index         │
└──────────────────┘
```

---

## 5. Authentication Design

### 5.1 OAuth 2.0 Implementation

#### 5.1.1 Authorization Server Architecture

```typescript
// OAuth service configuration
import Provider from 'oidc-provider';

const oidcConfig = {
  // Client configurations per connector
  clients: [
    {
      client_id: 'salesforce_mock_client',
      client_secret: 'sf_mock_secret_12345',
      redirect_uris: ['http://localhost:3000/oauth/callback/salesforce'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'api refresh_token offline_access',
      token_endpoint_auth_method: 'client_secret_post',
    },
    {
      client_id: 'hubspot_mock_client',
      client_secret: 'hs_mock_secret_67890',
      redirect_uris: ['http://localhost:3000/oauth/callback/hubspot'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'crm.objects.contacts.read crm.objects.companies.read',
      token_endpoint_auth_method: 'client_secret_basic',
    },
  ],

  // Token configuration
  ttl: {
    AccessToken: 3600,        // 1 hour
    AuthorizationCode: 600,   // 10 minutes
    RefreshToken: 1209600,    // 14 days
    IdToken: 3600,
  },

  // Features
  features: {
    devInteractions: { enabled: false },
    clientCredentials: { enabled: true },
    introspection: { enabled: true },
    revocation: { enabled: true },
    encryption: { enabled: true },
    resourceIndicators: { enabled: true },
  },

  // Custom claims
  claims: {
    openid: ['sub'],
    profile: ['name', 'email', 'picture'],
    email: ['email', 'email_verified'],
  },

  // JWKS configuration
  jwks: {
    keys: [
      // RSA key for signing
      {
        kty: 'RSA',
        kid: 'mock-key-1',
        use: 'sig',
        alg: 'RS256',
        // ... key material
      },
    ],
  },
};

const provider = new Provider('http://localhost:3001', oidcConfig);
```

#### 5.1.2 Connector-Specific OAuth Flows

**Salesforce:**
```typescript
class SalesforceOAuthHandler {
  // Authorization endpoint
  async authorize(req: Request): Promise<AuthorizationResponse> {
    const { client_id, redirect_uri, response_type, scope, state } = req.query;

    // Validate client
    if (client_id !== 'salesforce_mock_client') {
      throw new Error('Invalid client_id');
    }

    // Generate authorization code
    const code = await this.generateAuthCode(client_id, scope);

    // Redirect to client with code
    return {
      redirect_url: `${redirect_uri}?code=${code}&state=${state}`,
      instance_url: 'https://mock-instance.salesforce.com',
    };
  }

  // Token endpoint
  async token(req: Request): Promise<TokenResponse> {
    const { code, grant_type, client_id, client_secret, redirect_uri } = req.body;

    // Validate authorization code
    const authCode = await this.validateAuthCode(code);
    if (!authCode) {
      throw new Error('Invalid authorization code');
    }

    // Generate tokens
    const accessToken = await this.generateAccessToken(authCode);
    const refreshToken = await this.generateRefreshToken(authCode);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 3600,
      instance_url: 'https://mock-instance.salesforce.com',
      id: `https://login.salesforce.com/id/mock_org/mock_user`,
      signature: 'mock_signature',
      issued_at: Date.now().toString(),
    };
  }
}
```

**HubSpot:**
```typescript
class HubSpotOAuthHandler {
  async authorize(req: Request): Promise<AuthorizationResponse> {
    const { client_id, redirect_uri, scope } = req.query;

    // HubSpot uses granular scopes
    const requestedScopes = scope.split(' ');
    const validScopes = this.validateScopes(requestedScopes);

    const code = await this.generateAuthCode(client_id, validScopes);

    return {
      redirect_url: `${redirect_uri}?code=${code}`,
    };
  }

  async token(req: Request): Promise<TokenResponse> {
    const { code, grant_type } = req.body;

    if (grant_type === 'refresh_token') {
      return this.handleRefreshToken(req.body.refresh_token);
    }

    const authCode = await this.validateAuthCode(code);
    const accessToken = await this.generateAccessToken(authCode);
    const refreshToken = await this.generateRefreshToken(authCode);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      expires_in: 21600, // 6 hours
    };
  }
}
```

**NetSuite (OAuth 1.0a / TBA):**
```typescript
class NetSuiteAuthHandler {
  // OAuth 1.0a is more complex with signature generation
  async getRequestToken(req: Request): Promise<RequestTokenResponse> {
    const { oauth_consumer_key, oauth_signature_method, oauth_signature } = req.query;

    // Validate signature
    const isValid = this.validateSignature(req);
    if (!isValid) {
      throw new Error('Invalid OAuth signature');
    }

    // Generate request token
    const requestToken = await this.generateRequestToken();

    return {
      oauth_token: requestToken.token,
      oauth_token_secret: requestToken.secret,
      oauth_callback_confirmed: 'true',
    };
  }

  async authorize(req: Request): Promise<AuthorizationResponse> {
    const { oauth_token } = req.query;

    // User authorization (mock approval)
    const verifier = await this.approveRequestToken(oauth_token);

    return {
      oauth_token: oauth_token,
      oauth_verifier: verifier,
    };
  }

  async getAccessToken(req: Request): Promise<AccessTokenResponse> {
    const { oauth_token, oauth_verifier, oauth_signature } = req.query;

    // Validate request token and verifier
    const isValid = await this.validateRequestTokenAndVerifier(
      oauth_token,
      oauth_verifier
    );

    if (!isValid) {
      throw new Error('Invalid request token or verifier');
    }

    // Generate access token
    const accessToken = await this.generateAccessToken();

    return {
      oauth_token: accessToken.token,
      oauth_token_secret: accessToken.secret,
      account_id: 'mock_account_123',
    };
  }
}
```

**QuickBooks:**
```typescript
class QuickBooksOAuthHandler {
  async authorize(req: Request): Promise<AuthorizationResponse> {
    const { client_id, redirect_uri, scope, state } = req.query;

    // QuickBooks uses OpenID Connect
    const code = await this.generateAuthCode(client_id, scope);

    return {
      redirect_url: `${redirect_uri}?code=${code}&state=${state}&realmId=mock_company_123`,
    };
  }

  async token(req: Request): Promise<TokenResponse> {
    const { code, grant_type } = req.body;

    const authCode = await this.validateAuthCode(code);
    const accessToken = await this.generateAccessToken(authCode);
    const refreshToken = await this.generateRefreshToken(authCode);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      expires_in: 3600,
      x_refresh_token_expires_in: 8726400, // 100 days
    };
  }
}
```

### 5.2 Token Management

#### 5.2.1 Token Storage Schema

```sql
-- OAuth tokens table
CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector VARCHAR(50) NOT NULL,
  token_type VARCHAR(20) NOT NULL, -- 'access', 'refresh', 'authorization_code'
  token_value TEXT NOT NULL UNIQUE,
  client_id VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES users(id),
  scope TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB, -- Connector-specific data (instance_url, realm_id, etc.)

  INDEX idx_token_value (token_value),
  INDEX idx_expires_at (expires_at),
  INDEX idx_connector_client (connector, client_id)
);

-- Token introspection cache (Redis)
-- Key: token:{token_value}
-- Value: JSON
{
  "active": true,
  "scope": "api refresh_token",
  "client_id": "salesforce_mock_client",
  "connector": "salesforce",
  "exp": 1738012345,
  "iat": 1738008745,
  "sub": "mock_user_123"
}
-- TTL: token expiration time
```

#### 5.2.2 Token Validation Middleware

```typescript
import { Request, Response, NextFunction } from 'express';
import { RedisClient } from './redis';
import { TokenRepository } from './repositories/token';

export async function validateToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);

  // Check Redis cache first
  const cached = await RedisClient.get(`token:${token}`);
  if (cached) {
    const tokenData = JSON.parse(cached);

    if (!tokenData.active || tokenData.exp < Date.now() / 1000) {
      return res.status(401).json({ error: 'Token expired' });
    }

    req.tokenData = tokenData;
    return next();
  }

  // Fallback to database
  const tokenRecord = await TokenRepository.findByValue(token);

  if (!tokenRecord) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (tokenRecord.expires_at < new Date()) {
    return res.status(401).json({ error: 'Token expired' });
  }

  // Cache in Redis
  const tokenData = {
    active: true,
    scope: tokenRecord.scope,
    client_id: tokenRecord.client_id,
    connector: tokenRecord.connector,
    exp: Math.floor(tokenRecord.expires_at.getTime() / 1000),
    iat: Math.floor(tokenRecord.created_at.getTime() / 1000),
    sub: tokenRecord.user_id,
  };

  await RedisClient.setex(
    `token:${token}`,
    Math.floor((tokenRecord.expires_at.getTime() - Date.now()) / 1000),
    JSON.stringify(tokenData)
  );

  req.tokenData = tokenData;
  next();
}
```

### 5.3 API Key Authentication (Stripe, etc.)

```typescript
class APIKeyAuthHandler {
  async validateAPIKey(req: Request): Promise<boolean> {
    const apiKey = req.headers['authorization'];

    if (!apiKey || !apiKey.startsWith('Bearer sk_test_')) {
      return false;
    }

    // Check in Redis
    const cached = await RedisClient.get(`apikey:${apiKey}`);
    if (cached) {
      req.apiKeyData = JSON.parse(cached);
      return true;
    }

    // Check in database
    const keyRecord = await APIKeyRepository.findByKey(apiKey);
    if (!keyRecord || !keyRecord.active) {
      return false;
    }

    // Cache for 1 hour
    await RedisClient.setex(
      `apikey:${apiKey}`,
      3600,
      JSON.stringify({
        connector: keyRecord.connector,
        user_id: keyRecord.user_id,
        scope: keyRecord.scope,
      })
    );

    req.apiKeyData = keyRecord;
    return true;
  }
}
```

---

## 6. Database Schema

### 6.1 Core Tables

```sql
-- Users table (for multi-tenancy)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  organization VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Connectors catalog
CREATE TABLE connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL, -- 'salesforce', 'hubspot', etc.
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  auth_type VARCHAR(50) NOT NULL, -- 'oauth2', 'oauth1', 'api_key'
  logo_url TEXT,
  base_url TEXT,
  documentation_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB, -- OpenAPI spec, scopes, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OAuth clients (per connector)
CREATE TABLE oauth_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID REFERENCES connectors(id) ON DELETE CASCADE,
  client_id VARCHAR(255) UNIQUE NOT NULL,
  client_secret TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL,
  grant_types VARCHAR(50)[] NOT NULL,
  scopes TEXT[] NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- OAuth tokens (from section 5.2.1)
CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector VARCHAR(50) NOT NULL,
  token_type VARCHAR(20) NOT NULL,
  token_value TEXT NOT NULL UNIQUE,
  client_id VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX idx_oauth_tokens_value ON oauth_tokens(token_value);
CREATE INDEX idx_oauth_tokens_expires ON oauth_tokens(expires_at);
CREATE INDEX idx_oauth_tokens_connector_client ON oauth_tokens(connector, client_id);
CREATE INDEX idx_oauth_tokens_user ON oauth_tokens(user_id);

-- API keys (for non-OAuth connectors)
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID REFERENCES connectors(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  key_value TEXT UNIQUE NOT NULL,
  key_prefix VARCHAR(20) NOT NULL, -- 'sk_test_', 'pk_live_', etc.
  scope TEXT[],
  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_keys_value ON api_keys(key_value);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);

-- Scenarios (moderate, difficult, edge)
CREATE TABLE scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  connector_id UUID REFERENCES connectors(id) ON DELETE CASCADE,
  scenario_type VARCHAR(50) NOT NULL, -- 'moderate', 'difficult', 'edge'
  industry VARCHAR(100), -- 'healthcare', 'retail', etc.
  business_context VARCHAR(100), -- 'startup', 'smb', 'enterprise'
  configuration JSONB NOT NULL, -- Scenario-specific settings
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scenarios_user ON scenarios(user_id);
CREATE INDEX idx_scenarios_connector ON scenarios(connector_id);
CREATE INDEX idx_scenarios_type ON scenarios(scenario_type);

-- Generated datasets (metadata)
CREATE TABLE datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE,
  connector_id UUID REFERENCES connectors(id) ON DELETE CASCADE,
  generation_method VARCHAR(50) NOT NULL, -- 'gretel', 'tonic', 'faker'
  record_count INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL, -- 'generating', 'complete', 'failed'
  metadata JSONB, -- Generation parameters, statistics
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_datasets_scenario ON datasets(scenario_id);
CREATE INDEX idx_datasets_status ON datasets(status);

-- Connector-specific data tables (partitioned)
-- Example: Salesforce Accounts
CREATE TABLE salesforce_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
  sf_id VARCHAR(18) UNIQUE NOT NULL, -- Salesforce 18-char ID
  name VARCHAR(255),
  industry VARCHAR(100),
  annual_revenue NUMERIC(15, 2),
  number_of_employees INTEGER,
  billing_street VARCHAR(255),
  billing_city VARCHAR(100),
  billing_state VARCHAR(100),
  billing_postal_code VARCHAR(20),
  billing_country VARCHAR(100),
  phone VARCHAR(40),
  website VARCHAR(255),
  type VARCHAR(100),
  owner_id VARCHAR(18),
  created_date TIMESTAMPTZ,
  last_modified_date TIMESTAMPTZ,
  custom_fields JSONB, -- For extensibility
  metadata JSONB
) PARTITION BY LIST (dataset_id);

CREATE INDEX idx_sf_accounts_dataset ON salesforce_accounts(dataset_id);
CREATE INDEX idx_sf_accounts_sf_id ON salesforce_accounts(sf_id);
CREATE INDEX idx_sf_accounts_name ON salesforce_accounts USING GIN(to_tsvector('english', name));

-- Example: Salesforce Contacts
CREATE TABLE salesforce_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
  sf_id VARCHAR(18) UNIQUE NOT NULL,
  account_id VARCHAR(18), -- Foreign key to salesforce_accounts.sf_id
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(40),
  mobile_phone VARCHAR(40),
  title VARCHAR(128),
  department VARCHAR(100),
  mailing_street VARCHAR(255),
  mailing_city VARCHAR(100),
  mailing_state VARCHAR(100),
  mailing_postal_code VARCHAR(20),
  mailing_country VARCHAR(100),
  created_date TIMESTAMPTZ,
  last_modified_date TIMESTAMPTZ,
  custom_fields JSONB,
  metadata JSONB
) PARTITION BY LIST (dataset_id);

CREATE INDEX idx_sf_contacts_dataset ON salesforce_contacts(dataset_id);
CREATE INDEX idx_sf_contacts_account ON salesforce_contacts(account_id);
CREATE INDEX idx_sf_contacts_email ON salesforce_contacts(email);

-- Example: HubSpot Contacts
CREATE TABLE hubspot_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
  hs_id BIGINT UNIQUE NOT NULL,
  email VARCHAR(255),
  firstname VARCHAR(100),
  lastname VARCHAR(100),
  phone VARCHAR(40),
  company VARCHAR(255),
  website VARCHAR(255),
  lifecyclestage VARCHAR(100),
  hs_lead_status VARCHAR(100),
  createdate TIMESTAMPTZ,
  lastmodifieddate TIMESTAMPTZ,
  properties JSONB, -- All custom properties
  metadata JSONB
) PARTITION BY LIST (dataset_id);

CREATE INDEX idx_hs_contacts_dataset ON hubspot_contacts(dataset_id);
CREATE INDEX idx_hs_contacts_email ON hubspot_contacts(email);

-- Analytics and usage tracking
CREATE TABLE api_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  connector VARCHAR(50) NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER,
  request_size_bytes INTEGER,
  response_size_bytes INTEGER,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE api_requests_2026_01 PARTITION OF api_requests
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE api_requests_2026_02 PARTITION OF api_requests
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE INDEX idx_api_requests_user ON api_requests(user_id);
CREATE INDEX idx_api_requests_connector ON api_requests(connector);
CREATE INDEX idx_api_requests_created ON api_requests(created_at);

-- Materialized view for analytics
CREATE MATERIALIZED VIEW api_usage_daily AS
SELECT
  DATE(created_at) AS date,
  connector,
  COUNT(*) AS request_count,
  AVG(response_time_ms) AS avg_response_time,
  COUNT(DISTINCT user_id) AS unique_users,
  SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS error_count
FROM api_requests
GROUP BY DATE(created_at), connector;

CREATE UNIQUE INDEX idx_api_usage_daily_date_connector ON api_usage_daily(date, connector);

-- Refresh schedule (via pg_cron or application)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY api_usage_daily;
```

### 6.2 Indexes Strategy

```sql
-- Performance indexes
CREATE INDEX CONCURRENTLY idx_oauth_tokens_active ON oauth_tokens(expires_at)
  WHERE expires_at > NOW();

CREATE INDEX CONCURRENTLY idx_datasets_active ON datasets(scenario_id, status)
  WHERE status = 'complete';

-- Full-text search indexes
CREATE INDEX CONCURRENTLY idx_sf_accounts_fts ON salesforce_accounts
  USING GIN(to_tsvector('english', name || ' ' || COALESCE(industry, '')));

-- Composite indexes for common queries
CREATE INDEX CONCURRENTLY idx_scenarios_lookup ON scenarios(user_id, connector_id, is_active)
  WHERE is_active = TRUE;

-- GIN indexes for JSONB queries
CREATE INDEX CONCURRENTLY idx_sf_accounts_custom_fields ON salesforce_accounts
  USING GIN(custom_fields);
```

### 6.3 Data Retention Policies

```sql
-- Partitioning strategy for api_requests
-- Keep last 90 days in hot storage
-- Archive older data to cold storage (S3)

-- Function to drop old partitions
CREATE OR REPLACE FUNCTION drop_old_api_request_partitions()
RETURNS void AS $$
DECLARE
  partition_name TEXT;
  cutoff_date DATE := CURRENT_DATE - INTERVAL '90 days';
BEGIN
  FOR partition_name IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE 'api_requests_____'
      AND tablename < 'api_requests_' || TO_CHAR(cutoff_date, 'YYYY_MM')
  LOOP
    EXECUTE 'DROP TABLE IF EXISTS ' || partition_name;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule with pg_cron (or external scheduler)
-- SELECT cron.schedule('drop-old-partitions', '0 2 1 * *', 'SELECT drop_old_api_request_partitions()');
```

---

## 7. API Specification

### 7.1 API Design Principles

- **RESTful**: Standard HTTP methods and status codes
- **Versioned**: `/v1/`, `/v2/` in URL path
- **Consistent**: Uniform error responses and data structures
- **Paginated**: Cursor-based pagination for large datasets
- **Documented**: OpenAPI 3.0 specification
- **Realistic**: Mimic real connector API responses

### 7.2 Core API Endpoints

#### 7.2.1 Admin API

```yaml
# OpenAPI 3.0 specification excerpt

/admin/v1/connectors:
  get:
    summary: List all available connectors
    tags: [Admin]
    responses:
      200:
        description: List of connectors
        content:
          application/json:
            schema:
              type: object
              properties:
                data:
                  type: array
                  items:
                    $ref: '#/components/schemas/Connector'
            example:
              data:
                - id: "123e4567-e89b-12d3-a456-426614174000"
                  name: "salesforce"
                  display_name: "Salesforce"
                  auth_type: "oauth2"
                  is_active: true
                - id: "223e4567-e89b-12d3-a456-426614174001"
                  name: "hubspot"
                  display_name: "HubSpot"
                  auth_type: "oauth2"
                  is_active: true

/admin/v1/scenarios:
  post:
    summary: Create a new data scenario
    tags: [Admin]
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ScenarioCreate'
          example:
            name: "Healthcare Enterprise Demo"
            connector_id: "123e4567-e89b-12d3-a456-426614174000"
            scenario_type: "moderate"
            industry: "healthcare"
            business_context: "enterprise"
            configuration:
              record_count: 1000
              include_contacts: true
              include_opportunities: true
    responses:
      201:
        description: Scenario created
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Scenario'

/admin/v1/scenarios/{scenario_id}/generate:
  post:
    summary: Trigger data generation for a scenario
    tags: [Admin]
    parameters:
      - name: scenario_id
        in: path
        required: true
        schema:
          type: string
          format: uuid
    responses:
      202:
        description: Generation started
        content:
          application/json:
            example:
              dataset_id: "789e4567-e89b-12d3-a456-426614174099"
              status: "generating"
              estimated_completion: "2026-01-27T15:30:00Z"

/admin/v1/datasets/{dataset_id}/status:
  get:
    summary: Check data generation status
    tags: [Admin]
    parameters:
      - name: dataset_id
        in: path
        required: true
        schema:
          type: string
          format: uuid
    responses:
      200:
        description: Generation status
        content:
          application/json:
            example:
              dataset_id: "789e4567-e89b-12d3-a456-426614174099"
              status: "complete"
              record_count: 1000
              completed_at: "2026-01-27T15:28:45Z"
```

#### 7.2.2 OAuth API

```yaml
/oauth/v1/authorize:
  get:
    summary: OAuth authorization endpoint
    tags: [OAuth]
    parameters:
      - name: response_type
        in: query
        required: true
        schema:
          type: string
          enum: [code]
      - name: client_id
        in: query
        required: true
        schema:
          type: string
      - name: redirect_uri
        in: query
        required: true
        schema:
          type: string
          format: uri
      - name: scope
        in: query
        schema:
          type: string
      - name: state
        in: query
        schema:
          type: string
    responses:
      302:
        description: Redirect to authorization page

/oauth/v1/token:
  post:
    summary: OAuth token endpoint
    tags: [OAuth]
    requestBody:
      required: true
      content:
        application/x-www-form-urlencoded:
          schema:
            type: object
            properties:
              grant_type:
                type: string
                enum: [authorization_code, refresh_token]
              code:
                type: string
              redirect_uri:
                type: string
              client_id:
                type: string
              client_secret:
                type: string
              refresh_token:
                type: string
          example:
            grant_type: "authorization_code"
            code: "AUTH_CODE_12345"
            redirect_uri: "http://localhost:3000/callback"
            client_id: "salesforce_mock_client"
            client_secret: "sf_mock_secret_12345"
    responses:
      200:
        description: Access token issued
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TokenResponse'
            example:
              access_token: "00D... mock token ..."
              refresh_token: "5Aep... refresh token ..."
              token_type: "Bearer"
              expires_in: 3600
              instance_url: "https://mock-instance.salesforce.com"

/oauth/v1/introspect:
  post:
    summary: Token introspection endpoint
    tags: [OAuth]
    requestBody:
      required: true
      content:
        application/x-www-form-urlencoded:
          schema:
            type: object
            properties:
              token:
                type: string
    responses:
      200:
        description: Token information
        content:
          application/json:
            example:
              active: true
              scope: "api refresh_token"
              client_id: "salesforce_mock_client"
              exp: 1738012345

/.well-known/openid-configuration:
  get:
    summary: OpenID Connect discovery endpoint
    tags: [OAuth]
    responses:
      200:
        description: OIDC configuration
        content:
          application/json:
            example:
              issuer: "http://localhost:3001"
              authorization_endpoint: "http://localhost:3001/oauth/v1/authorize"
              token_endpoint: "http://localhost:3001/oauth/v1/token"
              jwks_uri: "http://localhost:3001/oauth/v1/jwks"
              response_types_supported: ["code"]
              grant_types_supported: ["authorization_code", "refresh_token"]
```

#### 7.2.3 Salesforce Mock API

```yaml
/api/v1/salesforce/services/data/v59.0/sobjects/Account:
  get:
    summary: Get Salesforce accounts
    tags: [Salesforce]
    security:
      - BearerAuth: []
    parameters:
      - name: limit
        in: query
        schema:
          type: integer
          default: 100
      - name: offset
        in: query
        schema:
          type: integer
          default: 0
    responses:
      200:
        description: List of accounts
        content:
          application/json:
            example:
              size: 2
              totalSize: 100
              done: false
              nextRecordsUrl: "/services/data/v59.0/sobjects/Account?offset=100"
              records:
                - attributes:
                    type: "Account"
                    url: "/services/data/v59.0/sobjects/Account/001xx000003DGYM"
                  Id: "001xx000003DGYM"
                  Name: "Acme Corporation"
                  Industry: "Technology"
                  AnnualRevenue: 5000000
                  NumberOfEmployees: 250
                  BillingCity: "San Francisco"
                  BillingState: "CA"
                  Phone: "(415) 555-1234"
                  Website: "www.acme.com"
                - attributes:
                    type: "Account"
                    url: "/services/data/v59.0/sobjects/Account/001xx000003DGYN"
                  Id: "001xx000003DGYN"
                  Name: "Global Industries"
                  Industry: "Manufacturing"
                  AnnualRevenue: 12000000
                  NumberOfEmployees: 500
                  BillingCity: "Chicago"
                  BillingState: "IL"

/api/v1/salesforce/services/data/v59.0/sobjects/Account/{id}:
  get:
    summary: Get a specific account
    tags: [Salesforce]
    security:
      - BearerAuth: []
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
    responses:
      200:
        description: Account details
      404:
        description: Account not found

  patch:
    summary: Update an account
    tags: [Salesforce]
    security:
      - BearerAuth: []
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
    requestBody:
      required: true
      content:
        application/json:
          example:
            Name: "Acme Corporation (Updated)"
            Phone: "(415) 555-9999"
    responses:
      204:
        description: Account updated

  post:
    summary: Create a new account
    tags: [Salesforce]
    security:
      - BearerAuth: []
    requestBody:
      required: true
      content:
        application/json:
          example:
            Name: "New Company Inc"
            Industry: "Retail"
            Phone: "(650) 555-1234"
    responses:
      201:
        description: Account created
        content:
          application/json:
            example:
              id: "001xx000003DGYP"
              success: true
              errors: []

/api/v1/salesforce/services/data/v59.0/query:
  get:
    summary: SOQL query endpoint
    tags: [Salesforce]
    security:
      - BearerAuth: []
    parameters:
      - name: q
        in: query
        required: true
        schema:
          type: string
        example: "SELECT Id, Name, Industry FROM Account WHERE Industry = 'Technology'"
    responses:
      200:
        description: Query results
        content:
          application/json:
            example:
              totalSize: 15
              done: true
              records:
                - attributes:
                    type: "Account"
                  Id: "001xx000003DGYM"
                  Name: "Acme Corporation"
                  Industry: "Technology"
```

#### 7.2.4 HubSpot Mock API

```yaml
/api/v1/hubspot/crm/v3/objects/contacts:
  get:
    summary: Get HubSpot contacts
    tags: [HubSpot]
    security:
      - BearerAuth: []
    parameters:
      - name: limit
        in: query
        schema:
          type: integer
          default: 100
      - name: after
        in: query
        schema:
          type: string
        description: Cursor for pagination
      - name: properties
        in: query
        schema:
          type: string
        description: Comma-separated list of properties
        example: "firstname,lastname,email,company"
    responses:
      200:
        description: List of contacts
        content:
          application/json:
            example:
              results:
                - id: "1234567"
                  properties:
                    firstname: "John"
                    lastname: "Doe"
                    email: "john.doe@example.com"
                    phone: "(555) 123-4567"
                    company: "Acme Corp"
                    lifecyclestage: "customer"
                    createdate: "2024-01-15T10:30:00Z"
                    lastmodifieddate: "2026-01-20T14:22:00Z"
                  createdAt: "2024-01-15T10:30:00Z"
                  updatedAt: "2026-01-20T14:22:00Z"
                  archived: false
              paging:
                next:
                  after: "eyJvZmZzZXQiOjEwMCwiaWQiOjEyMzQ1Njd9"

  post:
    summary: Create a new contact
    tags: [HubSpot]
    security:
      - BearerAuth: []
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            properties:
              properties:
                type: object
          example:
            properties:
              firstname: "Jane"
              lastname: "Smith"
              email: "jane.smith@example.com"
              phone: "(555) 987-6543"
              company: "Tech Startup Inc"
    responses:
      201:
        description: Contact created
        content:
          application/json:
            example:
              id: "7654321"
              properties:
                firstname: "Jane"
                lastname: "Smith"
                email: "jane.smith@example.com"
              createdAt: "2026-01-27T12:00:00Z"
              updatedAt: "2026-01-27T12:00:00Z"

/api/v1/hubspot/crm/v3/objects/contacts/search:
  post:
    summary: Search contacts
    tags: [HubSpot]
    security:
      - BearerAuth: []
    requestBody:
      required: true
      content:
        application/json:
          example:
            filterGroups:
              - filters:
                  - propertyName: "email"
                    operator: "CONTAINS"
                    value: "@example.com"
            sorts:
              - propertyName: "createdate"
                direction: "DESCENDING"
            limit: 50
    responses:
      200:
        description: Search results
```

### 7.3 Error Responses

```yaml
components:
  schemas:
    ErrorResponse:
      type: object
      properties:
        error:
          type: object
          properties:
            code:
              type: string
              example: "INVALID_TOKEN"
            message:
              type: string
              example: "The access token provided is invalid"
            details:
              type: array
              items:
                type: object
      example:
        error:
          code: "INVALID_TOKEN"
          message: "The access token provided is invalid"
          details: []

# Error codes
# 400 BAD_REQUEST - Invalid request parameters
# 401 UNAUTHORIZED - Missing or invalid authentication
# 403 FORBIDDEN - Insufficient permissions
# 404 NOT_FOUND - Resource not found
# 429 RATE_LIMIT_EXCEEDED - Too many requests
# 500 INTERNAL_ERROR - Server error
# 503 SERVICE_UNAVAILABLE - Service temporarily unavailable
```

### 7.4 Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

// Connector-specific rate limits (mimicking real APIs)
const salesforceLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 15000, // Salesforce daily limit
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'API request limit exceeded',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.tokenData?.client_id || req.ip,
});

const hubspotLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: 100, // HubSpot 10-second limit
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'You have reached your secondly limit',
    },
  },
});

// Apply to routes
app.use('/api/v1/salesforce', salesforceLimiter);
app.use('/api/v1/hubspot', hubspotLimiter);
```

---

## 8. Development Phases

### 8.1 Phase 1: Foundation (Weeks 1-4)

**Goal:** Core infrastructure and OAuth implementation

#### Sprint 1 (Week 1-2): Infrastructure Setup
- [ ] Project scaffolding (TypeScript, Express, PostgreSQL)
- [ ] Docker Compose setup for local development
- [ ] Database schema implementation
- [ ] Basic OAuth service with `node-oidc-provider`
- [ ] API Gateway setup (Kong or Express Gateway)
- [ ] CI/CD pipeline (GitHub Actions)

**Deliverables:**
- Working local development environment
- OAuth endpoints (authorize, token, introspect)
- Database with core tables
- Basic health check endpoints

**Team:** 2 backend engineers, 1 DevOps engineer

#### Sprint 2 (Week 3-4): Admin Service & Data Generation
- [ ] Admin API endpoints (connectors, scenarios)
- [ ] Integration with Gretel.ai SDK
- [ ] Integration with Tonic.ai API
- [ ] Faker.js data generators for simple data
- [ ] Dataset storage and retrieval
- [ ] Basic frontend for admin (React)

**Deliverables:**
- Admin dashboard for creating scenarios
- Data generation pipeline (Gretel + Tonic + Faker)
- First generated dataset (100 records)

**Team:** 2 backend engineers, 1 frontend engineer, 1 data engineer

### 8.2 Phase 2: MVP Connectors (Weeks 5-10)

**Goal:** Implement 4 priority connectors with full API coverage

#### Sprint 3 (Week 5-6): Salesforce Connector
- [ ] Salesforce OAuth flow
- [ ] Account, Contact, Opportunity endpoints
- [ ] SOQL query endpoint
- [ ] Data generation (Gretel + Faker)
- [ ] Unit and integration tests
- [ ] OpenAPI documentation

**Deliverables:**
- Fully functional Salesforce mock API
- 1,000 generated records (Accounts, Contacts, Opportunities)
- Postman collection for testing

**Team:** 2 backend engineers, 1 QA engineer

#### Sprint 4 (Week 7-8): HubSpot & QuickBooks Connectors
- [ ] HubSpot OAuth flow and API endpoints
- [ ] QuickBooks OAuth flow and API endpoints
- [ ] CRM and financial data generation
- [ ] Integration tests
- [ ] API documentation

**Deliverables:**
- HubSpot mock API (Contacts, Companies, Deals)
- QuickBooks mock API (Customers, Invoices, Payments)
- 1,000 records per connector

**Team:** 2 backend engineers, 1 QA engineer

#### Sprint 5 (Week 9-10): NetSuite Connector & Testing
- [ ] NetSuite OAuth 1.0a / TBA authentication
- [ ] ERP endpoints (Customer, Invoice, SalesOrder)
- [ ] SuiteQL query support
- [ ] Complex financial data relationships (Tonic.ai)
- [ ] End-to-end testing
- [ ] Performance testing (k6)

**Deliverables:**
- NetSuite mock API with financial data
- E2E test suite (Playwright)
- Performance benchmarks (1000 req/s)

**Team:** 2 backend engineers, 1 QA engineer, 1 performance engineer

### 8.3 Phase 3: Polish & Scale (Weeks 11-14)

**Goal:** Production readiness and advanced features

#### Sprint 6 (Week 11-12): Advanced Features
- [ ] Scenario templates (healthcare, retail, finance)
- [ ] Data export functionality (CSV, JSON)
- [ ] Webhook simulation
- [ ] Error simulation (4xx/5xx responses)
- [ ] Network delay simulation
- [ ] Analytics dashboard

**Deliverables:**
- 10+ scenario templates
- Analytics dashboard for API usage
- Webhook endpoints

**Team:** 2 backend engineers, 1 frontend engineer, 1 product designer

#### Sprint 7 (Week 13-14): Production Deployment
- [ ] Kubernetes deployment manifests
- [ ] AWS infrastructure (ECS/EKS, RDS, ElastiCache)
- [ ] Monitoring setup (Prometheus, Grafana, CloudWatch)
- [ ] Logging aggregation (ELK stack or CloudWatch Logs)
- [ ] Security hardening (secrets management, TLS)
- [ ] Load testing and optimization
- [ ] Documentation (user guides, API docs)

**Deliverables:**
- Production environment on AWS
- Monitoring dashboards
- Security audit report
- User documentation

**Team:** 2 DevOps engineers, 1 security engineer, 1 technical writer

### 8.4 Phase 4: Growth (Weeks 15-20)

**Goal:** Additional connectors and enterprise features

#### Sprint 8-10 (Week 15-20): Phase 2 Connectors
- [ ] Stripe API mock
- [ ] Google Workspace (Gmail, Calendar, Drive)
- [ ] Slack API mock
- [ ] Microsoft 365 (Outlook, Teams)
- [ ] API versioning support
- [ ] Multi-tenancy improvements
- [ ] White-labeling support

**Deliverables:**
- 4 additional connectors
- Multi-tenant architecture
- White-label configuration

**Team:** 3 backend engineers, 1 frontend engineer

### 8.5 Milestones & Success Criteria

| Milestone | Week | Success Criteria |
|-----------|------|------------------|
| **M1: Infrastructure Ready** | 4 | OAuth working, database deployed, 1 data generation method |
| **M2: MVP Launch** | 10 | 4 connectors live, 10 customers using, <500ms p95 latency |
| **M3: Production Stable** | 14 | 99.9% uptime, monitoring in place, security audit passed |
| **M4: Scale** | 20 | 8 connectors, 50+ customers, 10k req/min capacity |

---

## 9. Technical Risks

### 9.1 Risk Matrix

| Risk | Probability | Impact | Severity | Mitigation |
|------|-------------|--------|----------|------------|
| Synthetic data quality issues | High | High | **Critical** | Use Gretel+Tonic hybrid, manual QA review |
| OAuth implementation bugs | Medium | High | **High** | Use battle-tested libraries, extensive testing |
| API schema drift from real connectors | High | Medium | **High** | Automated schema comparison, version monitoring |
| Performance degradation at scale | Medium | High | **High** | Load testing, caching strategy, query optimization |
| Third-party API downtime (Gretel/Tonic) | Low | Medium | **Medium** | Fallback to Faker, cached datasets |
| Database storage costs | Medium | Medium | **Medium** | Partitioning, archival strategy, compression |
| Security vulnerabilities | Low | High | **High** | Security audits, penetration testing, WAF |
| Incomplete connector coverage | High | Low | **Medium** | Prioritize based on customer demand |

### 9.2 Detailed Risk Analysis

#### 9.2.1 Synthetic Data Quality Issues

**Problem:**
Generated data may not match real-world distributions, leading to unrealistic demos.

**Impact:**
- AI agents fail to handle edge cases
- Demos look fake or unconvincing
- Customer trust eroded

**Mitigation:**
1. **Hybrid Approach**: Use Gretel for complex data, Tonic for relationships, Faker for simple fields
2. **Quality Metrics**:
   ```typescript
   interface DataQualityMetrics {
     completeness: number;        // % of fields populated
     uniqueness: number;          // % of unique values
     consistency: number;         // Cross-field validation pass rate
     distribution: {
       mean: number;
       stddev: number;
       skewness: number;
     };
   }
   ```
3. **Manual Review Process**: QA team validates sample datasets before production use
4. **Customer Feedback Loop**: Allow customers to report data quality issues
5. **Continuous Improvement**: Re-train Gretel models quarterly with new patterns

**Monitoring:**
```typescript
// Data quality checks
async function validateDataQuality(dataset: Dataset): Promise<DataQualityReport> {
  const completeness = await checkCompleteness(dataset);
  const uniqueness = await checkUniqueness(dataset);
  const consistency = await checkConsistency(dataset);

  if (completeness < 0.8 || uniqueness < 0.95 || consistency < 0.9) {
    throw new DataQualityError('Dataset failed quality checks');
  }

  return { completeness, uniqueness, consistency };
}
```

#### 9.2.2 API Schema Drift

**Problem:**
Real connector APIs change over time, causing our mocks to become outdated.

**Impact:**
- Integration tests fail for customers
- AI agents trained on outdated schemas
- Loss of credibility

**Mitigation:**
1. **Automated Schema Monitoring**:
   ```typescript
   // Weekly cron job
   async function checkSchemaChanges(connector: string) {
     const currentSchema = await fetchConnectorSchema(connector);
     const ourSchema = await loadStoredSchema(connector);

     const diff = compareSchemas(currentSchema, ourSchema);

     if (diff.hasChanges) {
       await notifyEngineeringTeam({
         connector,
         changes: diff.changes,
         severity: diff.severity,
       });
     }
   }
   ```
2. **Version Pinning**: Support multiple API versions (e.g., Salesforce v58, v59, v60)
3. **Deprecation Warnings**: Notify customers when using outdated versions
4. **Quarterly Updates**: Scheduled schema review and update cycle

#### 9.2.3 Performance Degradation

**Problem:**
As data volume grows, query performance degrades.

**Impact:**
- Slow API responses (>2s)
- Poor user experience
- Infrastructure cost increases

**Mitigation:**
1. **Caching Strategy**:
   - Redis for hot data (most recent 10% of records)
   - 5-minute TTL on list endpoints
   - Cache warming for popular queries

2. **Database Optimization**:
   - Partitioning by dataset_id
   - Proper indexing strategy
   - Connection pooling (PgBouncer)
   - Read replicas for heavy read operations

3. **Query Optimization**:
   ```typescript
   // Efficient pagination with cursor-based approach
   async function getAccounts(cursor?: string, limit = 100) {
     const query = `
       SELECT * FROM salesforce_accounts
       WHERE (created_at, id) > ($1, $2)
       ORDER BY created_at, id
       LIMIT $3
     `;

     // Parse cursor
     const [lastCreatedAt, lastId] = parseCursor(cursor);

     return db.query(query, [lastCreatedAt, lastId, limit]);
   }
   ```

4. **Load Testing**:
   - k6 scripts for each connector
   - Target: 1000 req/s per connector
   - p95 latency < 500ms

#### 9.2.4 Third-Party API Downtime

**Problem:**
Gretel.ai or Tonic.ai experiences downtime during data generation.

**Impact:**
- Cannot generate new datasets
- Blocked customer demos
- Service unavailability

**Mitigation:**
1. **Multi-Provider Strategy**: Use both Gretel and Tonic, fail over between them
2. **Fallback to Faker**: If both are down, generate simple data with Faker
3. **Pre-Generated Datasets**: Maintain library of common scenarios
4. **Async Generation**: Don't block API requests on data generation
5. **SLA Monitoring**:
   ```typescript
   async function generateWithFallback(config: GenerationConfig) {
     try {
       return await gretelClient.generate(config);
     } catch (error) {
       logger.warn('Gretel failed, trying Tonic', error);
       try {
         return await tonicClient.generate(config);
       } catch (error2) {
         logger.error('Both providers failed, using Faker', error2);
         return await fakerGenerator.generate(config);
       }
     }
   }
   ```

#### 9.2.5 Security Vulnerabilities

**Problem:**
Mock OAuth server or API endpoints have security flaws.

**Impact:**
- Token leakage
- Unauthorized data access
- Reputation damage

**Mitigation:**
1. **Security Best Practices**:
   - HTTPS/TLS everywhere
   - Input validation on all endpoints
   - SQL injection prevention (parameterized queries)
   - XSS prevention (output escaping)
   - CSRF protection
   - Rate limiting

2. **Security Testing**:
   - OWASP ZAP automated scans
   - Quarterly penetration testing
   - Dependency vulnerability scanning (Snyk, Dependabot)

3. **Secrets Management**:
   - AWS Secrets Manager for production
   - No secrets in code or environment variables
   - Rotation policy (90 days)

4. **Monitoring**:
   ```typescript
   // Suspicious activity detection
   app.use((req, res, next) => {
     if (detectSuspiciousActivity(req)) {
       logger.alert('Suspicious activity detected', {
         ip: req.ip,
         endpoint: req.path,
         user: req.user?.id,
       });
       // Rate limit or block
     }
     next();
   });
   ```

---

## 10. Deployment Architecture

### 10.1 Infrastructure Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          AWS Cloud                              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Route 53 (DNS)                        │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │                                     │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │              CloudFront (CDN) + WAF                      │  │
│  └────────────┬───────────────────────────────┬─────────────┘  │
│               │                               │                 │
│  ┌────────────▼────────────┐     ┌───────────▼──────────────┐  │
│  │    S3 (Static Assets)   │     │  ALB (Load Balancer)     │  │
│  │    - Frontend (React)   │     └───────────┬──────────────┘  │
│  └─────────────────────────┘                 │                 │
│                                   ┌───────────┼──────────────┐  │
│                                   │           │              │  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │               EKS Cluster (Kubernetes)                   │  │
│  │                                                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │   API GW     │  │  Connector   │  │    OAuth     │  │  │
│  │  │   (Kong)     │  │   Service    │  │   Service    │  │  │
│  │  │ Replicas: 3  │  │ Replicas: 5  │  │ Replicas: 3  │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  │                                                          │  │
│  │  ┌──────────────┐  ┌──────────────┐                    │  │
│  │  │    Admin     │  │   Worker     │                    │  │
│  │  │   Service    │  │  (Data Gen)  │                    │  │
│  │  │ Replicas: 2  │  │ Replicas: 3  │                    │  │
│  │  └──────────────┘  └──────────────┘                    │  │
│  └─────────────────────────────────────────────────────────┘  │
│                           │                                     │
│  ┌────────────────────────┼─────────────────────────────────┐  │
│  │                        │   Data Layer                    │  │
│  │  ┌─────────────────────▼──────┐  ┌────────────────────┐ │  │
│  │  │  RDS PostgreSQL (Primary)  │  │  ElastiCache Redis │ │  │
│  │  │  - db.r6g.xlarge           │  │  - cache.r6g.large │ │  │
│  │  │  - Multi-AZ                │  │  - Cluster mode    │ │  │
│  │  └──────────────┬─────────────┘  └────────────────────┘ │  │
│  │                 │                                        │  │
│  │  ┌──────────────▼─────────────┐                         │  │
│  │  │  RDS Read Replica          │                         │  │
│  │  │  - db.r6g.large            │                         │  │
│  │  └────────────────────────────┘                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                 Observability                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │  CloudWatch  │  │  Prometheus  │  │   Grafana    │  │  │
│  │  │  Logs/Metrics│  │  Monitoring  │  │  Dashboards  │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    Secrets Manager                       │  │
│  │  - OAuth client secrets                                  │  │
│  │  - Database credentials                                  │  │
│  │  - API keys (Gretel, Tonic)                             │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

           External APIs
┌────────────────────────────────┐
│      Gretel.ai API             │
└────────────────────────────────┘
┌────────────────────────────────┐
│      Tonic.ai API              │
└────────────────────────────────┘
```

### 10.2 AWS Services Breakdown

#### 10.2.1 Compute

**Amazon EKS (Elastic Kubernetes Service)**
- **Node Groups**:
  - Application nodes: 5x m6i.xlarge (4 vCPU, 16 GB RAM)
  - Worker nodes: 3x c6i.2xlarge (8 vCPU, 16 GB RAM) for data generation
- **Auto Scaling**:
  - Target CPU: 70%
  - Min nodes: 3
  - Max nodes: 20
- **Networking**: VPC with private subnets, NAT Gateway

**Alternative: ECS Fargate**
- Serverless container execution
- Lower operational overhead
- Higher per-request cost

#### 10.2.2 Database

**Amazon RDS for PostgreSQL**
- **Instance**: db.r6g.xlarge (4 vCPU, 32 GB RAM)
- **Storage**: 500 GB gp3 SSD (initial), auto-scaling to 2 TB
- **Multi-AZ**: High availability with synchronous replication
- **Read Replica**: db.r6g.large for read-heavy workloads
- **Backups**: Daily automated backups, 7-day retention
- **Encryption**: At-rest (KMS) and in-transit (TLS)

**Cost Optimization**:
- Reserved Instances (1-year) for 40% savings
- Automated snapshots to S3 Glacier after 30 days

#### 10.2.3 Cache

**Amazon ElastiCache for Redis**
- **Cluster**: cache.r6g.large (2 nodes, cluster mode enabled)
- **Replication**: 1 primary, 1 replica per shard
- **Shards**: 2 shards initially, scale to 10
- **Persistence**: AOF enabled with snapshot backup
- **Encryption**: At-rest and in-transit

#### 10.2.4 Storage

**Amazon S3**
- **Buckets**:
  - `agentic-sandbox-frontend`: React static assets
  - `agentic-sandbox-datasets`: Generated dataset backups
  - `agentic-sandbox-logs`: Long-term log archival
- **Lifecycle Policies**:
  - Frontend: CloudFront cache invalidation on deploy
  - Datasets: Transition to S3 Glacier after 90 days
  - Logs: Delete after 1 year

**CloudFront**
- **Distribution**: Global edge locations
- **Cache Behavior**: Cache static assets (TTL: 1 hour)
- **Origin**: S3 and ALB (API Gateway)

#### 10.2.5 Networking

**VPC Configuration**
```
VPC: 10.0.0.0/16
├── Public Subnets (2 AZs)
│   ├── 10.0.1.0/24 (us-west-2a) - ALB, NAT Gateway
│   └── 10.0.2.0/24 (us-west-2b) - ALB, NAT Gateway
├── Private Subnets (2 AZs)
│   ├── 10.0.10.0/24 (us-west-2a) - EKS nodes
│   ├── 10.0.11.0/24 (us-west-2b) - EKS nodes
│   ├── 10.0.20.0/24 (us-west-2a) - RDS primary
│   └── 10.0.21.0/24 (us-west-2b) - RDS replica
└── Isolated Subnets
    ├── 10.0.30.0/24 (us-west-2a) - ElastiCache
    └── 10.0.31.0/24 (us-west-2b) - ElastiCache
```

**Security Groups**
- ALB SG: Allow 80/443 from internet
- EKS SG: Allow traffic from ALB SG
- RDS SG: Allow 5432 from EKS SG
- Redis SG: Allow 6379 from EKS SG

### 10.3 Kubernetes Configuration

#### 10.3.1 Deployment Manifests

```yaml
# connector-service deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: connector-service
  namespace: agentic-sandbox
spec:
  replicas: 5
  selector:
    matchLabels:
      app: connector-service
  template:
    metadata:
      labels:
        app: connector-service
    spec:
      containers:
      - name: connector-service
        image: 123456789.dkr.ecr.us-west-2.amazonaws.com/connector-service:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: connector-service
  namespace: agentic-sandbox
spec:
  selector:
    app: connector-service
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: connector-service-hpa
  namespace: agentic-sandbox
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: connector-service
  minReplicas: 5
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

#### 10.3.2 Ingress Configuration

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: agentic-sandbox-ingress
  namespace: agentic-sandbox
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-west-2:123456789:certificate/xxx
    alb.ingress.kubernetes.io/ssl-policy: ELBSecurityPolicy-TLS-1-2-2017-01
spec:
  rules:
  - host: api.agentic-sandbox.com
    http:
      paths:
      - path: /oauth
        pathType: Prefix
        backend:
          service:
            name: oauth-service
            port:
              number: 80
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: connector-service
            port:
              number: 80
      - path: /admin
        pathType: Prefix
        backend:
          service:
            name: admin-service
            port:
              number: 80
```

### 10.4 CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run test:integration

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-west-2
      - uses: aws-actions/amazon-ecr-login@v1
      - name: Build and push Docker image
        run: |
          docker build -t connector-service .
          docker tag connector-service:latest 123456789.dkr.ecr.us-west-2.amazonaws.com/connector-service:${{ github.sha }}
          docker push 123456789.dkr.ecr.us-west-2.amazonaws.com/connector-service:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-west-2
      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name agentic-sandbox-cluster --region us-west-2
      - name: Deploy to Kubernetes
        run: |
          kubectl set image deployment/connector-service \
            connector-service=123456789.dkr.ecr.us-west-2.amazonaws.com/connector-service:${{ github.sha }} \
            -n agentic-sandbox
          kubectl rollout status deployment/connector-service -n agentic-sandbox
```

### 10.5 Monitoring & Observability

#### 10.5.1 Prometheus Configuration

```yaml
# prometheus-config.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
        target_label: __address__

  - job_name: 'connector-service'
    static_configs:
      - targets: ['connector-service:3000']
```

#### 10.5.2 Grafana Dashboards

**Key Metrics:**
- Request rate (req/s) by connector
- p50, p95, p99 latency
- Error rate (4xx, 5xx)
- CPU and memory usage
- Database connection pool utilization
- Redis cache hit ratio
- Token generation rate
- Active OAuth sessions

**Alerts:**
```yaml
# prometheus-alerts.yml
groups:
  - name: agentic-sandbox
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} req/s"

      - alert: HighLatency
        expr: histogram_quantile(0.95, http_request_duration_seconds_bucket) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High API latency"
          description: "p95 latency is {{ $value }}s"

      - alert: DatabaseConnectionPoolExhausted
        expr: pg_stat_database_numbackends / pg_settings_max_connections > 0.9
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Database connection pool near capacity"
```

### 10.6 Cost Estimation

#### 10.6.1 Monthly AWS Costs (Production)

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| **EKS Cluster** | Control plane | $73 |
| **EC2 Instances** | 8x m6i.xlarge (on-demand) | $1,382 |
| **RDS PostgreSQL** | db.r6g.xlarge (1-yr RI) | $465 |
| **RDS Read Replica** | db.r6g.large (1-yr RI) | $232 |
| **ElastiCache Redis** | 2x cache.r6g.large | $328 |
| **ALB** | 1 load balancer, 100 GB/month | $25 |
| **S3** | 100 GB storage, 500 GB transfer | $35 |
| **CloudFront** | 1 TB data transfer | $85 |
| **NAT Gateway** | 2 AZs, 500 GB processed | $90 |
| **Route 53** | Hosted zone + queries | $10 |
| **Secrets Manager** | 10 secrets | $4 |
| **CloudWatch** | Logs + metrics | $50 |
| **Data Transfer** | Inter-AZ, outbound | $100 |
| **Total (Infrastructure)** | | **$2,879** |
| | | |
| **Gretel.ai** | Developer tier (500K records) | $99 |
| **Tonic.ai** | Team tier | $500 |
| **Total (Third-Party)** | | **$599** |
| | | |
| **Grand Total** | | **$3,478/month** |

**Annual Cost:** ~$41,736

**Cost Optimization:**
- Use Spot Instances for worker nodes: -60% ($830/month)
- Reserved Instances (3-year): Additional -40% savings
- Estimated optimized cost: **~$2,500/month** ($30,000/year)

#### 10.6.2 Scaling Projections

| Usage Tier | Requests/Day | Infrastructure Cost | Total Monthly Cost |
|------------|--------------|---------------------|-------------------|
| **Launch** (10 customers) | 100K | $2,500 | $3,100 |
| **Growth** (50 customers) | 500K | $4,200 | $4,800 |
| **Scale** (200 customers) | 2M | $8,500 | $9,100 |

### 10.7 Disaster Recovery

#### 10.7.1 Backup Strategy

**Database Backups:**
- Automated daily snapshots (7-day retention)
- Manual snapshots before major deployments
- Point-in-time recovery (PITR) up to 35 days
- Cross-region backup replication

**Redis Backups:**
- Daily AOF snapshots to S3
- Automatic failover to replica

**Application Backups:**
- Docker images in ECR (immutable tags)
- Kubernetes manifests in Git (GitOps)

#### 10.7.2 Recovery Procedures

**RTO (Recovery Time Objective):** 1 hour
**RPO (Recovery Point Objective):** 5 minutes

**Failure Scenarios:**

1. **Single AZ Failure**:
   - Impact: No downtime (Multi-AZ RDS, cross-AZ pods)
   - Action: None required (automatic)

2. **Database Failure**:
   - Impact: 2-5 minutes downtime
   - Action: Automatic failover to standby
   - Recovery: Investigate root cause

3. **Region Failure**:
   - Impact: 30-60 minutes downtime
   - Action: Restore from cross-region backup in secondary region
   - Recovery: DNS failover, traffic rerouting

4. **Data Corruption**:
   - Impact: Varies (isolated to affected datasets)
   - Action: Restore from snapshot or regenerate data
   - Recovery: Identify corruption source, prevent recurrence

---

## Appendix A: Technology Stack Summary

| Layer | Technology | Version | Justification |
|-------|-----------|---------|---------------|
| **Backend** | Node.js | 20 LTS | Performance, ecosystem |
| | TypeScript | 5.3+ | Type safety |
| | Express.js | 4.19+ | Maturity, middleware |
| **Database** | PostgreSQL | 15+ | JSONB, performance |
| | Redis | 7+ | Caching, sessions |
| **Auth** | node-oidc-provider | 8.x | OAuth 2.0 compliance |
| **Frontend** | React | 18+ | Component model |
| | TypeScript | 5.3+ | Type safety |
| | Tailwind CSS | 3.4+ | Rapid development |
| **Data Gen** | Gretel.ai | API | Versatile data types |
| | Tonic.ai | API | Relational integrity |
| | Faker.js | 8.x | Simple data |
| **Infrastructure** | Docker | 24+ | Containerization |
| | Kubernetes | 1.28+ | Orchestration |
| | AWS | - | Cloud provider |
| **Monitoring** | Prometheus | 2.48+ | Metrics |
| | Grafana | 10.2+ | Dashboards |
| | CloudWatch | - | AWS-native logging |

---

## Appendix B: API Response Examples

### Salesforce Account Response
```json
{
  "attributes": {
    "type": "Account",
    "url": "/services/data/v59.0/sobjects/Account/001xx000003DGYM"
  },
  "Id": "001xx000003DGYM",
  "IsDeleted": false,
  "MasterRecordId": null,
  "Name": "Acme Corporation",
  "Type": "Customer - Direct",
  "ParentId": null,
  "BillingStreet": "1234 Market St",
  "BillingCity": "San Francisco",
  "BillingState": "CA",
  "BillingPostalCode": "94103",
  "BillingCountry": "United States",
  "ShippingStreet": "1234 Market St",
  "ShippingCity": "San Francisco",
  "ShippingState": "CA",
  "ShippingPostalCode": "94103",
  "ShippingCountry": "United States",
  "Phone": "(415) 555-1234",
  "Fax": null,
  "Website": "www.acme.com",
  "Industry": "Technology",
  "AnnualRevenue": 5000000.00,
  "NumberOfEmployees": 250,
  "Description": "Leading provider of enterprise software solutions",
  "OwnerId": "005xx000001X8Uz",
  "CreatedDate": "2024-01-15T08:30:00.000+0000",
  "CreatedById": "005xx000001X8Uz",
  "LastModifiedDate": "2026-01-20T14:22:00.000+0000",
  "LastModifiedById": "005xx000001X8Uz",
  "SystemModstamp": "2026-01-20T14:22:00.000+0000"
}
```

---

## Sources & References

This technical specification was informed by industry best practices and current research:

**Mock API & Synthetic Data:**
- [The Top API Mocking Frameworks of 2025 | Zuplo](https://zuplo.com/learning-center/top-api-mocking-frameworks)
- [Mock API Server Online Guide | Stoplight](https://stoplight.io/mock-api-guide)
- [Rest API Synthetic Data Generation Guide | Hoop.dev](https://hoop.dev/blog/rest-api-synthetic-data-generation-a-guide-for-developers/)
- [Best synthetic data generation tools for 2026 | K2View](https://www.k2view.com/blog/best-synthetic-data-generation-tools/)

**Data Generation Platforms:**
- [Gretel.ai vs Tonic.ai Comparison 2025 | PeerSpot](https://www.peerspot.com/products/comparisons/gretel-ai_vs_tonic-ai)
- [Top 10 Gretel.ai Alternatives & Competitors | G2](https://www.g2.com/products/gretel-ai/competitors/alternatives)

**OAuth Implementation:**
- [navikt/mock-oauth2-server | GitHub](https://github.com/navikt/mock-oauth2-server)
- [oauth2-mock-server | GitHub](https://github.com/axa-group/oauth2-mock-server)
- [Test OAuth 2.0 with Mock Server | Beeceptor](https://beeceptor.com/docs/tutorials/oauth-2-0-mock-usage/)

**Enterprise Integration:**
- [The Ultimate Guide to API Integration Solutions in 2026 | Integrate.io](https://www.integrate.io/blog/ultimate-guide-to-api-integration-solutions/)
- [Enterprise Integration Patterns](https://www.enterpriseintegrationpatterns.com/)
- [Enterprise Integration Architecture Patterns | Medium](https://medium.com/analysts-corner/enterprise-integration-architecture-patterns-ab26b62c1c3a)

---

**End of Technical Specification**

*This document should be reviewed and updated quarterly as the project evolves.*
