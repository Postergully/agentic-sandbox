# Project Summary — 2026-02-16

## Quick Start

### Prerequisites
```bash
# 1. Copy env file
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY for LLM-based schema inference

# 2. Start infrastructure (PostgreSQL + Redis + WireMock)
npm run docker:up
# Wait for healthy: docker ps  →  postgres (5432), redis (6379), wiremock (8080)

# 3. Run migrations (auto-runs on first docker:up via init scripts, but manually if needed)
psql -U agentic_user -d agentic_sandbox -f migrations/006_mock_server_registry.sql
```

### CLI Commands

```bash
# ── Create a mock server from API docs URL (full pipeline) ──
npm run cli -- create -c <connector> -o <orgId> --api-docs <url>

# Example: NetSuite from default schema (skips Stage 1)
npm run cli -- create -c netsuite -o acme

# Example: From a URL (runs full Stage 1 → 5 pipeline)
npm run cli -- create -c petstore -o testorg --api-docs https://petstore3.swagger.io/api/v3/openapi.json

# Example: From a local schema file (skips Stage 1)
npm run cli -- create -c snowflake -o demo --schema schemas/snowflake.json

# ── Other commands ──
npm run cli -- list                    # List all instances
npm run cli -- info <instanceId>       # Show instance details
npm run cli -- delete <instanceId>     # Remove an instance
npm run cli -- status <jobId>          # Check pipeline status
npm run cli -- validate --schema <path> # Validate a schema file
npm run cli -- generate --brief <path>  # Generate data from brief
```

### Key Flags
| Flag | Purpose |
|------|---------|
| `-c, --connector` | Connector type: netsuite, snowflake, google-drive |
| `-o, --org` | Organization ID (used in instance naming) |
| `-a, --api-docs <url>` | URL to API docs → triggers full Stage 1 inference |
| `-s, --schema <path>` | Path to ConnectorSchema JSON → skips Stage 1 |
| `-i, --industry` | Industry context for data generation (default: technology) |
| `-n, --volume` | Records per entity (default: 100) |
| `--skip-data` | Skip Stage 3 (data generation) |
| `--skip-wiremock` | Skip Stage 4 (WireMock setup) |
| `--skip-ssl` | Skip SSL/DNS auto-configuration |
| `--dry-run` | Preview without executing |

---

## What's Built & Ready to Test

### Pipeline Stages (all 5 built)

| Stage | Component | Status | What It Does |
|-------|-----------|--------|--------------|
| **1** | Schema Inference | **Ready** | URL → fetch → detect OpenAPI → parse or LLM agent |
| **2** | OpenAPI Generation | **Ready** | ConnectorSchema → OpenAPI 3.0.3 YAML |
| **3** | Data Generation | **Ready** | Tonic Fabricate → Faker.js → LLM fallback chain |
| **4** | WireMock Setup | **Ready** | Generate stubs, load data, stateful CRUD |
| **5** | Registry + Creds | **Ready** | Register instance, generate mock credentials |

### Schema Inference Paths (Stage 1)

| Input | Route | LLM Required? |
|-------|-------|---------------|
| `--api-docs <openapi-url>` | Fetch → detect OpenAPI → OpenAPI Parser | No |
| `--api-docs <non-openapi-url>` | Fetch → detect → LLM Agent Parser (5 iter max) | Yes (ANTHROPIC_API_KEY) |
| `--schema <file>` | Load JSON directly → skip Stage 1 | No |
| No flags | Load `schemas/{connector}.json` default → skip Stage 1 | No |

### Available Default Schemas
- `schemas/netsuite.json` — 12 entities (customers, invoices, etc.)
- `schemas/snowflake.json` — Snowflake warehouse schema
- `schemas/snowflake-openapi.yaml` — Snowflake OpenAPI spec

### Infrastructure
| Service | Port | Status |
|---------|------|--------|
| PostgreSQL | 5432 | Docker (docker-compose) |
| Redis | 6379 | Docker (docker-compose) |
| WireMock | 8080 | Docker (docker-compose) |
| Express API | 3000 | `npm run dev` |

---

## Test Plan: End-to-End CLI Pipeline

### Test 1: Default Schema (no network, no LLM)
```bash
npm run cli -- create -c netsuite -o testorg --skip-ssl
```
Expected: Loads `schemas/netsuite.json` → Stage 2-5 execute → instance registered.

### Test 2: OpenAPI URL (no LLM needed)
```bash
npm run cli -- create -c petstore -o demo --api-docs https://petstore3.swagger.io/api/v3/openapi.json --skip-ssl
```
Expected: Fetches URL → detects OpenAPI → OpenAPI Parser → Stage 2-5 → instance created.

### Test 3: Non-OpenAPI URL (needs ANTHROPIC_API_KEY)
```bash
npm run cli -- create -c stripe -o demo --api-docs https://docs.stripe.com/api --skip-ssl
```
Expected: Fetches URL → not OpenAPI → LLM Agent Parser → schema extraction → Stage 2-5.

### Test 4: Schema file path
```bash
npm run cli -- create -c snowflake -o demo --schema schemas/snowflake.json --skip-ssl
```
Expected: Loads file directly → Stage 2-5 → instance registered.

### Test 5: Dry run
```bash
npm run cli -- create -c netsuite -o drytest --dry-run
```
Expected: Shows what would be created without executing.

---

## Dependencies for Testing

| Requirement | Needed For | How to Check |
|-------------|-----------|--------------|
| Docker running | PostgreSQL, Redis, WireMock | `docker ps` shows 3 containers |
| `.env` file | All tests | `cp .env.example .env` |
| `ANTHROPIC_API_KEY` in `.env` | Test 3 only (LLM inference) | Set in `.env` |
| Network access | Tests 2, 3 (URL fetch) | Internet connectivity |
| Migration 006 | Registry table | Auto-runs or manual `psql -f migrations/006...` |

---

## Output Structure (per pipeline run)

```
output/{jobId}/
├── schemas/
│   ├── {connector}_schema.json    # ConnectorSchema
│   └── {connector}_openapi.yaml   # Generated OpenAPI 3.0.3
├── data/
│   └── {connector}/
│       └── {entity}.json          # Generated records
├── credentials/
│   └── {connector}_creds.json     # Mock OAuth credentials
└── status.json                    # Pipeline progress tracker
```

---

## Phase Completion Status

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | WireMock + Specmatic + OpenAPI converter + stubs + CRUD + chaos | **COMPLETE** |
| **Phase 2** | Tonic Fabricate + Faker + LLM generators + orchestrator + CLI | **COMPLETE** |
| **Phase 3** | Snowflake (15/15), NetSuite (17/17), Google Workspace (partial) | **In Progress** |
| **Phase 4** | Polish — fork CLI, dashboard, monitoring | **Not Started** |
| **Self-Healing** | URL Content Detector + LLM Agent Parser | **COMPLETE** |

---

## Today's Session Goals

- [x] Start Docker infrastructure (`npm run docker:up`) — postgres (5432), wiremock (8080), redis (6379 existing)
- [x] Create `.env` from `.env.example` — port changed to 3001 (3000 taken by pipeshub)
- [x] **Test 1**: SpotDraft API docs URL — full pipeline E2E
- [x] Fix issues found during testing (Issue #1: HTML detection, Issue #2: short-circuit + semver)
- [x] Re-test after fixes — all 5 stages pass
- [x] Document results below

---

## Session Log

### 2026-02-16

**Updated HTML visualization** (`docs/factory-cli-pipeline-explorer.html`):
- 5 node status updates: `db-hash`, `manifest`, `lc-health`, `lc-error` → built; `lc-fork` → modify
- 3 new nodes: URL Content Detector, Data Gen Orchestrator, Generation Brief
- Zero `st:'new'` nodes remain — all built or modify
- All y-coordinates adjusted, connections and views updated

**Next**: End-to-end CLI testing with API URL input.

**Fixed Issue #2** — URL content detection short-circuit:
- 3 code changes in `parsers/index.ts` and `openapi-parser.ts`
- SpotDraft pipeline now passes all 5 stages (schema_inference → openapi_generation → data_generation → wiremock_setup → registry_credentials)
- Output at `output/fecd105c/` — 3 entities, OpenAPI 3.0.3 YAML, mock credentials

---

## Test Issues

### Issue #1: HTML docs page URL causes Stage 1 failure — URL Content Detector cannot handle HTML

- **Test**: `npm run cli -- create -c spotdraft -o testorg --api-docs https://api.spotdraft.com/api/docs/`
- **Error**: `Schema inference failed: "https://api.spotdraft.com/api/docs/" is not a valid JSON Schema`
- **Root Cause**: The URL `https://api.spotdraft.com/api/docs/` returns an **HTML page** (Redoc/drf-yasg docs viewer), not raw JSON/YAML. The current pipeline flow is:
  1. `detectInputType()` sees a URL without OpenAPI markers → returns `type: 'url', suggestedParser: 'llm'`
  2. `fetchAndDetectContent()` fetches the URL → gets HTML → **cannot parse as JSON/YAML** → `parsedContent` is null
  3. Falls through to the `llm` switch case which calls `inferSchemaFromText()` with the raw URL string
  4. `inferSchemaFromText()` tries to validate the URL string as JSON Schema → fails

  The **core gap**: when a URL returns HTML (which is the most common case for API documentation pages like Redoc, Swagger UI, ReadTheDocs), the pipeline has no handler. It should:
  - Recognize the HTML is a docs page
  - Find the actual OpenAPI spec URL embedded in the page (e.g., `?format=openapi` for drf-yasg, or the `spec-url` attribute in Redoc)
  - Fetch the real spec and continue the pipeline

- **Fix Options**:
  - **Option A: HTML-aware URL Content Detector** — Enhance `url-content-detector.ts` to handle HTML responses. When HTML is detected, parse it to find embedded OpenAPI spec URLs (common patterns: Redoc `spec-url`, Swagger UI `url` param, drf-yasg `?format=openapi`/`?format=json`, links to `.yaml`/`.json` files). Then re-fetch the discovered spec URL and continue. *Pros*: Handles the most common real-world case (user gives docs page URL). Deterministic, no LLM cost. *Cons*: Needs pattern matching for various doc frameworks.*
  - **Option B: LLM Agent handles HTML** — Pass the HTML content to the LLM Agent Parser and let it figure out the spec URL or extract schema from the HTML. *Pros*: More flexible, handles unknown doc formats. *Cons*: LLM cost per invocation, slower, may hallucinate.*
  - **Option C: Layered approach (A then B)** — First try deterministic HTML parsing (Option A). If no spec URL found, fall back to LLM Agent with the HTML content summary. *Pros*: Best of both — fast when patterns match, intelligent fallback. *Cons*: More code, but follows existing self-healing pattern.*

- **Recommended**: Option C — matches the existing self-healing pipeline architecture (deterministic first, LLM fallback)
- **Chosen Fix**: Option C — Layered approach (deterministic HTML parsing → LLM fallback)
- **Implementation**: Added `extractSpecUrlFromHTML()` + `isHTMLContent()` to `url-content-detector.ts`, updated `parsers/index.ts` routing with 3 new branches (spec URL found → re-fetch, HTML no spec → LLM agent, non-HTML fallback). TypeScript compiles clean.
- **Status**: Implemented but blocked by Issue #2

### Issue #2: URL Content Detection Short-Circuit — pre-fetched content thrown away

- **Test**: Same command as Issue #1 — re-run after Issue #1 fix
- **Error**: `Schema inference failed: "https://api.spotdraft.com/api/docs/" is not a valid JSON Schema`
- **Key Discovery**: `curl` with our `Accept: application/json` header returns **raw Swagger 2.0 YAML** (not HTML). The URL content detector correctly fetches/parses this and sets `isOpenAPI=true, confidence=0.99`. But the detected content was **thrown away** — the code only set `parserToUse = 'openapi'` and fell through to the switch case, which re-fetched via `swagger-parser` with different `Accept` headers → server returned HTML → parse failure.
- **Root Cause** (3 issues in `src/schema/parsers/index.ts`):
  1. Lines 373-378: URL detection found OpenAPI but only set `parserToUse` and fell through — content discarded
  2. Line 440: Same bug in the discovered-spec-URL branch (also re-fetched via `parseOpenAPI(url)`)
  3. Pre-fetched Swagger 2.0 content needs `SwaggerParser.dereference()` for `$ref` resolution before `parseDocument()`
- **Additional Issue**: SpotDraft spec has `info.version: "v1"` (not semver) → ConnectorSchema validation rejected it
- **Fix** (3 files):
  - `src/schema/parsers/index.ts` — Import `SwaggerParser`, short-circuit both OpenAPI branches to dereference + parse pre-fetched content directly (no re-fetch)
  - `src/schema/parsers/openapi-parser.ts` — Added `toSemver()` helper to normalize non-semver versions (`v1` → `1.0.0`)
- **Verification**:
  ```bash
  npm run cli -- create -c spotdraft -o testorg --api-docs https://api.spotdraft.com/api/docs/ --skip-ssl
  # ✅ All 5 stages passed
  # ✅ schema_inference: 1997ms — 3 entities from Swagger 2.0
  # ✅ openapi_generation: 6ms — OpenAPI 3.0.3 YAML generated
  # ✅ data_generation: 4ms
  # ✅ wiremock_setup: 2636ms — stubs loaded
  # ✅ registry_credentials: 15ms — mock credentials generated
  ```
- **Output**: `output/fecd105c/` — schema, OpenAPI YAML, credentials
- **Status**: ✅ Fixed

### Known Limitation: SpotDraft entity extraction is shallow

The Swagger 2.0 spec groups all endpoints under top-level path prefixes (`/v1/`, `/v2.1/`, `/v2/`), which the OpenAPI parser maps as 3 entities (`V1`, `V2.1`, `V2`) with only an `id` field each. The real entities (contracts, templates, obligations, etc.) are nested inside these path groups. This is a schema-extraction quality issue, not a pipeline failure — the pipeline completes correctly. Deeper extraction would require either:
- Enhanced OpenAPI parser that extracts entities from response schemas, not just path grouping
- LLM Agent Parser (use `--force-parser llm-agent` to try, requires `ANTHROPIC_API_KEY`)

---

## Pipeline Quality Analysis — What Each Stage Actually Does & Gaps

### SpotDraft Test Run Results (`output/fecd105c/`)

| Stage | Time | Output | Assessment |
|-------|------|--------|------------|
| **1. Schema Inference** | 1997ms | `schemas/spotdraft_schema.json` (1.2KB) | **Shallow** — 3 entities (`V1`, `V2.1`, `V2`) with only `id` fields. Version prefix collapsed real resources. |
| **2. OpenAPI Generation** | 6ms | `schemas/spotdraft_openapi.yaml` (11.9KB) | **Correct but shallow** — CRUD endpoints generated for all 3 entities, but entities only have `id` field. |
| **3. Data Generation** | 4ms | `data/` (empty) | **Failed silently** — "Failed to load connector schema" because `schemas/spotdraft.json` doesn't exist. No data produced. |
| **4. WireMock Setup** | 2636ms | Stubs imported via admin API | **Worked** — mappings loaded but serve empty/minimal data since Stage 3 produced nothing. |
| **5. Registry + Creds** | 15ms | `credentials/spotdraft_creds.json` | **Correct** — Instance registered, mock OAuth credentials generated. |

---

### Issue #3: Shallow Entity Extraction — Version-Prefix Path Collapse

**Root Cause**: `extractEntityNameFromPath()` in `openapi-parser.ts:201-225` uses **only the first path segment** as the entity name.

For SpotDraft paths like:
```
/v1/public/contracts/        → segments[0] = 'v1'  → Entity: "V1"
/v1/public/templates/        → segments[0] = 'v1'  → Entity: "V1"  (merged!)
/v2.1/public/obligations/    → segments[0] = 'v2.1' → Entity: "V2.1"
```

All endpoints under the same version prefix collapse into **one entity**, losing `contracts`, `templates`, `obligations` as distinct resources. The entity dedup at lines 419-435 merges them because they share the same extracted name.

**Impact**: Only 3 entities with 1 field (`id`) each instead of ~15+ entities with full field definitions from the response schemas.

**Fix Required — LLM Quality Gate**: After OpenAPI parsing completes, an LLM quality check should assess the extracted schema:

1. **Detect shallow entities** — any entity with < 3 fields is suspicious
2. **Detect version-prefix collapse** — all entity names start with `v1`, `v2` etc.
3. **Enrich or re-extract** — either fix `extractEntityNameFromPath()` to skip version prefixes and use deeper path segments, or re-route to LLM Agent Parser for semantic extraction

**Proposed insertion point**: `src/schema/parsers/index.ts` after line 611 (post-OpenAPI parsing, pre-`finalizeResult`):
```
parseDocument() → qualityCheck(schema, originalSpec) → if shallow: re-extract or enrich → finalizeResult()
```

**Quality check criteria**:
- Entity has ≤ 2 fields → flag as shallow
- All entity names match `/^v\d/` pattern → flag as version-prefix collapse
- Endpoint count vs entity count ratio is very high → merged entities likely
- Schema definitions exist in spec but weren't extracted → field enrichment needed

---

### Issue #4: Data Generation Stage Fails Silently — Schema File Not Found

**Root Cause**: `dataGenerationService.ts:86-92` tries to load `schemas/{connectorName}.json` from disk. For new connectors created via `--api-docs` URL, this file doesn't exist — the schema lives only in the pipeline's in-memory `ConnectorSchema` object. The service logs "Failed to load connector schema", skips the connector, and produces empty `data/` with no error thrown to the user.

**Why this happens**: Stage 1 infers the schema into memory and saves it to `output/{jobId}/schemas/spotdraft_schema.json`, but Stage 3's data generation service looks for `schemas/spotdraft.json` in the project root — a different location.

**Fix Required**: Two changes needed:
1. **Pass schema in-memory** — `factoryPipelineService.ts` should pass the Stage 1 `ConnectorSchema` object directly to Stage 3, not rely on a file lookup
2. **Or save schema to expected location** — After Stage 1, write schema to `schemas/{connector}.json` so Stage 3 can find it

**Additionally — Interactive Brief Collection**: When no `GenerationBrief` is provided (normal CLI usage), the pipeline should interactively ask the user for context to generate realistic data:

```
┌──────────────────────────────────────────────────────────────┐
│  Data Generation Context                                      │
│                                                                │
│  Industry?     [fintech / healthcare / e-commerce / ...]       │
│  Function?     [contract management / billing / HR / ...]      │
│  Use cases?    [invoice processing, vendor management, ...]    │
│  Company size? [startup / mid-market / enterprise]             │
│  Region?       [US / EU / APAC]                                │
│  Records/entity? [100]                                         │
└──────────────────────────────────────────────────────────────┘
```

The `GenerationBrief` type already supports all these fields (`metadata.industry`, `metadata.companySize`, `metadata.region`, `metadata.customContext`, per-entity `businessRules`), but the CLI only exposes `--industry` (default: `technology`) and `--volume` (default: `100`). Adding interactive prompting (via `inquirer.js` or `prompts`) would unlock realistic, context-aware data generation.

**Generator fallback chain** (already built):
1. **Tonic Fabricate** — complex relational data (needs `FABRICATE_API_KEY`)
2. **Faker.js** — pattern-matched field generation (always available, 150+ patterns)
3. **LLM Generator** — business context-aware (needs `ANTHROPIC_API_KEY`, uses Claude Haiku)

---

### WireMock's Role in the Pipeline — How Mock APIs Get Served

WireMock is the **live mock API server** (Stage 4) that transforms schemas + data into callable HTTP endpoints that AI agents use.

**What it does**:

```
ConnectorSchema → OpenAPI spec → WireMock stubs → Live mock API at localhost:8080
```

For each entity in the schema, the stub generator creates **5 CRUD mappings**:

| Operation | Method | URL Pattern | Response |
|-----------|--------|-------------|----------|
| List | `GET /api/{entity}` | Serves pre-generated JSON data file | 200 + array of records |
| Create | `POST /api/{entity}` | Dynamic response with `{{randomValue type="UUID"}}` | 201 + echoed body |
| Get by ID | `GET /api/{entity}/{id}` | Extracts ID from `{{request.pathSegments}}` | 200 + single record |
| Update | `PUT /api/{entity}/{id}` | Generates `updated_at` timestamp | 200 + merged body |
| Delete | `DELETE /api/{entity}/{id}` | Advances scenario state machine | 204 No Content |

**Key features**:
- **Instance isolation**: Each mock server instance has its own mappings + data files, routed via `X-Mock-Instance-Id` header
- **Stateful CRUD**: Uses WireMock scenarios (state machine: `Started` → `RecordCreated` → `RecordDeleted`)
- **Response templating**: `--global-response-templating` enables dynamic UUIDs, timestamps, request body echoing
- **Chaos injection**: Optional fault stubs for 500/429/503 errors, latency injection, malformed JSON
- **MCP integration**: `wiremockProxyService.ts` bridges MCP tool calls → WireMock HTTP endpoints → tool results

**File structure per instance**:
```
wiremock/
├── mappings/{instanceId}/
│   ├── {instanceId}-001-{entity}-list.json
│   ├── {instanceId}-002-{entity}-create.json
│   ├── {instanceId}-003-{entity}-get-by-id.json
│   ├── {instanceId}-004-{entity}-update.json
│   └── {instanceId}-005-{entity}-delete.json
└── __files/{connector}/{instanceId}/
    └── {entity}.json                          ← Generated data (from Stage 3)
```

**AI agent flow**:
```
Claude Agent → "list SpotDraft contracts"
  → MCP tool call: list_contracts()
  → wiremockProxyService.executeToolCall()
  → GET http://localhost:8080/api/contracts
    Headers: X-Mock-Instance-Id: spotdraft_testorg_fecd105c
  → WireMock matches mapping → serves contracts.json
  → Returns 200 with synthetic contract records
  → Claude Agent receives realistic API response
```

---

## Next Steps — Priority Fixes

| Priority | Issue | Impact | Effort |
|----------|-------|--------|--------|
| **P0** | Fix data gen schema loading (Issue #4) — pass schema in-memory to Stage 3 | Data generation produces nothing for URL-inferred connectors | Small — wire schema through pipeline |
| **P1** | Fix entity extraction (Issue #3) — skip version prefixes in path parsing | 3 shallow entities instead of 15+ real entities | Medium — improve `extractEntityNameFromPath()` + add LLM quality gate |
| **P2** | Interactive brief collection — add `inquirer.js` prompting when no brief provided | Generic data instead of industry-specific realistic data | Medium — CLI interactive mode |
| **P3** | LLM quality gate — post-parse validation of entity depth/quality | Shallow schemas pass silently | Medium — new quality check layer |
