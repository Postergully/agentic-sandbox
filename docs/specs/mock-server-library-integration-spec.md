# Mock Server Library Integration Specification

> **Document Status:** Draft v1.0
> **Created:** 2026-02-05
> **Last Updated:** 2026-02-05

---

## 1. Executive Summary

### 1.1 Problem Statement

The Agentic Sandbox factory currently creates **metadata** for mock server instances (registry entries, SSL certificates, PostgreSQL schemas) but does NOT create **functional mock APIs**. The MCP endpoint has hardcoded tools (`execute_sql`, `list_databases`, `list_tables`) rather than dynamically generated endpoints from API documentation.

**Current Gap:**
```
API Docs → Schema Inference → Registry Entry → ❌ NO DYNAMIC MOCK SERVER
```

**Required Flow:**
```
API Docs → Schema Inference → Route Generation → Data Generation → Dynamic Mock Server (MCP + REST)
```

### 1.2 Goals

1. **Dynamic Route Generation**: Auto-generate mock API endpoints from OpenAPI/schema definitions
2. **Production-Like Data**: Generate statistically coherent, industry-specific synthetic data
3. **Dual Protocol Support**: Both MCP (for AI agents) and REST (for traditional testing) with full parity
4. **Stateful CRUD**: Full persistence - POST creates, GET retrieves, PUT updates, DELETE removes
5. **Chaos Engineering**: Configurable error injection, latency, and edge cases
6. **Agent Behavior Parity**: Mock responses realistic enough that AI agents behave identically to production

### 1.3 Non-Goals (Out of Scope for MVP)

- Real data import/anonymization (generate from schema only)
- GraphQL/SOAP support (REST/OpenAPI only for MVP)
- Multi-version API support per instance
- Request inspection UI/dashboard
- Distributed/multi-region deployment

---

## 2. User Personas & Use Cases

### 2.1 Primary Personas

| Persona | Description | Key Needs |
|---------|-------------|-----------|
| **AI Agent Developer** | Building/testing AI agents (Claude Cowork, custom) | MCP tools that match production APIs, realistic data |
| **QA Engineer** | Testing integration flows | REST endpoints, chaos injection, edge cases |
| **Platform Engineer** | Setting up test environments | Multi-instance management, automation, CI/CD integration |

### 2.2 Industry Contexts

The system must support industry-specific data generation:
- **Finance**: Realistic transactions, account numbers, compliance-aware data
- **Media/Entertainment**: Content metadata, user engagement patterns
- **Technology**: SaaS metrics, API usage patterns
- **Healthcare**: Anonymized patient flows, appointment scheduling
- **Retail**: Order histories, inventory levels, customer segments

### 2.3 Core Use Cases

**UC1: Create Mock Server from API Docs**
```
Actor: Platform Engineer
Flow:
1. Provide connector name + API docs URL
2. System infers schema, generates data, provisions mock
3. System outputs credentials (URL, client_id, client_secret)
4. Engineer copies credentials into AI agent config
```

**UC2: AI Agent Workflow Testing**
```
Actor: AI Agent Developer
Flow:
1. Configure agent with mock server MCP URL
2. Agent connects, discovers tools via MCP protocol
3. Agent executes multi-step workflow (query → create → update)
4. Changes persist, subsequent queries reflect mutations
```

**UC3: Chaos Testing**
```
Actor: QA Engineer
Flow:
1. Enable chaos mode on mock instance
2. Configure error rates (10% 500 errors, 5% timeouts)
3. Run integration tests
4. Verify agent handles failures gracefully
```

---

## 3. Functional Requirements

### 3.1 Dynamic Route Generation

**FR-001**: System SHALL auto-generate REST endpoints from OpenAPI/ConnectorSchema
- Each entity → CRUD endpoints (GET list, GET by ID, POST, PUT, DELETE)
- Query parameters from schema (filters, pagination, sorting)
- Request/response validation against schema

**FR-002**: System SHALL auto-generate MCP tools from OpenAPI operations
- Each operation → MCP tool with semantic name
- Tool input schema from request body/params
- Tool output schema from response definition
- Hybrid approach: auto-generate defaults, allow manual overrides

**FR-003**: System SHALL support connector-specific URL patterns
- Snowflake: `https://{org}-{account}.snowflakecomputing.com`
- NetSuite: `https://{account}.suitetalk.api.netsuite.com`
- Google: `https://www.googleapis.com/{service}/v1`

### 3.2 Data Generation

**FR-004**: System SHALL generate statistically coherent synthetic data
- Referential integrity across entities (FK relationships)
- Realistic distributions (not uniform random)
- Industry-specific patterns (finance, media, tech, etc.)

**FR-005**: System SHALL support multiple data generation engines
- **Primary**: SDV (Synthetic Data Vault) for relational coherence
- **Secondary**: Gretel.ai for privacy-safe generation
- **Fallback**: Faker.js for simple fields
- **Enhancement**: LLM (Claude) for business-realistic context

**FR-006**: System SHALL generate data from schema only (no real data import)

### 3.3 Stateful Operations

**FR-007**: System SHALL persist all mutations to PostgreSQL
- POST creates new record with generated ID
- PUT/PATCH updates existing record
- DELETE removes record (soft or hard delete configurable)
- GET reflects current state including mutations

**FR-008**: System SHALL maintain referential integrity on mutations
- Cannot delete parent with existing children (unless cascade)
- FK validation on create/update

### 3.4 Authentication

**FR-009**: System SHALL accept any valid-format token (permissive mode)
- Bearer tokens accepted without validation
- OAuth flows simulated but not enforced
- Focus on API testing, not auth testing

**FR-010**: System SHALL generate mock credentials per instance
- client_id: `mock-{connector}-{org}-{job}`
- client_secret: randomly generated
- Token endpoint returns valid JWT structure

### 3.5 Chaos Engineering

**FR-011**: System SHALL support configurable error injection
- HTTP errors: 400, 401, 403, 404, 429, 500, 502, 503
- Configurable rate per error type (e.g., 5% 500 errors)
- Per-endpoint or global configuration

**FR-012**: System SHALL support latency injection
- Fixed delay (e.g., +500ms)
- Random delay (e.g., 100-2000ms)
- Per-endpoint configuration

**FR-013**: System SHALL support data anomalies
- Null fields at configurable rate
- Type mismatches (string where number expected)
- Malformed JSON responses
- Truncated responses

### 3.6 Pagination

**FR-014**: System SHALL implement cursor-based pagination matching real API patterns
- Opaque cursor tokens (base64 encoded)
- Configurable page size (default: 100)
- Total count in response metadata
- Match connector's native pagination style

### 3.7 Protocol Parity

**FR-015**: MCP and REST SHALL have full feature parity
- Every REST endpoint accessible via MCP tool
- Every MCP tool accessible via REST endpoint
- Identical data returned regardless of protocol

---

## 4. Non-Functional Requirements

### 4.1 Performance

**NFR-001**: Mock API response time SHALL be < 50ms for simple operations
- List endpoints with < 1000 records: < 50ms
- Single record GET/PUT/DELETE: < 20ms
- Complex queries may exceed but should warn

**NFR-002**: Data generation SHALL complete within:
- 1,000 records: < 30 seconds
- 10,000 records: < 3 minutes
- 100,000 records: < 15 minutes

### 4.2 Scalability

**NFR-003**: System SHALL support 100+ concurrent mock instances
- PostgreSQL schema isolation per instance
- Shared Express server with instance routing
- Design for horizontal scaling (future)

**NFR-004**: System SHALL handle 1000 requests/second per instance
- Connection pooling
- Prepared statements
- Response caching for read-heavy patterns

### 4.3 Reliability

**NFR-005**: Mock server SHALL have 99.9% uptime for cloud deployment
- Health checks
- Graceful degradation
- Automatic restart on crash

### 4.4 Observability

**NFR-006**: System SHALL log all requests with:
- Timestamp, method, path, status code
- Instance ID, request ID
- Response time
- Error details if applicable

### 4.5 Security

**NFR-007**: Generated data SHALL NOT contain real PII
- All synthetic, never derived from production
- No credential leakage in responses

**NFR-008**: Instance isolation SHALL prevent cross-instance data access
- PostgreSQL schema separation
- Instance ID validation on every request

---

## 5. Technical Architecture

### 5.1 Component Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              MOCK SERVER FACTORY                                 │
│                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Factory    │───►│   Schema     │───►│    Data      │───►│   Dynamic    │  │
│  │    CLI/API   │    │   Inferrer   │    │  Generator   │    │ Mock Server  │  │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │                   │           │
│         │                   │                   │                   │           │
│         ▼                   ▼                   ▼                   ▼           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Registry   │    │  OpenAPI/    │    │  SDV/Gretel/ │    │  Prism +     │  │
│  │  (PostgreSQL)│    │  LLM Parser  │    │  Faker/LLM   │    │  Custom Data │  │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         PROTOCOL LAYER                                    │   │
│  │  ┌─────────────────────────┐    ┌─────────────────────────────────────┐  │   │
│  │  │      MCP Server         │    │         REST Server                 │  │   │
│  │  │  (JSON-RPC 2.0)         │◄──►│      (Express + OpenAPI)            │  │   │
│  │  │  - tools/list           │    │      - Auto-generated routes        │  │   │
│  │  │  - tools/call           │    │      - Request validation           │  │   │
│  │  │  - resources/list       │    │      - Response shaping             │  │   │
│  │  └─────────────────────────┘    └─────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         INSTANCE ROUTER                                   │   │
│  │  Route: /{instance_id}/api/... → Instance's PostgreSQL schema             │   │
│  │  Route: /{instance_id}/mcp     → Instance's MCP tools                     │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Recommended Libraries

| Component | Recommended Library | Rationale |
|-----------|---------------------|-----------|
| **Route Generation** | `openapi-backend` | TypeScript native, allows custom handlers, validates requests |
| **Request Validation** | `ajv` (via openapi-backend) | Fast JSON schema validation |
| **Response Generation** | Custom + Prism reference | Generate from PostgreSQL data, validate against schema |
| **MCP Protocol** | Custom implementation | Thin layer over REST, translate tools to endpoints |
| **Data Generation** | `SDV` (Python) | Relational coherence, statistical modeling |
| **Data Generation** | `Gretel` (Python) | Privacy-safe, high quality |
| **Data Generation** | `@faker-js/faker` | Simple fields, fallback |
| **Data Generation** | Claude API | Business context, industry-specific |
| **HTTP Server** | Express.js | Already in use, mature |
| **Database** | PostgreSQL | Already in use, schema isolation |
| **Python Bridge** | `python-shell` or microservice | For SDV/Gretel integration |

### 5.3 Data Flow

```
1. CREATE INSTANCE
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │  API Docs   │────►│   Schema    │────►│    Data     │────►│  PostgreSQL │
   │  (URL/File) │     │  Inference  │     │  Generator  │     │   Schema    │
   └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                              │                   │                    │
                              ▼                   ▼                    ▼
                       ConnectorSchema      JSON Data Files      Tables + Data

2. SERVE REQUESTS
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │  MCP/REST   │────►│  Instance   │────►│  OpenAPI    │────►│  PostgreSQL │
   │   Request   │     │   Router    │     │  Backend    │     │    Query    │
   └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                              │                   │                    │
                              ▼                   ▼                    ▼
                       instance_id         Validation +          Data +
                       extraction          Handler Dispatch      Response
```

### 5.4 Instance Isolation Strategy

**Recommended: PostgreSQL Schema per Instance**

```sql
-- Each instance gets isolated schema
CREATE SCHEMA netsuite_sharechat_331;
CREATE SCHEMA snowflake_acme_456;

-- Tables within schema
netsuite_sharechat_331.customers
netsuite_sharechat_331.invoices
snowflake_acme_456.databases
snowflake_acme_456.tables
```

**Routing:**
```typescript
// Extract instance from URL
// GET /netsuite_sharechat_331/api/v1/customers
const instanceId = req.params.instanceId;
const schema = await registry.get(instanceId).pgSchema;

// Query with schema
db.query(`SELECT * FROM ${schema}.customers WHERE ...`);
```

### 5.5 MCP-REST Bridge

```typescript
// MCP tool call translates to REST operation
{
  "method": "tools/call",
  "params": {
    "name": "list_customers",
    "arguments": { "limit": 10 }
  }
}

// Translates to:
// GET /api/v1/customers?limit=10

// Response wrapped as MCP content:
{
  "content": [{
    "type": "text",
    "text": "{\"customers\": [...], \"pagination\": {...}}"
  }]
}
```

---

## 6. MVP Scope

### 6.1 MVP Connectors

| Connector | Priority | Complexity | Notes |
|-----------|----------|------------|-------|
| **Snowflake** | P0 | Medium | SQL API, existing partial implementation |
| **NetSuite** | P0 | High | REST API, 72 entities in schema |
| **Google Workspace** | P0 | High | Drive, Sheets, Docs, Calendar, Gmail |

### 6.2 MVP Features

| Feature | In MVP | Notes |
|---------|--------|-------|
| Dynamic REST route generation | ✅ | From OpenAPI/ConnectorSchema |
| Dynamic MCP tool generation | ✅ | From REST endpoints |
| PostgreSQL stateful persistence | ✅ | Full CRUD |
| SDV data generation | ✅ | Relational coherence |
| Faker.js fallback | ✅ | Simple fields |
| LLM enhancement | ✅ | Industry context |
| Cursor-based pagination | ✅ | Match real APIs |
| Basic chaos (HTTP errors) | ✅ | Configurable rates |
| Latency injection | ✅ | Fixed/random delays |
| Multi-instance support | ✅ | Schema isolation |
| Semi-automated connector onboarding | ✅ | Human review step |
| Request logging | ✅ | Basic observability |
| AWS cloud deployment | ✅ | With local dev mode |

### 6.3 Post-MVP Features

| Feature | Priority | Notes |
|---------|----------|-------|
| Request inspection UI | P1 | Web dashboard |
| GraphQL support | P1 | After REST stable |
| Full trace correlation | P2 | OpenTelemetry |
| Multi-version APIs | P2 | Per-instance versioning |
| Auto-scaling | P2 | Kubernetes/ECS |

---

## 7. Data Generation Pipeline

### 7.1 Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DATA GENERATION PIPELINE                               │
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐  │
│  │ Connector    │───►│    SDV       │───►│   Gretel     │───►│  Output  │  │
│  │   Schema     │    │  (Relations) │    │ (Enhancement)│    │  (JSON)  │  │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────┘  │
│         │                   │                   │                  │        │
│         ▼                   ▼                   ▼                  ▼        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐  │
│  │  Generation  │    │  Synthetic   │    │  Enhanced    │    │  Load to │  │
│  │    Brief     │    │   Tables     │    │   Quality    │    │ PostgreSQL│  │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────┘  │
│                                                                              │
│  Fallback: Faker.js for unsupported field types                             │
│  Enhancement: Claude API for business-realistic context                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Generation Brief Integration

The GenerationBrief (from `docs/datagen-pipeline.md`) drives data generation:

```typescript
interface GenerationBrief {
  jobId: string;
  orgId: string;
  connectors: [{
    name: "netsuite",
    entities: [
      { name: "customer", estimatedVolume: 500 },
      { name: "invoice", estimatedVolume: 2000 }
    ],
    relationships: [
      { from: "invoice", to: "customer", type: "many-to-one" }
    ]
  }],
  metadata: {
    industry: "media",
    companySize: "startup",
    region: "APAC"
  }
}
```

### 7.3 Python Service Architecture

**Recommended: Separate Python Microservice**

```
┌─────────────────┐         ┌─────────────────┐
│   Node.js       │  HTTP   │   Python        │
│   Factory       │────────►│   Data Gen      │
│                 │         │   Service       │
└─────────────────┘         └─────────────────┘
                                    │
                            ┌───────┴───────┐
                            │               │
                         ┌──▼──┐        ┌──▼──┐
                         │ SDV │        │Gretel│
                         └─────┘        └─────┘
```

**API Contract:**
```
POST /generate
Body: GenerationBrief
Response: { jobId, statusUrl }

GET /status/{jobId}
Response: { status, progress, outputPath }

GET /output/{jobId}
Response: Generated JSON files
```

---

## 8. Connector Onboarding Workflow

### 8.1 Semi-Automated Process

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    NEW CONNECTOR ONBOARDING                                  │
│                                                                              │
│  Step 1: Input                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  • Connector name (e.g., "hubspot")                                   │   │
│  │  • API docs URL or OpenAPI spec file                                  │   │
│  │  • Auth type hint (oauth2, apikey, etc.)                              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│  Step 2: Auto-Inference                                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  • Parse OpenAPI spec (if available)                                  │   │
│  │  • LLM inference for missing parts                                    │   │
│  │  • Generate draft ConnectorSchema                                     │   │
│  │  • Generate draft MCP tool definitions                                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│  Step 3: Human Review                                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  • Review generated schema (entities, fields, types)                  │   │
│  │  • Verify endpoint mappings                                           │   │
│  │  • Adjust MCP tool names for semantic clarity                         │   │
│  │  • Add business rules for data generation                             │   │
│  │  • Approve or request re-inference                                    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│  Step 4: Activation                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  • Save ConnectorSchema to schemas/{connector}.json                   │   │
│  │  • Register as {connector}_original in registry                       │   │
│  │  • Generate sample data                                               │   │
│  │  • Test MCP and REST endpoints                                        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Deployment Architecture

### 9.1 Local Development

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOCAL DEVELOPMENT                             │
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │   Node.js   │    │  PostgreSQL │    │  Python Data Gen    │  │
│  │   Server    │    │   (Docker)  │    │     (Docker)        │  │
│  │  Port 3002  │    │  Port 5432  │    │    Port 8000        │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
│         │                  │                     │               │
│         └──────────────────┴─────────────────────┘               │
│                            │                                     │
│                    docker-compose.yml                            │
│                                                                  │
│  HTTPS: mkcert certificates + /etc/hosts                         │
│  URL: https://mockorg-mockaccount.snowflakecomputing.com         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 AWS Cloud Deployment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AWS DEPLOYMENT                                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Route 53 (DNS)                                │    │
│  │   *.mock.agentic-sandbox.com → ALB                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                   Application Load Balancer                          │    │
│  │                   (SSL termination, routing)                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                               │
│          ┌───────────────────┼───────────────────┐                          │
│          ▼                   ▼                   ▼                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │   ECS/EC2    │    │   RDS        │    │   ECS/EC2    │                   │
│  │  Node.js     │    │  PostgreSQL  │    │  Python      │                   │
│  │  Mock Server │    │              │    │  Data Gen    │                   │
│  └──────────────┘    └──────────────┘    └──────────────┘                   │
│                                                                              │
│  Optional: ElastiCache (Redis) for response caching                         │
│  Optional: S3 for generated data file storage                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Open Questions

| # | Question | Impact | Suggested Resolution |
|---|----------|--------|----------------------|
| 1 | Should MCP tool names be auto-generated or manually curated? | UX for AI agents | Hybrid: auto-gen with override capability |
| 2 | Hot-reload of mock definitions? | Dev experience | Start with recreate, add hot-reload post-MVP |
| 3 | How to handle Google OAuth scopes in mock? | Auth realism | Accept any scope, return mock tokens |
| 4 | Gretel vs SDV vs both? | Data quality vs complexity | Start with SDV, add Gretel for specific use cases |
| 5 | Container per instance vs shared server? | Isolation vs resources | Shared server with schema isolation for MVP |

---

## 11. Success Criteria

### 11.1 MVP Success Metrics

| Metric | Target |
|--------|--------|
| Snowflake mock: AI agent completes query workflow | ✅ Pass |
| NetSuite mock: AI agent creates invoice | ✅ Pass |
| Google Workspace mock: AI agent lists Drive files | ✅ Pass |
| Response time < 50ms | ✅ Pass |
| Data generation < 3 min for 10K records | ✅ Pass |
| Zero manual route coding per connector | ✅ Pass |

### 11.2 Quality Bar

> **"An AI agent connected to the mock server should behave identically to one connected to production, except faster."**

---

## 12. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Integrate `openapi-backend` for route generation
- [ ] Build MCP-REST bridge layer
- [ ] Implement instance router
- [ ] Refactor Snowflake to use dynamic routes

### Phase 2: Data Generation (Week 3-4)
- [ ] Build Python data generation microservice
- [ ] Integrate SDV for relational data
- [ ] Add Faker.js fallback
- [ ] Wire GenerationBrief → Data Gen → PostgreSQL

### Phase 3: Connectors (Week 5-6)
- [ ] Complete Snowflake end-to-end
- [ ] Complete NetSuite end-to-end
- [ ] Complete Google Workspace (Drive, Sheets, Docs)

### Phase 4: Polish (Week 7-8)
- [ ] Chaos engineering features
- [ ] Cursor-based pagination
- [ ] Request logging
- [ ] AWS deployment
- [ ] Documentation

---

## Appendix A: Existing Code to Preserve

| Component | Path | Status |
|-----------|------|--------|
| CLI commands | `src/cli/` | Keep, enhance |
| Registry service | `src/services/registryService.ts` | Keep |
| SSL/DNS service | `src/services/sslDnsService.ts` | Keep |
| Schema inferrer | `src/services/schemaInferrerService.ts` | Keep, integrate with route gen |
| Schema parsers | `src/schema/parsers/` | Keep |

## Appendix B: Code to Replace/Refactor

| Component | Current | Future |
|-----------|---------|--------|
| MCP routes | Hardcoded 3 tools | Dynamic from schema |
| Snowflake routes | Manual Express routes | openapi-backend generated |
| Data loading | Manual seed SQL | Data gen pipeline |
| Instance routing | Global routes | Per-instance routing |

---

*End of Specification*
