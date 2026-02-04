# Agentic Sandbox - Mock Server Factory Architecture

> **Reference Materials:**
> - Architecture Visualization: [`docs/agentic-sandbox-architecture.html`](./agentic-sandbox-architecture.html)
> - Data Generation Pipeline: [`docs/datagen-pipeline.md`](./datagen-pipeline.md)

---

## Executive Summary

Agentic Sandbox is a **Mock Server Factory** that creates isolated, production-realistic mock servers for any API connector. The factory follows a standardized flow and maintains a registry of all created mock server instances.

**Core Flow:**
```
Connector Name → API Docs → Schema Inference → GenerationBrief → Data Generation → Mock Server Instance → Registry
```

**Key Concept:** Each mock server instance is a **complete, isolated copy** with its own:
- PostgreSQL schema (e.g., `netsuite_sharechat_331`)
- Data tables with generated realistic data
- Auth endpoints that accept configured credentials
- API endpoints matching the real connector's format

---

## System Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         MOCK SERVER FACTORY                                      │
│                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Factory    │───►│   Schema     │───►│    Data      │───►│    Mock      │  │
│  │    Tool      │    │   Inferrer   │    │  Generator   │    │   Server     │  │
│  │  (CLI/API)   │    │              │    │              │    │  Instance    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │                   │           │
│         │                   ▼                   ▼                   ▼           │
│         │            ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│         │            │  API Docs    │    │ Generation   │    │   Registry   │  │
│         │            │  (URL/File)  │    │    Brief     │    │  (PostgreSQL)│  │
│         │            └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                                                                       │
│         └────────────────────────────────────────────────────────────────────►  │
│                            SSL/DNS Auto-Configuration                           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. INPUT: Factory Tool receives request
   ├── Connector name (e.g., "snowflake", "netsuite")
   ├── API docs source (URL, file path, or inline spec)
   ├── Organization ID (e.g., "sharechat")
   └── GenerationBrief (data requirements)

2. SCHEMA INFERENCE: Parse API docs
   ├── Fetch/read API documentation
   ├── Extract entity schemas (tables, fields, types)
   ├── Identify auth mechanism (OAuth 1.0a, OAuth 2.0, JWT, API Key)
   └── Map API endpoints to mock routes

3. DATA GENERATION: Create realistic data
   ├── Use GenerationBrief specifications
   ├── Apply Faker.js / SDV / LLM generation
   ├── Inject chaos/edge cases if configured
   └── Maintain referential integrity

4. INSTANCE CREATION: Provision mock server
   ├── Create PostgreSQL schema (e.g., netsuite_sharechat_331)
   ├── Run entity migrations
   ├── Load generated data
   ├── Configure auth endpoints
   └── Set up SSL/DNS (integrated)

5. REGISTRATION: Add to registry
   ├── Store instance metadata
   ├── Track GenerationBrief used
   ├── Record endpoints and credentials
   └── Enable lookup for repeat usage
```

---

## Module Specifications

### Module 1: Factory Tool (CLI + API)

**Purpose:** Entry point for creating mock server instances

**CLI Interface:**
```bash
# Create new mock server instance
$ mock-factory create \
  --connector snowflake \
  --api-docs https://docs.snowflake.com/en/developer-guide/sql-api \
  --org-id sharechat \
  --brief /path/to/generation-brief.json

# Create from existing base (clone + customize)
$ mock-factory clone \
  --from snowflake_original \
  --to snowflake_sharechat_331 \
  --brief /path/to/custom-brief.json

# List all registered instances
$ mock-factory list
$ mock-factory list --connector netsuite

# Get instance details
$ mock-factory info netsuite_sharechat_331

# Delete instance
$ mock-factory delete netsuite_sharechat_331
```

**API Interface:**
```
POST /api/factory/create          # Create new instance
POST /api/factory/clone           # Clone existing instance
GET  /api/factory/instances       # List all instances
GET  /api/factory/instances/:id   # Get instance details
DELETE /api/factory/instances/:id # Delete instance
```

**Request Payload (Create):**
```typescript
interface CreateMockServerRequest {
  connector: string;              // e.g., "snowflake", "netsuite"
  orgId: string;                  // e.g., "sharechat"
  jobId?: string;                 // Auto-generated if not provided

  // API Documentation Source (one required)
  apiDocsUrl?: string;            // URL to fetch docs
  apiDocsFile?: string;           // Local file path
  apiDocsSpec?: object;           // Inline OpenAPI/JSON spec

  // Data Generation (from datagen-pipeline.md)
  generationBrief: GenerationBrief;

  // SSL/DNS Configuration
  sslConfig?: {
    autoSetup: boolean;           // Default: true
    domain?: string;              // Custom domain if provided
  };
}
```

---

### Module 2: Schema Inferrer

**Purpose:** Extract API schema from documentation sources

**Input Sources:**
1. **URL Fetch:** Download from official API docs
2. **File Path:** Read local OpenAPI/Swagger/JSON spec
3. **Direct Spec:** Accept inline JSON schema

**Output: ConnectorSchema**
```typescript
interface ConnectorSchema {
  connector: string;
  version: string;

  // Auth Configuration
  auth: {
    type: 'oauth1' | 'oauth2' | 'jwt' | 'apiKey' | 'basic';
    endpoints: {
      authorize?: string;
      token: string;
      refresh?: string;
    };
    scopes?: string[];
    urlFormat?: string;           // e.g., "https://{org}-{account}.snowflakecomputing.com"
  };

  // Entity Schemas
  entities: EntitySchema[];

  // API Endpoints
  endpoints: EndpointSchema[];

  // Response Shapes
  responseFormat: {
    wrapper?: string;             // e.g., "data", "records", "items"
    pagination?: 'offset' | 'cursor' | 'page';
    errorFormat?: object;
  };
}

interface EntitySchema {
  name: string;                   // e.g., "customers", "invoices"
  tableName: string;              // PostgreSQL table name
  fields: FieldSchema[];
  primaryKey: string;
  foreignKeys?: ForeignKeySchema[];
}

interface EndpointSchema {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  entity?: string;                // Linked entity
  operation: 'list' | 'get' | 'create' | 'update' | 'delete' | 'query';
  queryParams?: string[];
  bodySchema?: object;
  responseSchema?: object;
}
```

**Existing Connector Schemas:**
- `schemas/snowflake.json` - ✅ Complete
- `schemas/netsuite.json` - 🔲 To create

---

### Module 3: Data Generator

**Purpose:** Generate realistic data based on GenerationBrief

**Integration with datagen-pipeline.md:**
The Data Generator accepts a `GenerationBrief` (as defined in datagen-pipeline.md) and produces:
- Entity data files (JSON/SQL)
- Relationship mappings
- Chaos rules (if configured)

**Generation Strategies:**
1. **Faker.js:** Basic fake data (names, emails, amounts)
2. **SDV:** Statistical relationships between entities
3. **LLM (Claude):** Business-realistic context-aware data
4. **Chaos Injector:** Edge cases, errors, anomalies

**Output Structure:**
```
/data/generations/{instance_id}/
├── status.json                   # Generation status
├── data/
│   ├── customers.json
│   ├── invoices.json
│   └── _relationships.json
├── schemas/
│   └── connector_schema.json
└── credentials/
    └── mock_creds.json
```

---

### Module 4: Mock Server Instance

**Purpose:** Isolated, running mock server for a specific connector + org + job

**Instance Identification:**
```
{connector}_{orgId}_{jobId}
Examples:
- snowflake_original        (base template)
- snowflake_sharechat_331
- netsuite_original
- netsuite_sharechat_331
- netsuite_texas_456
```

**PostgreSQL Schema Isolation:**
Each instance gets its own PostgreSQL schema:
```sql
CREATE SCHEMA netsuite_sharechat_331;

-- Tables within schema
netsuite_sharechat_331.customers
netsuite_sharechat_331.invoices
netsuite_sharechat_331.items
```

**Instance Structure:**
```
src/instances/{instance_id}/
├── config.json               # Instance configuration
├── routes.ts                 # Auto-generated routes (if needed)
└── data/                     # Symlink to generated data
```

**Auth Endpoint Pattern:**
Each instance exposes auth at:
```
POST /{instance_id}/oauth/token
POST /{instance_id}/oauth/authorize
```

**API Endpoint Pattern:**
Each instance exposes API at:
```
GET  /{instance_id}/api/v1/{entity}
POST /{instance_id}/api/v1/{entity}
GET  /{instance_id}/api/v1/{entity}/{id}
PUT  /{instance_id}/api/v1/{entity}/{id}
DELETE /{instance_id}/api/v1/{entity}/{id}
```

---

### Module 5: Registry (PostgreSQL)

**Purpose:** Track all mock server instances and their metadata

**Tables:**
```sql
-- Core registry table
CREATE TABLE mock_server_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id VARCHAR(255) UNIQUE NOT NULL,  -- e.g., netsuite_sharechat_331
  connector VARCHAR(100) NOT NULL,            -- e.g., netsuite
  org_id VARCHAR(100) NOT NULL,               -- e.g., sharechat
  job_id VARCHAR(100),                        -- e.g., 331

  -- Status
  status VARCHAR(50) DEFAULT 'creating',      -- creating, active, stopped, error
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Configuration
  generation_brief JSONB,                     -- Full GenerationBrief used
  connector_schema JSONB,                     -- Parsed ConnectorSchema
  ssl_config JSONB,                           -- SSL/DNS configuration

  -- Access Information
  base_url VARCHAR(500),                      -- e.g., https://mockorg-mockaccount.snowflakecomputing.com
  api_base_path VARCHAR(255),                 -- e.g., /api/v1
  auth_endpoint VARCHAR(255),                 -- e.g., /oauth/token

  -- Credentials (mock)
  mock_credentials JSONB,                     -- Generated mock credentials

  -- Metadata
  entity_count INTEGER,                       -- Number of entities
  record_counts JSONB,                        -- Per-entity record counts
  api_docs_source VARCHAR(500),               -- URL/path used for schema

  -- PostgreSQL Schema
  pg_schema VARCHAR(255) NOT NULL             -- PostgreSQL schema name
);

-- Index for lookups
CREATE INDEX idx_registry_connector ON mock_server_registry(connector);
CREATE INDEX idx_registry_org ON mock_server_registry(org_id);
CREATE INDEX idx_registry_status ON mock_server_registry(status);
```

**Registry Operations:**
```typescript
interface RegistryService {
  create(instance: MockServerInstance): Promise<string>;
  get(instanceId: string): Promise<MockServerInstance>;
  list(filter?: { connector?: string; orgId?: string }): Promise<MockServerInstance[]>;
  update(instanceId: string, updates: Partial<MockServerInstance>): Promise<void>;
  delete(instanceId: string): Promise<void>;
  getByConnector(connector: string): Promise<MockServerInstance[]>;
  getOriginal(connector: string): Promise<MockServerInstance>;
}
```

---

### Module 6: SSL/DNS Auto-Configuration

**Purpose:** Automatically configure networking for real AI agent compatibility

**Problem Solved:** Real AI agents (Claude Cowork, PipesHub) validate connector URLs:
- Snowflake expects: `https://orgname-accountname.snowflakecomputing.com`
- NetSuite expects: `https://accountid.suitetalk.api.netsuite.com`

**Auto-Setup Steps:**
1. **Generate mock domain** based on connector URL format
2. **Add /etc/hosts entry** (requires sudo prompt)
3. **Generate self-signed certificate** using mkcert
4. **Configure Express HTTPS server**
5. **Store SSL config in registry**

**Configuration:**
```typescript
interface SSLConfig {
  domain: string;                 // e.g., mockorg-mockaccount.snowflakecomputing.com
  localIp: string;                // e.g., 127.0.0.1
  port: number;                   // e.g., 443
  certPath: string;               // Path to certificate
  keyPath: string;                // Path to private key
  hostsEntryAdded: boolean;

  // Generated URL for AI agents
  mockUrl: string;                // https://mockorg-mockaccount.snowflakecomputing.com
}
```

---

## Implementation Plan

### Phase 1: Core Infrastructure ✅ COMPLETE

| Task | Status | Notes |
|------|--------|-------|
| PostgreSQL registry table | ✅ Done | `migrations/006_mock_server_registry.sql` |
| Registry service | ✅ Done | `src/services/registryService.ts` |
| Factory CLI scaffolding | ✅ Done | `src/cli/index.ts` - Commander.js |
| Factory API endpoints | ✅ Done | `src/routes/factory.ts` |

### Phase 2: Schema Inference ✅ COMPLETE

| Task | Status | Notes |
|------|--------|-------|
| URL fetcher for API docs | ✅ Done | Via parseSchema() infrastructure |
| OpenAPI parser | ✅ Done | `src/schema/parsers/openapi-parser.ts` |
| LLM-assisted inference | ✅ Done | `src/schema/parsers/llm-inference-parser.ts` |
| ConnectorSchema output | ✅ Done | `src/services/schemaInferrerService.ts` |

### Phase 3: Instance Management ✅ COMPLETE

| Task | Status | Notes |
|------|--------|-------|
| PostgreSQL schema creation | ✅ Done | `instanceManagerService.provisionInstance()` |
| Migration runner per instance | ✅ Done | Dynamic DDL generation |
| Data loader per instance | ✅ Done | JSON data loading |
| Instance router | 🔲 TODO | Route requests to correct instance |

### Phase 4: SSL/DNS Integration ✅ COMPLETE

| Task | Status | Notes |
|------|--------|-------|
| Domain generator per connector | ✅ Done | `src/services/sslDnsService.ts` |
| /etc/hosts modifier | ✅ Done | With manual fallback |
| mkcert integration | ✅ Done | Certificate generation |
| HTTPS server setup | 🔲 TODO | Express HTTPS integration |

### Phase 5: Existing Connector Migration ✅ COMPLETE

| Task | Status | Notes |
|------|--------|-------|
| Migrate Snowflake to registry | ✅ Done | `migrations/007_register_snowflake_original.sql` |
| Migrate NetSuite to registry | ✅ Done | `migrations/008_register_netsuite_original.sql` |
| Create netsuite.json schema | ✅ Done | 72 entities in `schemas/netsuite.json` |

---

## Base Connector Templates

### Snowflake (✅ Implemented)

**Instance ID:** `snowflake_original`

**Files:**
- `schemas/snowflake.json` - ✅ Complete
- `migrations/004_snowflake_metadata.sql` - ✅ Complete
- `migrations/005_snowflake_sample_data.sql` - ✅ Complete
- `migrations/007_register_snowflake_original.sql` - ✅ Complete
- `src/routes/snowflake/` - ✅ Complete
- `src/services/snowflakeService.ts` - ✅ Complete

**URL Format:** `https://orgname-accountname.snowflakecomputing.com`

**Auth:** OAuth 2.0 with JWT keypair

### NetSuite (✅ Migrated)

**Instance ID:** `netsuite_original`

**Files:**
- `schemas/netsuite.json` - ✅ Complete (72 entities)
- `migrations/001_initial_schema.sql` - ✅ Exists
- `migrations/002_seed_data.sql` - ✅ Exists
- `migrations/008_register_netsuite_original.sql` - ✅ Complete
- `src/routes/netsuite.ts` - ✅ Exists
- `src/services/netsuiteService.ts` - ✅ Exists

**URL Format:** `https://accountid.suitetalk.api.netsuite.com`

**Auth:** OAuth 1.0a (TBA) / OAuth 2.0

---

## Example Workflow

### Creating a New Mock Server Instance

```bash
# 1. Create GenerationBrief
cat > /tmp/sharechat-netsuite-brief.json << 'EOF'
{
  "jobId": "331",
  "orgId": "sharechat",
  "sessionId": "sess_xyz",
  "callbacks": {
    "outputDirectory": "/data/generations/netsuite_sharechat_331",
    "statusFile": "/data/generations/netsuite_sharechat_331/status.json"
  },
  "connectors": [{
    "name": "netsuite",
    "type": "erp",
    "supported": true,
    "entities": [
      {"name": "customer", "estimatedVolume": 500},
      {"name": "invoice", "estimatedVolume": 2000},
      {"name": "vendor", "estimatedVolume": 100}
    ]
  }],
  "metadata": {
    "industry": "media",
    "companySize": "startup",
    "region": "APAC"
  }
}
EOF

# 2. Create mock server instance
$ mock-factory create \
  --connector netsuite \
  --api-docs https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1544787163.html \
  --org-id sharechat \
  --brief /tmp/sharechat-netsuite-brief.json

# Output:
# ✅ Schema inferred from API docs
# ✅ PostgreSQL schema created: netsuite_sharechat_331
# ✅ Tables created: customers, invoices, vendors
# ✅ Generated 500 customers, 2000 invoices, 100 vendors
# ✅ SSL configured: https://sharechat.suitetalk.api.netsuite.com
# ✅ Registered in mock_server_registry
#
# Mock Server Ready:
#   URL: https://sharechat.suitetalk.api.netsuite.com
#   Auth: POST /oauth/token
#   API:  GET /api/v1/customers
#
# Credentials:
#   Client ID: mock-client-sharechat
#   Client Secret: mock-secret-xyz

# 3. List all instances
$ mock-factory list
# ID                      | Connector  | Org       | Status  | URL
# ------------------------|------------|-----------|---------|----------------------------------
# snowflake_original      | snowflake  | original  | active  | https://mockorg...snowflakecomputing.com
# netsuite_original       | netsuite   | original  | active  | https://mockacct...netsuite.com
# netsuite_sharechat_331  | netsuite   | sharechat | active  | https://sharechat...netsuite.com

# 4. Use in Claude Cowork
# Paste URL and credentials from mock-factory output
```

---

## Acceptance Criteria

### Factory Tool
- [x] CLI creates mock server instance from connector + API docs + brief
- [x] API endpoints mirror CLI functionality
- [ ] Clone operation copies base and customizes with new brief
- [x] List/Info/Delete operations work correctly

### Schema Inference
- [ ] URL fetch retrieves and parses API documentation
- [ ] File path reads local OpenAPI/JSON specs
- [ ] Direct spec accepts inline JSON
- [ ] Output ConnectorSchema matches standardized format

### Instance Management
- [ ] Each instance gets isolated PostgreSQL schema
- [ ] Instance routes are auto-configured
- [ ] Data is loaded from GenerationBrief output
- [ ] Instances can be stopped/started

### Registry
- [ ] All instances tracked in `mock_server_registry`
- [ ] Full GenerationBrief stored for reproducibility
- [ ] Query by connector, org, status works

### SSL/DNS
- [ ] Domain auto-generated matching connector URL format
- [ ] /etc/hosts entry added (with sudo prompt)
- [ ] Self-signed certificate generated
- [ ] HTTPS server running
- [ ] Real AI agent (Claude Cowork) can connect

---

## Session Log

### 2026-02-05 (Session 6)
**Factory CLI Tool Complete**

Implemented Commander.js CLI with full credential output for AI agents:

**Commands:**
- `npm run cli -- create -c <connector> -o <org>` - Creates instance with SSL
- `npm run cli -- list` - Lists all instances in table format
- `npm run cli -- info <instanceId>` - Shows credentials box for copy/paste
- `npm run cli -- delete <instanceId>` - Removes instance

**Key Features:**
- Outputs copy-pasteable credentials box with URL, Client ID, Client Secret
- Auto-generates HTTPS URLs matching real connector formats
- Provides /etc/hosts setup instructions for local SSL
- JSON output mode for automation

**Files Created:**
- `src/cli/index.ts` - CLI entry point
- `src/cli/commands/create.ts` - Create command with SSL setup
- `src/cli/commands/list.ts` - List command with table formatting
- `src/cli/commands/info.ts` - Info command with credentials box
- `src/cli/commands/delete.ts` - Delete command with confirmation
- `src/cli/utils/formatters.ts` - Output formatters (table, credentials box, SSL instructions)
- `tests/unit/cli/*.test.ts` - Unit tests
- `tests/integration/cli.test.ts` - Integration tests

**Testing:**
```bash
# Create a new instance
npm run cli -- create -c netsuite -o sharechat

# Get credentials for Claude Cowork
npm run cli -- info netsuite_sharechat_xxx --creds

# List all instances
npm run cli -- list
```

**Commits:**
- a2c498d: deps: add commander, chalk, ora for CLI
- c2d4b05: feat(cli): add CLI entry point with Commander.js
- (list): feat(cli): add list command with table formatting
- aae4f12: feat(cli): add create command with SSL setup and credentials output
- (info/delete): feat(cli): add info and delete commands
- 8c579d1: feat(cli): wire up all commands and add npm scripts
- cd58eb9: test(cli): add integration tests for CLI commands
```bash
# After implementation, usage will be:
npm run cli -- create -c netsuite -o sharechat

# Output includes:
# ✅ Mock Server Ready!
# ┌─────────────────────────────────────────────────────────────────┐
# │ URL:           https://sharechat.suitetalk.api.netsuite.com     │
# │ Client ID:     mock-client-sharechat-netsuite                   │
# │ Client Secret: mock-secret-abc123xyz                            │
# └─────────────────────────────────────────────────────────────────┘
#
# ⚠️  SSL Setup: sudo sh -c 'echo "127.0.0.1  sharechat..." >> /etc/hosts'
```

---

### 2026-02-05 (Session 5)
**Mock Server Factory Implementation Complete**

Implemented all core factory modules:

**Phase 1 - Core Infrastructure:**
- `migrations/006_mock_server_registry.sql` - Registry table with JSONB configs
- `src/services/registryService.ts` - CRUD operations for instances
- `src/routes/factory.ts` - Factory API endpoints (create, clone, list, get, delete)

**Phase 2 - Schema Inference:**
- `src/services/schemaInferrerService.ts` - Wraps parseSchema infrastructure
- Supports URL, file, and inline spec inputs
- Auto-detects input type and routes to appropriate parser

**Phase 3 - Instance Management:**
- `src/services/instanceManagerService.ts` - PostgreSQL schema provisioning
- Dynamic DDL generation from ConnectorSchema
- Data loading from GenerationBrief output

**Phase 4 - SSL/DNS Integration:**
- `src/services/sslDnsService.ts` - Domain generation per connector type
- mkcert integration for self-signed certificates
- /etc/hosts management (with manual fallback)

**Phase 5 - Connector Migration:**
- `migrations/007_register_snowflake_original.sql` - Snowflake in registry
- `migrations/008_register_netsuite_original.sql` - NetSuite in registry (72 entities)

**Commits:**
- d912519: fix(registry): improve type safety and error handling
- 2ae7807: feat(factory): add Factory API routes and core services
- a02d02b: feat(factory): add SSL/DNS service and register original connectors

### 2026-02-05 (Session 4)
**Re-Architecture: Mock Server Factory**

Rewrote spec based on user requirements:
1. **Factory Tool** - CLI + API for creating mock server instances
2. **Registry** - PostgreSQL-based tracking of all instances
3. **Instance Identification** - `connector_orgId_jobId` pattern
4. **Data Isolation** - PostgreSQL schemas per instance
5. **SSL/DNS Integration** - Auto-setup for real AI agent compatibility
6. **Clone + Customize** - Reuse base implementations for new instances

Key decisions:
- PostgreSQL tables for registry storage
- Instance ID: `connector_orgId_jobId`
- Both CLI and API interfaces
- PostgreSQL schemas for data isolation
- URL + File + Direct spec for API docs
- Clone and customize for existing connectors
- Integrated SSL/DNS setup in factory tool

### 2026-02-05 (Session 3)
**Issue: Real AI Agent URL Validation**

Claude Cowork Desktop validates Snowflake URL format. Our `localhost:3002` rejected.
Documented solution options. Led to re-architecture with integrated SSL/DNS.

### 2026-02-05 (Session 2)
**Snowflake Mock Server Implementation Complete**

All Snowflake components implemented and tested.

### 2026-02-04 (Session 1)
Initial spec creation.
