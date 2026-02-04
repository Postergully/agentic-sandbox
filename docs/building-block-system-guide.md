# Building Block System Guide

> **Comprehensive guide to the Agentic Sandbox mock server generation framework**

**Version**: 1.0
**Last Updated**: 2026-01-28
**Status**: Core System Implemented, Extensions Planned

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Complete Flow (Vision)](#2-the-complete-flow-vision)
3. [Current Capabilities (What's Built)](#3-current-capabilities-whats-built)
4. [Gap Analysis (What's Missing)](#4-gap-analysis-whats-missing)
5. [Admin Dashboard Vision](#5-admin-dashboard-vision)
6. [Implementation Roadmap](#6-implementation-roadmap)
7. [Quick Start Guide](#7-quick-start-guide)
8. [Architecture Deep Dive](#8-architecture-deep-dive)

---

## 1. Executive Summary

### What is the Building Block System?

The Building Block System is an automated framework that transforms API specifications into fully functional mock servers with realistic synthetic data. It's designed to help AI agent developers test their integrations against enterprise systems (NetSuite, Salesforce, HubSpot, QuickBooks) without needing access to real production environments.

### Why It Exists

**Problem**: AI agents need to interact with enterprise APIs during development and testing, but:
- Real API access is expensive and rate-limited
- Production data contains sensitive information
- Sandbox environments are often outdated or incomplete
- Manual mock creation is tedious and error-prone

**Solution**: The Building Block System automatically generates:
- PostgreSQL database schemas from API specifications
- Express.js route handlers with full CRUD operations
- Realistic synthetic data that respects relationships
- OAuth authentication flows matching real systems

### How It Works at a High Level

```
INPUT                     PROCESSING                    OUTPUT
─────                     ──────────                    ──────

┌─────────────────┐      ┌────────────────────┐      ┌─────────────────┐
│ • OpenAPI Spec  │      │  Schema Parsers    │      │ SQL Migrations  │
│ • JSON Sample   │ ───▶ │  (Auto-detect &    │ ───▶ │ Express Routes  │
│ • API Docs URL  │      │   Unify)           │      │ Service Layer   │
│ • Text Desc.    │      │                    │      │ Seed Data       │
└─────────────────┘      └────────────────────┘      └─────────────────┘
                                  │
                                  ▼
                         ┌────────────────────┐
                         │ ConnectorSchema    │
                         │ (Unified Format)   │
                         └────────────────────┘
```

---

## 2. The Complete Flow (Vision)

### End-to-End User Journey

The full vision includes an interactive CLI that guides users through business context discovery before generating a customized mock server.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    BUILDING BLOCK SYSTEM - FULL FLOW                     │
└─────────────────────────────────────────────────────────────────────────┘

Step 1: Business Context Discovery (CLI Wizard)
├── Industry Selection
│   └── Retail | Healthcare | Finance | Manufacturing | SaaS | Other
├── Vertical Selection
│   └── B2B | B2C | B2B2C | Marketplace
├── Business Type
│   └── E-commerce | Subscription | Professional Services | Distribution
└── Use Case Questions
    └── "What data do your AI agents need to process?"
    └── "What workflows will they automate?"

                               ▼

Step 2: Mock Server Selection
├── Target System
│   └── NetSuite | Salesforce | HubSpot | QuickBooks | Custom
├── API Type
│   └── REST | GraphQL | SOAP
└── API Version
    └── Specific version selection based on target system

                               ▼

Step 3: Schema Source Input
├── Option A: API documentation URL
│   └── "https://docs.netsuite.com/records/customer"
├── Option B: OpenAPI/Swagger spec file
│   └── "./specs/netsuite-openapi.yaml"
├── Option C: Sample JSON response
│   └── "./samples/customer-response.json"
└── Option D: Natural language description
    └── "Customer records with billing and shipping addresses"

                               ▼

Step 4: Smart Schema Selection (Context-Aware Probing)
├── Auto-Selection Based on Business Context
│   └── Retail + E-commerce → Customer, Order, Product, Inventory, Payment
│   └── SaaS + B2B → Account, User, Subscription, Invoice, Usage
│   └── Healthcare → Patient, Provider, Appointment, Claim, Authorization
├── User Confirmation
│   └── "We recommend these 12 entities. Confirm or adjust?"
└── Custom Selection
    └── Add/remove entities from recommended set

                               ▼

Step 5: Building Block System Execution
├── Parse Input → ConnectorSchema
├── Generate SQL Migration
│   └── Tables, foreign keys, indexes, constraints
├── Generate Express Routes
│   └── CRUD endpoints with authentication
├── Generate Synthetic Data
│   └── Faker.js base + relationship integrity
└── Apply & Start Mock Server

                               ▼

Step 6: Mock Server Ready
┌─────────────────────────────────────────────────────────────────┐
│ ✅ Mock Server Running                                           │
│                                                                  │
│ Server URL:    http://localhost:3001/api/netsuite                │
│ Auth Endpoint: http://localhost:3001/api/auth/netsuite/token     │
│                                                                  │
│ OAuth Credentials:                                               │
│   Client ID:     mock_netsuite_client_abc123                     │
│   Client Secret: mock_secret_xyz789                              │
│                                                                  │
│ Statistics:                                                      │
│   Tables: 72    Records: 720    Entities: 12                     │
│   Industry: Retail    Vertical: B2B                              │
│                                                                  │
│ Quick Test:                                                      │
│   curl -H "Authorization: Bearer <token>" \                      │
│        http://localhost:3001/api/netsuite/customer               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Current Capabilities (What's Built)

### Component Status Overview

| Component | Status | Description |
|-----------|--------|-------------|
| **Core Schema Definition** | ✅ Complete | TypeScript interfaces + Zod validation |
| **OpenAPI Parser** | ✅ Complete | OpenAPI 3.x and Swagger 2.x support |
| **LLM Inference Parser** | ✅ Complete | Claude Haiku for text/JSON inference |
| **Large Docs Parser** | ✅ Complete | 3-tier strategy for ERP documentation |
| **Unified Parser Interface** | ✅ Complete | Auto-detection and routing |
| **SQL Migration Generator** | ✅ Complete | PostgreSQL with FK support |
| **Route Generator** | ✅ Complete | Express.js with auth middleware |
| **Data Generator** | ✅ Complete | Faker.js with relationship integrity |
| **Schema Caching** | ✅ Complete | File-based with TTL and compression |
| **CLI Orchestrator** | ✅ Complete | Command-line generation tool |
| **NetSuite Schema** | ✅ Complete | Reference implementation |

### Detailed Component Inventory

#### 1. Schema Definition (`src/schema/connector-schema.ts`)

The unified data contract that all parsers produce and all generators consume.

**Key Interfaces:**
```typescript
interface ConnectorSchema {
  name: string;
  version: string;
  baseUrl: string;
  auth: AuthConfig;
  entities: EntityDefinition[];
  relationships?: RelationshipDefinition[];
}

interface EntityDefinition {
  name: string;
  tableName: string;
  description?: string;
  fields: FieldDefinition[];
  endpoints?: EndpointDefinition[];
}

interface FieldDefinition {
  name: string;
  type: FieldType;  // string | number | boolean | date | datetime | json | uuid
  required?: boolean;
  unique?: boolean;
  description?: string;
  foreignKey?: ForeignKey;
  fakerHint?: string;  // e.g., 'company.name', 'internet.email'
}
```

**Capabilities:**
- 7 field types with PostgreSQL mapping
- 4 auth types (oauth2, apikey, tba, basic)
- 6 CRUD operation definitions
- 15+ helper functions (topological sort, FK validation, relationship traversal)
- Zod schemas for runtime validation

#### 2. Parser Implementations (`src/schema/parsers/`)

| Parser | File | Input Types | Use Case |
|--------|------|-------------|----------|
| **OpenAPI** | `openapi-parser.ts` | `.yaml`, `.json` OpenAPI specs | Standard API documentation |
| **LLM Inference** | `llm-inference-parser.ts` | Text, JSON samples, URLs | Unstructured documentation |
| **Large Docs** | `large-docs-parser/` | HTML documentation directories | ERP systems like NetSuite |
| **Unified** | `index.ts` | Any of the above | Auto-detection and routing |

**Large Docs Parser Architecture:**
```
large-docs-parser/
├── menudefs-parser.ts      # Index documentation structure (~50KB index)
├── record-selector.ts      # Select 1-20 most relevant records
├── html-field-parser.ts    # Extract field definitions from HTML
├── schema-assembler.ts     # Assemble into ConnectorSchema
├── field-mapper.ts         # Map ERP fields to standard types
└── types.ts                # Parser pipeline types
```

#### 3. Generator Implementations (`src/generators/`)

| Generator | File | Output | Features |
|-----------|------|--------|----------|
| **Schema** | `schema-generator.ts` | PostgreSQL SQL | FK constraints, indexes, triggers |
| **Route** | `route-generator.ts` | Express.js routes | CRUD, pagination, validation |
| **Data** | `data-generator.ts` | JSON/SQL/TypeScript | Faker.js, FK integrity, seeding |

**Schema Generator Features:**
- Topological sorting for dependency ordering
- Automatic timestamp triggers (created_at, updated_at)
- Index creation for foreign keys
- CHECK constraints for enums
- Configurable: DROP statements, audit columns, schema names

**Route Generator Features:**
- Full CRUD endpoints (list, get, create, update, delete)
- Pagination with configurable page sizes
- Request validation for required fields
- Authentication middleware integration
- Service stub generation with placeholder DB queries

**Data Generator Features:**
- Smart field inference from names (email, phone, URL, currency)
- Faker.js method hints support
- Foreign key reference handling
- Multiple output formats (JSON, SQL INSERT, TypeScript)
- Reproducible generation with seed support

#### 4. CLI Tool (`scripts/generate-connector.ts`)

```bash
# Generate everything
npx ts-node scripts/generate-connector.ts --schema schemas/netsuite.json --all

# Generate specific artifacts
npx ts-node scripts/generate-connector.ts --schema schemas/netsuite.json --migration
npx ts-node scripts/generate-connector.ts --schema schemas/netsuite.json --routes
npx ts-node scripts/generate-connector.ts --schema schemas/netsuite.json --data --count 100

# Preview without writing
npx ts-node scripts/generate-connector.ts --schema schemas/netsuite.json --all --dry-run
```

#### 5. Reference Schema (`schemas/netsuite.json`)

Complete NetSuite connector schema demonstrating:
- Token-Based Authentication (TBA) configuration
- Multi-entity setup with relationships
- Field type variety and validation rules
- Endpoint definitions for all CRUD operations

---

## 4. Gap Analysis (What's Missing)

### Priority Matrix

| Component | Priority | Effort | Impact |
|-----------|----------|--------|--------|
| Interactive CLI Wizard | 🔴 High | Medium | High |
| Industry Templates | 🔴 High | Low | High |
| Smart Entity Selection | 🔴 High | Medium | High |
| Mock Server Runtime Manager | 🔴 High | Medium | High |
| Admin Dashboard UI | 🟡 Medium | High | Medium |
| Multi-Server Support | 🟡 Medium | Medium | Medium |
| Additional Connector Schemas | 🟡 Medium | Medium | Medium |
| Server Health Monitoring | 🟢 Low | Low | Low |

### Missing Component Details

#### 1. Interactive CLI Wizard (High Priority)

**Current State**: CLI accepts a pre-defined schema file
**Desired State**: Interactive prompts guide users through schema creation

**Missing Features:**
- Business context questions (industry, vertical, use case)
- Mock server type selection
- Schema source input with multiple options
- Entity selection with recommendations
- Configuration preview before generation

**Proposed Implementation:**
```
scripts/create-mock-server.ts

Interactive flow:
1. "What industry is your business in?" → [Retail, Healthcare, ...]
2. "Is this B2B, B2C, or both?" → [B2B, B2C, B2B2C]
3. "Which system do you want to mock?" → [NetSuite, Salesforce, ...]
4. "How will you provide the schema?" → [URL, File, Description, ...]
5. "Based on your context, we recommend these entities: ..."
6. [Preview] → [Generate]
```

#### 2. Industry Templates (High Priority)

**Current State**: No pre-defined entity sets
**Desired State**: Quick-start templates by industry

**Proposed Templates:**

```
src/templates/

retail.json:
  - Customer, Order, Product, Inventory, Payment, Shipment
  - Typical relationships and field definitions

saas.json:
  - Account, User, Subscription, Invoice, Usage, Feature
  - Billing-focused with usage tracking

healthcare.json:
  - Patient, Provider, Appointment, Claim, Authorization, Facility
  - HIPAA-aware field definitions

manufacturing.json:
  - Vendor, PurchaseOrder, BillOfMaterials, WorkOrder, Inventory
  - Supply chain focused
```

#### 3. Smart Entity Selection (High Priority)

**Current State**: Manual entity selection
**Desired State**: AI-assisted recommendations based on business context

**Algorithm:**
```typescript
function recommendEntities(context: BusinessContext): EntityRecommendation[] {
  const baseEntities = industryTemplates[context.industry];
  const verticalModifiers = verticalEntitySets[context.vertical];
  const useCaseEntities = analyzeUseCase(context.description);

  return mergeAndRank(baseEntities, verticalModifiers, useCaseEntities);
}
```

#### 4. Mock Server Runtime Manager (High Priority)

**Current State**: Manual server start via `npm run dev`
**Desired State**: Programmatic server lifecycle management

**Proposed API:**
```typescript
// src/services/mock-server-manager.ts

interface MockServerManager {
  start(config: ServerConfig): Promise<RunningServer>;
  stop(serverId: string): Promise<void>;
  restart(serverId: string): Promise<void>;
  list(): RunningServer[];
  getStatus(serverId: string): ServerStatus;
}

interface RunningServer {
  id: string;
  name: string;
  port: number;
  url: string;
  status: 'running' | 'stopped' | 'error';
  stats: { tables: number; records: number };
  startedAt: Date;
}
```

**Registry File:**
```json
// data/servers.json
{
  "servers": [
    {
      "id": "srv_abc123",
      "name": "NetSuite Mock",
      "port": 3001,
      "schemaPath": "schemas/netsuite.json",
      "status": "running",
      "pid": 12345
    }
  ]
}
```

#### 5. Admin Dashboard UI (Medium Priority)

See [Section 5: Admin Dashboard Vision](#5-admin-dashboard-vision) for detailed mockups.

#### 6. Additional Connector Schemas (Medium Priority)

**Missing Schemas:**
- Salesforce (CRM, Sales Cloud, Service Cloud)
- HubSpot (CRM, Marketing, Sales)
- QuickBooks (Accounting, Invoicing)
- Stripe (Payments, Subscriptions)
- Shopify (E-commerce, Inventory)

---

## 5. Admin Dashboard Vision

### Overview

The admin dashboard provides a visual interface for managing mock servers, viewing their status, and configuring new instances.

### Mock Server Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🏗️ Mock Server Dashboard                              [+ New Server]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [🔍 Search servers...]                                                 │
│                                                                         │
│  [All: 5] [Running: 3] [Stopped: 2]                                     │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐   │
│  │ 🟢 NetSuite       │  │ 🟢 Salesforce     │  │ 🔴 HubSpot        │   │
│  │ ERP • v2025.2     │  │ CRM • v58.0       │  │ CRM • v3          │   │
│  │ ───────────────── │  │ ───────────────── │  │ ───────────────── │   │
│  │                   │  │                   │  │                   │   │
│  │ 📊 Tables: 72     │  │ 📊 Tables: 45     │  │ 📊 Tables: 28     │   │
│  │ 📝 Records: 720   │  │ 📝 Records: 450   │  │ 📝 Records: 0     │   │
│  │ 🏭 Industry: Retail│ │ 🏭 Industry: SaaS │  │ 🏭 Industry: -    │   │
│  │ ───────────────── │  │ ───────────────── │  │ ───────────────── │   │
│  │                   │  │                   │  │                   │   │
│  │ 🔗 :3001/netsuite │  │ 🔗 :3002/sfdc     │  │ 🔗 :3003/hubspot  │   │
│  │                   │  │                   │  │                   │   │
│  │ [⏹ Stop] [⚙ Manage]│ │ [⏹ Stop] [⚙ Manage]│ │ [▶ Start][⚙ Config]│  │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘   │
│                                                                         │
│  ┌───────────────────┐  ┌───────────────────┐                          │
│  │ 🟢 QuickBooks     │  │ 🔴 Custom API     │                          │
│  │ Accounting • v3   │  │ Custom • v1.0     │                          │
│  │ ───────────────── │  │ ───────────────── │                          │
│  │ 📊 Tables: 18     │  │ 📊 Tables: 5      │                          │
│  │ 📝 Records: 180   │  │ 📝 Records: 0     │                          │
│  │ 🏭 Industry: SMB  │  │ 🏭 Industry: Tech │                          │
│  │ ───────────────── │  │ ───────────────── │                          │
│  │ 🔗 :3004/qb       │  │ 🔗 :3005/custom   │                          │
│  │ [⏹ Stop] [⚙ Manage]│ │ [▶ Start][⚙ Config]│                         │
│  └───────────────────┘  └───────────────────┘                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Server Card Information

Each mock server card displays:

| Element | Description |
|---------|-------------|
| **Status Indicator** | 🟢 Running, 🔴 Stopped, 🟡 Starting |
| **Server Name** | User-defined name (e.g., "NetSuite") |
| **Category & Version** | System type and API version |
| **Table Count** | Number of database tables |
| **Record Count** | Total synthetic records |
| **Industry Tag** | Business context classification |
| **Server URL** | Endpoint for API access |
| **Action Buttons** | Start/Stop, Manage/Configure |

### Server Management Dialog

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ⚙️ NetSuite Mock Server                                         [×]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Status: 🟢 Running                    Uptime: 2h 34m                   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Connection Details                                               │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ Base URL:      http://localhost:3001/api/netsuite          [📋] │   │
│  │ Auth URL:      http://localhost:3001/api/auth/token        [📋] │   │
│  │ Client ID:     mock_netsuite_abc123                        [📋] │   │
│  │ Client Secret: ••••••••••••••••                      [👁] [📋] │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Data Statistics                                                  │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ Entity          │ Records │ Last Modified                       │   │
│  │ ─────────────────────────────────────────────────────────────── │   │
│  │ Customer        │    100  │ 2 hours ago                         │   │
│  │ Invoice         │    250  │ 2 hours ago                         │   │
│  │ SalesOrder      │    150  │ 2 hours ago                         │   │
│  │ Product         │     80  │ 2 hours ago                         │   │
│  │ Vendor          │     50  │ 2 hours ago                         │   │
│  │ ...             │    ...  │ ...                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Quick Actions                                                    │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ [🔄 Regenerate Data]  [📥 Export Schema]  [📤 Import Data]      │   │
│  │ [🗑️ Reset Database]   [📊 View Logs]      [🧪 Test Endpoints]   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                        [⏹ Stop Server]  [💾 Save]       │
└─────────────────────────────────────────────────────────────────────────┘
```

### New Server Wizard

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🆕 Create New Mock Server                                       [×]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Step 1 of 4: Business Context                                          │
│  ═══════════════════════════════                                        │
│                                                                         │
│  Industry:                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ [🛒 Retail]  [🏥 Healthcare]  [💰 Finance]  [🏭 Manufacturing]  │   │
│  │ [💻 SaaS]    [🎓 Education]   [🏠 Real Estate]  [⚙️ Other]      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Business Model:                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ [🏢 B2B]     [🛍️ B2C]        [🔄 B2B2C]      [🏪 Marketplace]   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Describe your use case:                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ We need to test AI agents that process customer orders and      │   │
│  │ sync inventory levels with our ERP system...                    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  [← Back]                                           [Next: System →]    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Implementation Roadmap

### Phase 2.5: Interactive CLI (High Priority)

| Task | Description | Effort |
|------|-------------|--------|
| 2.5.1 | Create `scripts/create-mock-server.ts` with inquirer | 2 days |
| 2.5.2 | Add business context prompts (industry, vertical, use case) | 1 day |
| 2.5.3 | Add mock server type selection | 0.5 days |
| 2.5.4 | Add schema source input options (URL, file, description) | 1 day |
| 2.5.5 | Implement smart entity selection based on context | 2 days |
| 2.5.6 | Add configuration preview and confirmation | 0.5 days |

**Total: ~7 days**

### Phase 2.6: Industry Templates

| Task | Description | Effort |
|------|-------------|--------|
| 2.6.1 | Create `src/templates/` directory structure | 0.5 days |
| 2.6.2 | Create Retail template (Customer, Order, Product, etc.) | 1 day |
| 2.6.3 | Create SaaS template (Account, Subscription, etc.) | 1 day |
| 2.6.4 | Create Healthcare template (Patient, Provider, etc.) | 1 day |
| 2.6.5 | Create Manufacturing template (Vendor, PO, BOM, etc.) | 1 day |
| 2.6.6 | Template selection and merge logic | 1 day |

**Total: ~5.5 days**

### Phase 2.7: Mock Server Runtime Manager

| Task | Description | Effort |
|------|-------------|--------|
| 2.7.1 | Create `src/services/mock-server-manager.ts` | 2 days |
| 2.7.2 | Implement start/stop/restart functionality | 1 day |
| 2.7.3 | Add multi-port support for concurrent servers | 1 day |
| 2.7.4 | Create server registry (`data/servers.json`) | 0.5 days |
| 2.7.5 | Add process management (PM2 integration or native) | 1.5 days |
| 2.7.6 | CLI commands for server management | 1 day |

**Total: ~7 days**

### Phase 3: Admin Dashboard (Medium Priority)

| Task | Description | Effort |
|------|-------------|--------|
| 3.1 | Create `src/routes/admin.ts` API endpoints | 2 days |
| 3.2 | Dashboard page component with server grid | 2 days |
| 3.3 | Server card component with status indicators | 1 day |
| 3.4 | Server management dialog | 2 days |
| 3.5 | New server wizard (multi-step form) | 3 days |
| 3.6 | Real-time status updates (WebSocket or polling) | 1 day |
| 3.7 | Data management actions (regenerate, export, reset) | 2 days |

**Total: ~13 days**

### Phase 4: Additional Connectors (Medium Priority)

| Task | Description | Effort |
|------|-------------|--------|
| 4.1 | Salesforce schema and parser customization | 3 days |
| 4.2 | HubSpot schema and parser customization | 2 days |
| 4.3 | QuickBooks schema and parser customization | 2 days |
| 4.4 | Stripe schema (payments focus) | 2 days |
| 4.5 | Shopify schema (e-commerce focus) | 2 days |

**Total: ~11 days**

### Timeline Summary

```
Phase 2.5 (Interactive CLI):     ████████░░░░░░░░░░░░  Week 1-2
Phase 2.6 (Industry Templates):  ░░░░████░░░░░░░░░░░░  Week 2
Phase 2.7 (Runtime Manager):     ░░░░░░░░████████░░░░  Week 3
Phase 3 (Admin Dashboard):       ░░░░░░░░░░░░████████  Week 4-5
Phase 4 (More Connectors):       ░░░░░░░░░░░░░░░░████  Week 5-6
```

---

## 7. Quick Start Guide

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- Redis (optional, for caching)
- Docker (optional, for containerized setup)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/agentic-sandbox.git
cd agentic-sandbox

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your database credentials

# Start PostgreSQL and Redis (Docker)
npm run docker:up
```

### Generate a Mock Server

```bash
# Option 1: Use existing schema
npx ts-node scripts/generate-connector.ts \
  --schema schemas/netsuite.json \
  --all

# Option 2: Generate from OpenAPI spec
npx ts-node scripts/generate-connector.ts \
  --input ./specs/my-api.yaml \
  --output ./generated \
  --all

# Option 3: Preview without writing
npx ts-node scripts/generate-connector.ts \
  --schema schemas/netsuite.json \
  --all \
  --dry-run
```

### Apply Migrations and Seed Data

```bash
# Apply generated migration
psql -U agentic_user -d agentic_sandbox -f generated/netsuite_migration.sql

# Seed synthetic data
npx ts-node generated/netsuite_seed.ts
```

### Start the Server

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm run build && npm start
```

### Test the API

```bash
# Get auth token
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"clientId": "mock_client", "clientSecret": "mock_secret"}' \
  | jq -r '.access_token')

# List customers
curl http://localhost:3001/api/netsuite/customer \
  -H "Authorization: Bearer $TOKEN"

# Get single customer
curl http://localhost:3001/api/netsuite/customer/1 \
  -H "Authorization: Bearer $TOKEN"

# Create customer
curl -X POST http://localhost:3001/api/netsuite/customer \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"companyName": "Test Corp", "email": "test@example.com"}'
```

---

## 8. Architecture Deep Dive

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           INPUT LAYER                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ OpenAPI      │  │ JSON Sample  │  │ API Docs URL │  │ Text Desc  │  │
│  │ Spec (YAML)  │  │              │  │              │  │            │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │
│         │                 │                 │                 │         │
└─────────┼─────────────────┼─────────────────┼─────────────────┼─────────┘
          │                 │                 │                 │
          ▼                 ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         PARSER LAYER                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ OpenAPI      │  │ JSON Schema  │  │ Large Docs   │  │ LLM        │  │
│  │ Parser       │  │ Parser       │  │ Parser       │  │ Inference  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │
│         │                 │                 │                 │         │
│         └────────────┬────┴─────────────────┴────────────────┘         │
│                      │                                                  │
│                      ▼                                                  │
│              ┌──────────────────┐                                       │
│              │ Unified Parser   │ ◄─── Auto-detection & routing         │
│              │ Interface        │                                       │
│              └────────┬─────────┘                                       │
│                       │                                                 │
└───────────────────────┼─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       SCHEMA LAYER                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                 ┌─────────────────────────────┐                         │
│                 │      ConnectorSchema        │                         │
│                 │  ─────────────────────────  │                         │
│                 │  • name, version, baseUrl   │                         │
│                 │  • auth: AuthConfig         │                         │
│                 │  • entities: Entity[]       │                         │
│                 │  • relationships: Rel[]     │                         │
│                 └─────────────┬───────────────┘                         │
│                               │                                         │
│          ┌────────────────────┼────────────────────┐                    │
│          │                    │                    │                    │
│          ▼                    ▼                    ▼                    │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐           │
│  │ Schema Cache  │    │ Zod Validator │    │ Helper Funcs  │           │
│  │ (TTL + gzip)  │    │ (Runtime)     │    │ (Topo sort)   │           │
│  └───────────────┘    └───────────────┘    └───────────────┘           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                        │
                        │
          ┌─────────────┼─────────────┐
          │             │             │
          ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       GENERATOR LAYER                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐        │
│  │ Schema Generator │ │ Route Generator  │ │ Data Generator   │        │
│  │ ──────────────── │ │ ──────────────── │ │ ──────────────── │        │
│  │ • PostgreSQL DDL │ │ • Express routes │ │ • Faker.js data  │        │
│  │ • FK constraints │ │ • CRUD endpoints │ │ • FK integrity   │        │
│  │ • Indexes        │ │ • Auth middleware│ │ • JSON/SQL/TS    │        │
│  │ • Triggers       │ │ • Service stubs  │ │ • Seeding        │        │
│  └────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘        │
│           │                    │                    │                   │
└───────────┼────────────────────┼────────────────────┼───────────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         OUTPUT LAYER                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐        │
│  │ migrations/      │ │ src/routes/      │ │ seeds/           │        │
│  │ ────────────────│  │ ──────────────── │ │ ──────────────── │        │
│  │ netsuite.sql    │ │ netsuite.ts      │ │ netsuite.json    │        │
│  │                 │ │ netsuiteService  │ │ netsuite.sql     │        │
│  │                 │ │ .ts              │ │ netsuite-seed.ts │        │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Design Patterns

| Pattern | Implementation | Benefit |
|---------|---------------|---------|
| **Unified Schema Contract** | All parsers produce `ConnectorSchema` | Interchangeable inputs |
| **Strategy Pattern** | Different parsers for different inputs | Extensibility |
| **Factory Pattern** | Unified parser auto-selects strategy | Simplified API |
| **Topological Sort** | Entity generation respects FK order | Data integrity |
| **Builder Pattern** | Generator options for customization | Flexible output |
| **Caching Layer** | File + memory cache with TTL | Performance |

### File Structure

```
src/
├── schema/
│   ├── connector-schema.ts      # Core type definitions
│   ├── parsers/
│   │   ├── index.ts             # Unified parser interface
│   │   ├── openapi-parser.ts    # OpenAPI/Swagger parser
│   │   ├── llm-inference-parser.ts
│   │   └── large-docs-parser/   # Multi-file ERP parser
│   ├── cache/
│   │   └── schema-cache.ts      # Caching layer
│   └── indexes/
│       └── netsuite-2025_2.json # Pre-built indexes
│
├── generators/
│   ├── schema-generator.ts      # SQL migration generator
│   ├── route-generator.ts       # Express route generator
│   └── data-generator.ts        # Synthetic data generator
│
├── services/
│   └── mock-server-manager.ts   # (PLANNED) Server lifecycle
│
└── templates/                   # (PLANNED) Industry templates
    ├── retail.json
    ├── saas.json
    └── healthcare.json

scripts/
├── generate-connector.ts        # CLI orchestrator
└── create-mock-server.ts        # (PLANNED) Interactive wizard

schemas/
└── netsuite.json                # Reference schema
```

---

## Appendix: Related Documentation

- [API Documentation](./API.md)
- [Development Guide](./DEVELOPMENT.md)
- [NetSuite Mock Server Schema](./netsuite-mock-server-schema.md)
- [NetSuite Technical Spec](./netsuite-mock-server-technical-spec.md)
- [Building Block Research](./2025-01-28-building-block-system-research.md)
- [Connector UI Redesign](../frontend/claudedocs/connector-ui-redesign.md)

---

**Document Version**: 1.0
**Created**: 2026-01-28
**Author**: AI Agent Development Team
**Status**: Living Document - Updates Expected
