# Building Block System - Agentic Architecture

> **Version**: 1.0
> **Created**: 2025-01-28
> **Status**: Architecture Design

---

## 1. Executive Summary

### What is the Building Block System?

The Building Block System is a **generic framework** that transforms API specifications into fully functional mock servers automatically. Instead of building each connector (NetSuite, Salesforce, HubSpot) from scratch, developers provide an API specification and the system generates:

- Database schemas and migrations
- Express.js routes with CRUD operations
- Synthetic data respecting relationships
- TypeScript interfaces and validators

### Why an Agentic Approach?

Traditional code generators produce static output requiring manual refinement. The Building Block System uses **AI agents orchestrated as Claude Code skills** to:

1. **Infer Intent**: Parse API documentation (even unstructured) using LLM-based schema inference
2. **Make Intelligent Decisions**: Choose appropriate data types, detect relationships, optimize indexes
3. **Adapt Dynamically**: Handle edge cases, validate outputs, self-correct errors
4. **Maintain Quality**: Run validation checks and generate comprehensive test data

### Key Benefits

| Benefit | Traditional Generator | Agentic Approach |
|---------|----------------------|------------------|
| Input flexibility | OpenAPI spec required | URL, docs, samples, or OpenAPI |
| Schema inference | Pattern matching only | LLM-powered semantic understanding |
| Relationship detection | Explicit `$ref` only | Infers from naming + context |
| Data realism | Random values | Business-contextual synthetic data |
| Error handling | Fails on edge cases | Self-corrects and adapts |
| Cost per connector | 2-3 weeks | 2-3 days |

---

## 2. Agentic Flow Diagram

```
                         BUILDING BLOCK SYSTEM - AGENTIC WORKFLOW
                         =========================================

    ┌─────────────────────────────────────────────────────────────────────────┐
    │                           USER INPUT                                     │
    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
    │  │ OpenAPI Spec │  │ API Docs URL │  │ JSON Samples │  │ Manual Def  │  │
    │  │   (YAML/JSON)│  │  (any docs)  │  │  (responses) │  │ (TypeScript)│  │
    │  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘  │
    └────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                     SKILL: /sc:infer-schema                             │
    │  ┌────────────────────────────────────────────────────────────────────┐ │
    │  │  • Parse input format (OpenAPI, URL, JSON samples)                 │ │
    │  │  • Extract entities, fields, types using LLM (Claude Haiku)        │ │
    │  │  • Detect relationships (FK patterns, $ref, semantic analysis)     │ │
    │  │  • Generate unified ConnectorSchema JSON                           │ │
    │  └────────────────────────────────────────────────────────────────────┘ │
    │  Tools: swagger-parser, quicktype, Claude Haiku API, WebFetch          │
    └────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼ ConnectorSchema JSON
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                   SKILL: /sc:generate-migration                         │
    │  ┌────────────────────────────────────────────────────────────────────┐ │
    │  │  • Map TypeScript types → PostgreSQL types                         │ │
    │  │  • Generate CREATE TABLE statements                                │ │
    │  │  • Add foreign key constraints                                     │ │
    │  │  • Create indexes based on query patterns                          │ │
    │  │  • Add triggers (updated_at, audit)                                │ │
    │  └────────────────────────────────────────────────────────────────────┘ │
    │  Tools: Knex.js templates, Custom SQL generator, Sequential MCP        │
    └────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼ SQL Migration File
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                    SKILL: /sc:generate-routes                           │
    │  ┌────────────────────────────────────────────────────────────────────┐ │
    │  │  • Generate Express router for each entity                         │ │
    │  │  • Implement CRUD handlers (list, get, create, update, delete)     │ │
    │  │  • Add pagination, filtering, search                               │ │
    │  │  • Create response transformers (match real API format)            │ │
    │  │  • Register routes in app.ts                                       │ │
    │  └────────────────────────────────────────────────────────────────────┘ │
    │  Tools: Express templates, Zod validators, Custom route generator      │
    └────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼ Express Routes + Service
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                    SKILL: /sc:generate-data                             │
    │  ┌────────────────────────────────────────────────────────────────────┐ │
    │  │  • Topological sort entities by dependencies                       │ │
    │  │  • Generate base data with Faker.js                                │ │
    │  │  • Handle relational integrity with SDV (Python bridge)            │ │
    │  │  • Enhance with LLM for business-specific content                  │ │
    │  │  • Seed database in correct dependency order                       │ │
    │  └────────────────────────────────────────────────────────────────────┘ │
    │  Tools: Faker.js, SDV (Python), Tonic Fabricate, Claude Haiku          │
    └────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼ Seeded Database
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                       VALIDATION PHASE                                   │
    │  ┌────────────────────────────────────────────────────────────────────┐ │
    │  │  • Test all generated endpoints (supertest)                        │ │
    │  │  • Verify data constraints and FK integrity                        │ │
    │  │  • Check response format matches expected schema                   │ │
    │  │  • Run health checks                                               │ │
    │  │  • Report success/failures with remediation suggestions            │ │
    │  └────────────────────────────────────────────────────────────────────┘ │
    │  Tools: Jest, supertest, health endpoints                              │
    └────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                        READY TO USE                                      │
    │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
    │  │ Mock API Server │  │ Synthetic Data  │  │ Integration Tests       │  │
    │  │ (Express.js)    │  │ (PostgreSQL)    │  │ (Jest + supertest)      │  │
    │  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────────────┘
```

### Orchestration Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          CLI ORCHESTRATOR                                   │
│                  scripts/generate-connector.ts                              │
│                                                                             │
│   npx ts-node scripts/generate-connector.ts \                              │
│       --schema schemas/netsuite.json \                                     │
│       --volume '{"customers":100,"invoices":500}'                          │
│                                                                             │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  PARALLEL EXEC  │    │  PARALLEL EXEC  │    │  PARALLEL EXEC  │
│                 │    │                 │    │                 │
│  Schema Infer   │    │  Type Extract   │    │  Zod Generate   │
│  (Agent 1)      │    │  (Agent 2)      │    │  (Agent 3)      │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                                 ▼
                     ┌─────────────────────┐
                     │   SEQUENTIAL EXEC   │
                     │                     │
                     │  Migration Generate │
                     │  (Agent 4)          │
                     │       │             │
                     │       ▼             │
                     │  Apply Migration    │
                     │       │             │
                     │       ▼             │
                     │  Route Generate     │
                     │  (Agent 5)          │
                     │       │             │
                     │       ▼             │
                     │  Data Generate      │
                     │  (Agent 6)          │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │   VALIDATION EXEC   │
                     │                     │
                     │  Test Endpoints     │
                     │  Verify Integrity   │
                     │  Health Checks      │
                     └─────────────────────┘
```

---

## 3. Skills Overview Table

| Skill | Trigger | Input | Output | Tools Used |
|-------|---------|-------|--------|------------|
| `/sc:infer-schema` | New connector request, API URL provided | OpenAPI spec, API docs URL, JSON samples, TypeScript interfaces | `ConnectorSchema` JSON (unified schema) | `swagger-parser`, `quicktype`, Claude Haiku API, `WebFetch` |
| `/sc:generate-migration` | Schema inference complete | `ConnectorSchema` JSON | SQL migration file (`migrations/auto_{connector}_schema.sql`) | Knex.js templates, custom SQL generator, Sequential MCP |
| `/sc:generate-routes` | Migration applied | `ConnectorSchema` JSON | Express router files, service files | Express templates, Zod validators, custom route generator |
| `/sc:generate-data` | Routes generated | `ConnectorSchema` JSON, volume config | Seeded database, seed script | Faker.js, SDV (Python), Tonic Fabricate API, Claude Haiku |
| `/sc:validate-connector` | Generation complete | Connector name | Test report, health check results | Jest, supertest, health endpoints |

### Skill Dependency Graph

```
/sc:infer-schema
       │
       ▼
/sc:generate-migration ────────┐
       │                       │
       ▼                       │ (depends on schema)
/sc:generate-routes ───────────┤
       │                       │
       ▼                       │
/sc:generate-data ─────────────┘
       │
       ▼
/sc:validate-connector
```

---

## 4. Data Generation Strategy

### Tool Selection Matrix

| Data Type | Primary Tool | When to Use | Cost |
|-----------|-------------|-------------|------|
| **Simple fields** (email, phone, address) | Faker.js | Always - fast, deterministic | Free |
| **Relational data** (invoices → customers) | SDV | Multi-table with FK constraints | Free |
| **Enterprise scale** (1M+ records) | Tonic Fabricate | Large volume, production-grade | API Key |
| **Business context** (company names, memos) | Claude Haiku | Realistic industry-specific text | $0.25/1M tokens |

### Decision Flow for Data Generation

```
                        ┌─────────────────────────────────┐
                        │   FIELD TYPE ANALYSIS           │
                        └───────────────┬─────────────────┘
                                        │
            ┌───────────────────────────┼───────────────────────────┐
            │                           │                           │
            ▼                           ▼                           ▼
    ┌───────────────┐          ┌───────────────┐          ┌───────────────┐
    │ Standard Field│          │ Relational    │          │ Business Text │
    │ (email, date) │          │ (FK, numeric) │          │ (name, memo)  │
    └───────┬───────┘          └───────┬───────┘          └───────┬───────┘
            │                           │                           │
            ▼                           ▼                           ▼
    ┌───────────────┐          ┌───────────────┐          ┌───────────────┐
    │   FAKER.JS    │          │     SDV       │          │ CLAUDE HAIKU  │
    │               │          │   (Python)    │          │               │
    │ • Emails      │          │ • FK integrity│          │ • Company names│
    │ • Phones      │          │ • Distributions│         │ • Descriptions │
    │ • Addresses   │          │ • Correlations│          │ • Memo fields  │
    │ • Dates       │          │               │          │ • Industry terms│
    │ • UUIDs       │          │               │          │               │
    └───────┬───────┘          └───────┬───────┘          └───────┬───────┘
            │                           │                           │
            └───────────────────────────┼───────────────────────────┘
                                        │
                                        ▼
                        ┌─────────────────────────────────┐
                        │   DATA ENRICHMENT & MERGE       │
                        │   • Combine outputs             │
                        │   • Apply business rules        │
                        │   • Validate constraints        │
                        │   • Ensure referential integrity│
                        └─────────────────────────────────┘
```

### Data Generation by Entity Type

| Entity | Primary Tool | Enhancement | Rationale |
|--------|-------------|-------------|-----------|
| Customer | Faker.js | Claude Haiku (company names) | Simple + context |
| Vendor | Faker.js | Claude Haiku (vendor names) | Simple + context |
| Invoice | SDV | Faker (memo) | Relational integrity (customer FK) |
| Vendor Bill | SDV | Faker (descriptions) | Relational integrity (vendor FK) |
| Sales Order | SDV | - | Pure relational (customer, items) |
| Account | Faker.js | - | Simple master data |
| Department | Faker.js | - | Simple master data |
| Budget | SDV | - | Numeric relationships (account FK) |
| Revenue Forecast | SDV | - | Time-series patterns |

### Volume Recommendations

```yaml
default_volumes:
  customers: 100
  vendors: 50
  invoices: 500
  vendor_bills: 300
  sales_orders: 200
  accounts: 80
  departments: 15
  budgets: 200
  employees: 50

scaling_rules:
  # Invoices should be 5x customers
  invoices: "customers * 5"
  # Vendor bills should be 6x vendors
  vendor_bills: "vendors * 6"
  # Budgets = 12 months * departments
  budgets: "12 * departments"
```

---

## 5. File Structure

```
agentic-sandbox/
├── src/
│   ├── schema/                          # Schema definitions & parsers
│   │   ├── connector-schema.ts          # Core ConnectorSchema interface
│   │   ├── parsers/
│   │   │   ├── openapi-parser.ts        # Parse OpenAPI specs
│   │   │   ├── json-schema-parser.ts    # Parse JSON samples
│   │   │   └── llm-inference-parser.ts  # LLM-based inference from docs
│   │   ├── extractors/
│   │   │   ├── type-extractor.ts        # Extract TypeScript types
│   │   │   └── relationship-extractor.ts # Detect FK relationships
│   │   └── validators/
│   │       └── zod-generator.ts         # Generate Zod schemas
│   │
│   ├── generators/                       # Code generators
│   │   ├── schema-generator.ts          # Generate SQL migrations
│   │   ├── route-generator.ts           # Generate Express routes
│   │   ├── data-generator.ts            # Orchestrate data generation
│   │   ├── migration-templates/
│   │   │   ├── knex.ts                  # Knex.js migration template
│   │   │   └── raw-sql.ts               # Raw SQL template
│   │   ├── route-templates/
│   │   │   ├── crud-handlers.ts         # CRUD handler template
│   │   │   └── response-transformer.ts  # Response format transformers
│   │   └── data-strategies/
│   │       ├── faker-strategy.ts        # Faker.js data generation
│   │       ├── sdv-bridge.ts            # Python SDV bridge
│   │       └── llm-enhancer.ts          # Claude Haiku enhancement
│   │
│   ├── config/                           # Existing configs
│   ├── middleware/                       # Existing middleware
│   ├── routes/                           # Generated routes go here
│   ├── services/                         # Generated services go here
│   ├── types/                            # Generated types go here
│   └── utils/
│
├── schemas/                              # Connector schema definitions
│   ├── netsuite.json                    # NetSuite connector schema
│   ├── hubspot.json                     # HubSpot connector schema (future)
│   ├── salesforce.json                  # Salesforce connector schema (future)
│   └── quickbooks.json                  # QuickBooks connector schema (future)
│
├── scripts/
│   ├── generate-connector.ts            # Main CLI orchestrator
│   ├── agents/                          # Agent implementations
│   │   ├── schema-agent.ts              # Schema inference agent
│   │   ├── migration-agent.ts           # Migration generation agent
│   │   ├── route-agent.ts               # Route generation agent
│   │   ├── data-agent.ts                # Data generation agent
│   │   └── validation-agent.ts          # Validation agent
│   └── sdv_generator.py                 # Python SDV script
│
├── skills/                              # Claude Code skill definitions
│   ├── infer-schema.md                  # /sc:infer-schema skill
│   ├── generate-migration.md            # /sc:generate-migration skill
│   ├── generate-routes.md               # /sc:generate-routes skill
│   ├── generate-data.md                 # /sc:generate-data skill
│   └── validate-connector.md            # /sc:validate-connector skill
│
├── migrations/                          # Database migrations
│   ├── 001_initial_schema.sql           # Existing
│   ├── 002_seed_data.sql                # Existing
│   └── auto_netsuite_schema.sql         # Generated by system
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── generators/                       # Generator tests
│       ├── schema-generator.test.ts
│       ├── route-generator.test.ts
│       └── data-generator.test.ts
│
└── docs/
    ├── building-block-agentic-architecture.md  # This document
    └── 2025-01-28-building-block-system-research.md
```

---

## 6. Integration with Existing System

### Express App Integration

The Building Block System integrates with the existing Express application at `/Applications/Agentic-sandbox/agentic-sandbox/src/app.ts`.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EXISTING EXPRESS APP (src/app.ts)                     │
│                                                                              │
│  app.use('/health', healthRoutes);                                          │
│  app.use('/oauth', authRoutes);                                             │
│  app.use('/api/netsuite', netsuiteRoutes);  // Existing manual routes       │
│                                                                              │
│  // GENERATED ROUTES REGISTRATION (auto-added by route-generator)           │
│  app.use('/api/netsuite/v2', generatedNetSuiteRoutes);  // Generated        │
│  app.use('/api/hubspot', generatedHubSpotRoutes);       // Generated        │
│  app.use('/api/salesforce', generatedSalesforceRoutes); // Generated        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ Generated Route │      │ Generated Route │      │ Generated Route │
│ src/routes/     │      │ src/routes/     │      │ src/routes/     │
│ netsuite-v2.ts  │      │ hubspot.ts      │      │ salesforce.ts   │
└────────┬────────┘      └────────┬────────┘      └────────┬────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ Generated Svc   │      │ Generated Svc   │      │ Generated Svc   │
│ src/services/   │      │ src/services/   │      │ src/services/   │
│ netsuiteV2Svc.ts│      │ hubspotSvc.ts   │      │ salesforceSvc.ts│
└────────┬────────┘      └────────┬────────┘      └────────┬────────┘
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │    POSTGRESQL DATABASE  │
                    │                         │
                    │  ┌───────────────────┐  │
                    │  │ Generated Tables  │  │
                    │  │ • netsuite_*      │  │
                    │  │ • hubspot_*       │  │
                    │  │ • salesforce_*    │  │
                    │  └───────────────────┘  │
                    └─────────────────────────┘
```

### Database Integration

Generated migrations use the same PostgreSQL database configured in `src/config/database.ts`:

```typescript
// Generated migrations follow project conventions:
// - migrations/auto_{connector}_schema.sql
// - Uses existing db connection pooling
// - Follows existing naming conventions (snake_case tables)
// - Adds foreign keys to existing tables where needed
```

### Authentication Integration

Generated routes inherit existing authentication middleware:

```typescript
// Generated routes use existing auth middleware from src/middleware/auth.ts
router.use(authenticateToken);  // JWT validation
router.use(rateLimit);          // Rate limiting
```

### Service Layer Pattern

Generated services follow the existing singleton pattern:

```typescript
// Example: src/services/generatedNetSuiteService.ts
class GeneratedNetSuiteService {
  async listCustomers(filters: CustomerFilters): Promise<PaginatedResponse<Customer>> {
    // Uses existing db.query() pattern from src/config/database.ts
  }
}

export default new GeneratedNetSuiteService();
```

---

## 7. ConnectorSchema Interface

The unified schema format that all parsers produce and all generators consume:

```typescript
// src/schema/connector-schema.ts

interface ConnectorSchema {
  name: string;              // e.g., "netsuite", "hubspot"
  version: string;           // e.g., "1.0.0"
  baseUrl: string;           // e.g., "/api/netsuite"

  auth: {
    type: 'oauth2' | 'apikey' | 'basic';
    config: Record<string, any>;
  };

  entities: EntityDefinition[];
  relationships: RelationshipDefinition[];
}

interface EntityDefinition {
  name: string;              // e.g., "Customer"
  tableName: string;         // e.g., "netsuite_customers"
  description?: string;

  endpoints: EndpointDefinition[];
  fields: FieldDefinition[];
}

interface FieldDefinition {
  name: string;              // e.g., "companyName"
  dbColumn: string;          // e.g., "company_name"
  type: FieldType;           // e.g., "string", "number", "date"
  required: boolean;
  unique?: boolean;
  indexed?: boolean;

  // Data generation hints
  faker?: {
    method: string;          // e.g., "company.name"
    args?: any[];
  };
  llmGenerate?: {
    prompt: string;          // e.g., "Generate Indian company name"
    examples?: string[];
  };

  // Foreign key reference
  foreignKey?: {
    entity: string;
    field: string;
  };

  // Validation
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
}

interface EndpointDefinition {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;              // e.g., "/customers/:id"
  operation: 'list' | 'get' | 'create' | 'update' | 'delete' | 'search';

  // Response transformation
  responseTransform?: {
    wrapper?: string;        // e.g., "items" for { items: [...] }
    fieldMappings?: Record<string, string>;
  };
}

interface RelationshipDefinition {
  from: { entity: string; field: string };
  to: { entity: string; field: string };
  type: 'one-to-many' | 'many-to-one' | 'many-to-many';
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
}

type FieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'uuid'
  | 'json'
  | 'enum';
```

---

## 8. CLI Usage Examples

### Generate Complete Connector

```bash
# Generate everything for NetSuite connector
npx ts-node scripts/generate-connector.ts \
  --schema schemas/netsuite.json \
  --all

# Output:
# ✅ Schema parsed: 15 entities, 42 relationships
# ✅ Migration generated: migrations/auto_netsuite_schema.sql
# ✅ Routes generated: src/routes/netsuite-generated.ts
# ✅ Service generated: src/services/netsuiteGeneratedService.ts
# ✅ Data seeded: 1,850 records across 15 tables
# ✅ Validation passed: 45/45 endpoints working
```

### Generate Individual Components

```bash
# Migration only
npx ts-node scripts/generate-connector.ts \
  --schema schemas/netsuite.json \
  --migration

# Routes only
npx ts-node scripts/generate-connector.ts \
  --schema schemas/netsuite.json \
  --routes

# Data only (with custom volumes)
npx ts-node scripts/generate-connector.ts \
  --schema schemas/netsuite.json \
  --data \
  --volume '{"customers":200,"invoices":1000}'
```

### Dry Run Mode

```bash
# Preview without writing files
npx ts-node scripts/generate-connector.ts \
  --schema schemas/netsuite.json \
  --all \
  --dry-run

# Output shows what would be generated without side effects
```

---

## 9. Implementation Priority

### Phase 1: Core Framework (Week 1)
1. `src/schema/connector-schema.ts` - Schema interfaces
2. `src/generators/schema-generator.ts` - SQL migration generator
3. `src/generators/route-generator.ts` - Express route generator
4. `scripts/generate-connector.ts` - CLI orchestrator

### Phase 2: Data Generation (Week 2)
5. `src/generators/data-strategies/faker-strategy.ts` - Faker.js integration
6. `src/generators/data-strategies/sdv-bridge.ts` - Python SDV bridge
7. `scripts/sdv_generator.py` - Python SDV script
8. `src/generators/data-generator.ts` - Data orchestration

### Phase 3: Intelligence Layer (Week 3)
9. `src/schema/parsers/openapi-parser.ts` - OpenAPI parsing
10. `src/schema/parsers/llm-inference-parser.ts` - LLM inference
11. `src/generators/data-strategies/llm-enhancer.ts` - Claude Haiku
12. Skills documentation in `skills/` directory

### Phase 4: NetSuite Implementation (Week 4)
13. `schemas/netsuite.json` - Complete NetSuite schema
14. Integration tests
15. Documentation

---

## 10. Cost Estimates

### Tool Costs (All Free/Open Source)

| Tool | License | Cost |
|------|---------|------|
| @apidevtools/swagger-parser | MIT | Free |
| @faker-js/faker | MIT | Free |
| SDV (Python) | BSL | Free |
| Knex.js | MIT | Free |
| Express.js | MIT | Free |

### AI API Costs (Per Connector Generation)

| Service | Model | Usage | Est. Cost |
|---------|-------|-------|-----------|
| Anthropic | Claude Haiku | ~100 company/vendor names | ~$0.10 |
| Anthropic | Claude Haiku | ~500 invoice memos | ~$0.20 |
| Anthropic | Claude Haiku | Schema inference (if needed) | ~$0.05 |

**Total per generation: ~$0.35**

---

## 11. Success Criteria

| Criteria | Metric | Target |
|----------|--------|--------|
| Schema Definition | Can define any REST API | 100% |
| Migration Generation | Valid SQL for PostgreSQL 15+ | 100% |
| Route Generation | Working Express routes | 100% |
| Data Generation | FK integrity preserved | 100% |
| Data Realism | Business-appropriate values | >90% |
| E2E Verification | All CRUD operations work | 100% |
| Time to New Connector | From spec to working mock | <3 days |

---

## Appendix A: Example NetSuite Schema Snippet

```json
{
  "name": "netsuite",
  "version": "1.0.0",
  "baseUrl": "/api/netsuite",
  "auth": {
    "type": "oauth2",
    "config": {
      "tokenEndpoint": "/oauth/token",
      "scopes": ["read", "write"]
    }
  },
  "entities": [
    {
      "name": "Customer",
      "tableName": "netsuite_customers",
      "description": "NetSuite customer records",
      "endpoints": [
        { "method": "GET", "path": "/customers", "operation": "list" },
        { "method": "GET", "path": "/customers/:id", "operation": "get" },
        { "method": "POST", "path": "/customers", "operation": "create" },
        { "method": "PATCH", "path": "/customers/:id", "operation": "update" }
      ],
      "fields": [
        {
          "name": "id",
          "dbColumn": "id",
          "type": "uuid",
          "required": true,
          "unique": true
        },
        {
          "name": "companyName",
          "dbColumn": "company_name",
          "type": "string",
          "required": true,
          "llmGenerate": {
            "prompt": "Generate realistic Indian company name",
            "examples": ["Tata Consultancy", "Infosys Limited", "Reliance Industries"]
          }
        },
        {
          "name": "email",
          "dbColumn": "email",
          "type": "string",
          "required": false,
          "faker": { "method": "internet.email" }
        },
        {
          "name": "status",
          "dbColumn": "status",
          "type": "enum",
          "required": true,
          "validation": {
            "enum": ["ACTIVE", "INACTIVE", "LEAD"]
          },
          "faker": { "method": "helpers.arrayElement", "args": [["ACTIVE", "INACTIVE", "LEAD"]] }
        }
      ]
    }
  ],
  "relationships": [
    {
      "from": { "entity": "Invoice", "field": "customerId" },
      "to": { "entity": "Customer", "field": "id" },
      "type": "many-to-one",
      "onDelete": "RESTRICT"
    }
  ]
}
```

---

**Document Status**: Architecture Design Complete
**Next Step**: Implementation of Phase 1 (Core Framework)
