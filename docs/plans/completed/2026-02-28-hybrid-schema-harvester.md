# Hybrid Multi-Source Schema Harvester

**Branch:** `feat/hybrid-schema-harvester`
**Date:** 2026-02-28
**Status:** Implemented, pending PR

---

## What This Branch Does

Merges the Python harvester's multi-source discovery INTO the existing TypeScript schema pipeline as a new parser layer. Instead of choosing between the existing single-source pipeline and the Python harvester, this takes the best of both:

- **From Harvester:** Multi-source redundancy (4 registries), connector-aware entity filtering, faker hint injection
- **From Existing Pipeline:** Self-healing parsing, quality validation, unified type system, TypeScript integration

## Architecture: 5-Layer Schema Discovery

```
Input: connector name (e.g. "netsuite") or URL
  │
  ├─ LAYER 0: Harvested Cache Check
  │   schemas/harvested/{connector}.json
  │   If <7 days old AND quality >80 → use directly
  │
  ├─ LAYER 1: Multi-Source Fetch (parallel)
  │   ├─ APIs.guru — 2500+ aggregated OpenAPI specs
  │   ├─ GitHub — known repos + code search fallback
  │   ├─ Apideck — unified normalized specs per vertical
  │   └─ Postman — public collection conversion
  │
  ├─ LAYER 2: Existing Self-Healing Pipeline
  │   URL content detection → OpenAPI parser → LLM Agent → LLM Inference
  │   (unchanged, still handles URL/file/text inputs)
  │
  ├─ LAYER 3: Schema Reconciliation
  │   LLM 2-pass merge (or deterministic fallback without API key)
  │   Pass 1: merge + deduplicate entities
  │   Pass 2: enrich with faker hints + validate auth
  │
  └─ LAYER 4: Quality Validation
      Score 0-100, reject if <50, warnings for shallow schemas
```

## Files Created

| File | Purpose |
|------|---------|
| `src/schema/sources/registry.ts` | Connector → source mappings for all 4 registries |
| `src/schema/sources/verticals.ts` | Industry vertical → connector + key entity mappings |
| `src/schema/sources/multi-source-fetcher.ts` | Parallel 4-source fetcher with 7-day spec cache |
| `src/schema/reconciler.ts` | LLM reconciliation (2-pass) + deterministic fallback + faker inference |
| `src/cli/commands/harvest.ts` | `mock-factory harvest` CLI command |

## Files Modified

| File | Change |
|------|--------|
| `src/schema/parsers/index.ts` | Added `connector-name` input type, `multi-source` parser, cache check |
| `src/services/factoryPipelineService.ts` | Stage 1 checks `schemas/harvested/` before `schemas/` |
| `src/cli/commands/index.ts` | Exported `createHarvestCommand` |
| `src/cli/index.ts` | Registered harvest command |

## CLI Commands

### Harvest (new)
```bash
# Harvest a single connector from public registries
mock-factory harvest -c netsuite

# Harvest all connectors in a vertical
mock-factory harvest -v finance
mock-factory harvest -v crm
mock-factory harvest -v hr
mock-factory harvest -v storage
mock-factory harvest -v comms
mock-factory harvest -v ecom

# List all known connectors
mock-factory harvest --list-connectors

# List all verticals and their connectors
mock-factory harvest --list-verticals

# Custom output directory
mock-factory harvest -c hubspot -o ./my-schemas

# JSON output (for piping)
mock-factory harvest -c netsuite --json

# Verbose mode (shows per-source details)
mock-factory harvest -c netsuite --verbose
```

### Create (existing, now enhanced)
```bash
# Create using a connector name (triggers multi-source discovery)
mock-factory create -c netsuite -o myorg

# Create from URL (existing behavior, unchanged)
mock-factory create -c netsuite -o myorg -a https://docs.netsuite.com/openapi.yaml

# Create from existing schema file (unchanged)
mock-factory create -c netsuite -o myorg -s ./schemas/netsuite.json

# Full pipeline with options
mock-factory create -c netsuite -o myorg -i finance -n 500 --skip-ssl

# Dry run
mock-factory create -c netsuite -o myorg --dry-run
```

### Generate (existing)
```bash
mock-factory generate -c netsuite -o myorg -a https://api-docs-url
mock-factory generate -b ./brief.json
mock-factory generate -c netsuite -o myorg -s ./schema.json --format wiremock
mock-factory generate -c netsuite -o myorg --skip-data --dry-run
```

### Other CLI Commands (existing)
```bash
mock-factory list                    # List all instances
mock-factory list --json             # JSON output
mock-factory info <instanceId>       # Instance details
mock-factory delete <instanceId>     # Delete instance
mock-factory validate -s schema.json # Validate a schema
mock-factory status <jobId>          # Check job status
mock-factory clone -f <id> -o <org>  # Clone instance (coming soon)
```

## Supported Connectors

### By Vertical
- **finance:** netsuite, quickbooks, xero, sage, zoho_books, freshbooks
- **crm:** hubspot, salesforce, zoho_crm, pipedrive
- **hr:** workday, bamboohr, gusto, rippling
- **storage:** google_drive, dropbox, box, sharepoint
- **comms:** slack, teams, gmail
- **ecom:** shopify, woocommerce, stripe

### Source Coverage per Registry
| Registry | What it provides | Cache TTL |
|----------|------------------|-----------|
| APIs.guru | 2500+ specs, versioned, provider-slug lookup | Index: 24h, Specs: 7d |
| GitHub | Known repos + code search fallback | Specs: 7d |
| Apideck | Normalized per-vertical specs (accounting, CRM, HRIS, file-storage) | Specs: 7d |
| Postman | Public collections converted to OpenAPI-like structure | Specs: 7d |

## Key Design Decisions

1. **TypeScript only** — no Python dependency, single build system
2. **Graceful degradation** — works without ANTHROPIC_API_KEY (deterministic merge), works with single source, works with cached data
3. **Cache-first** — harvested schemas cached 7 days, API indices cached 24h, avoids repeated fetches
4. **Non-breaking** — URL/file/text inputs use existing pipeline unchanged; only connector-name inputs trigger multi-source
5. **Faker hints** — every field gets a faker hint via name-based inference + LLM enrichment

## Factory Pipeline: Full 5-Stage Flow

```
Stage 1: Schema Inference
  → harvested cache → multi-source discovery → URL parse → file load → default schema
Stage 2: OpenAPI Generation
  → ConnectorSchema → OpenAPI 3.0 YAML
Stage 3: Data Generation
  → Schema + Brief → Synthetic data (faker + LLM)
Stage 4: WireMock Setup
  → OpenAPI + Data → Stubs + State
Stage 5: Registry + Credentials
  → Instance tracking + mock OAuth creds + SSL/DNS
```

## Caching Layout

```
.cache/
├── harvester/
│   ├── indices/          # APIs.guru index (24h TTL)
│   └── specs/            # Per-source specs (7d TTL)
│       ├── apisguru_spec_netsuite.json
│       ├── apideck_accounting.json
│       ├── github_netsuite_*.json
│       └── postman_netsuite.json
└── schemas/              # Existing URL content cache (1h TTL)

schemas/
├── harvested/            # Pre-populated schemas (7d freshness)
│   ├── netsuite.json
│   └── hubspot.json
├── netsuite.json         # Default/manual schemas
└── snowflake.json
```

## Verification Commands

```bash
# TypeScript compiles clean (only pre-existing connectorToFabricate.ts:438 error)
npx tsc --noEmit 2>&1 | grep -v node_modules

# Run existing tests (no regressions)
npm test

# Harvest and verify output
mock-factory harvest -c netsuite --verbose
cat schemas/harvested/netsuite.json | jq '.entities | length'

# Full pipeline with harvested schema
mock-factory create -c netsuite -o test --dry-run
```

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `ANTHROPIC_API_KEY` | LLM reconciliation (falls back to deterministic merge without it) | No |
| `DATABASE_URL` | PostgreSQL connection | For create/generate |
| `REDIS_URL` | Redis connection | For create/generate |
| `JWT_SECRET` | Token signing | For create/generate |
