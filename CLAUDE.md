# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agentic Sandbox is an **AI Agent Connector Testing Platform** with isolated mock servers per connector. Each connector type (Snowflake, NetSuite, Google Workspace, Slack) has its own auth implementation, mock server (mimics actual API schema), and isolated data store.

**Key Goal**: OAuth credentials can be copied/pasted into real AI agent interfaces (Claude Cowork, PipesHub) for testing.

## Important Documentation

| Document | Purpose |
|----------|---------|
| [`docs/task-progress.md`](docs/task-progress.md) | **Current implementation spec & progress tracker** |
| [`docs/agentic-sandbox-architecture.html`](docs/agentic-sandbox-architecture.html) | Architecture visualization |
| [`docs/snowflake-architecture.html`](docs/snowflake-architecture.html) | Snowflake flow diagram |
| [`docs/factory-cli-pipeline-explorer.html`](docs/factory-cli-pipeline-explorer.html) | **Interactive Factory CLI pipeline visualization** |
| [`docs/plans/completed/`](docs/plans/completed/) | **Branch context docs** — one per feature branch, agent-readable |

## Maintaining the Architecture Visualization

`docs/factory-cli-pipeline-explorer.html` is a self-contained interactive SVG diagram of the full Factory CLI pipeline. **When making architectural changes, update this file.**

### How the visualization works

- **Nodes** (`const N`): Array of objects with `id`, `label`, `sub` (subtitle), `x/y/w/h` (position), `st` (status: `built`/`modify`/`new`/`output`/`storage`), `file`, `desc` (HTML detail)
- **Connections** (`const C`): Array of `{ f, t, type, lb }` — from/to node IDs, line type (`flow`/`dec`/`agent`/`out`/`store`), label
- **Views** (`const V`): Named subsets of nodes for filtered views + path highlights

### When to update

| Change | Action |
|--------|--------|
| New service/component | Add node to `N[]`, connection(s) to `C[]`, include in relevant views |
| Status change (built a "new" thing) | Change node `st` from `'new'` to `'built'` |
| New pipeline stage | Add node, update vertical flow connections |
| New storage tier | Add node with `st:'storage'`, connect from relevant stage |
| URL changes (http→https, port) | Update node `desc` and `sub` text |

### Layout conventions

- **Left column** (x:30-370): Pipeline stages, vertical flow
- **Right column** (x:480-800): Storage tiers, grouped with related stages
- **Full-width rows**: Protocol layer, consumer flow, lifecycle (bottom)
- Keep related nodes at the same y-coordinate for visual grouping

## Branch Context Doc Protocol

**Before creating a PR for any feature branch**, write a branch context doc at:
`docs/plans/completed/YYYY-MM-DD-branch-name.md`

This doc is the **agent-readable memory** for the branch. It must include:

1. **What the branch does** — one paragraph summary
2. **Architecture/flow** — how data moves through the system
3. **Files created/modified** — table with file path and purpose
4. **CLI commands** — every command and flag, with examples
5. **Key design decisions** — why, not just what
6. **Verification commands** — how to prove it works
7. **Environment variables** — anything needed at runtime
8. **Caching/storage layout** — where things are stored on disk

Update this doc on every commit to the branch. Keep it current — an agent starting a new session should be able to read this doc and fully understand the branch without reading code.

## Task Tracking Protocol

**After completing any work session:**
1. Update `docs/task-progress.md` - mark tasks complete, add session notes
2. Keep progress table current with ✅/🔲 status
3. Add dated session log entry summarizing changes

## Commands

### Development
```bash
npm run dev          # Start with hot reload (nodemon + ts-node)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled production server
```

### Testing
```bash
npm test                              # Run all tests
npm test -- tests/unit/auth.test.ts   # Run single test file
npm test -- --testNamePattern="should validate token"  # Run tests matching pattern
npm run test:watch                    # Watch mode
npm run test:coverage                 # With coverage report
```

### Code Quality
```bash
npm run lint         # ESLint check
npm run lint:fix     # Auto-fix lint issues
npm run format       # Prettier format src/**/*.ts
npm run typecheck    # TypeScript strict check (no emit)
```

### Docker
```bash
npm run docker:up    # Start PostgreSQL, Redis, API
npm run docker:down  # Stop all services
npm run docker:logs  # Follow container logs
docker-compose --profile tools up -d  # Include pgAdmin (5050) + Redis Commander (8081)
```

### Database
```bash
psql -U agentic_user -d agentic_sandbox -f migrations/001_initial_schema.sql
psql -U agentic_user -d agentic_sandbox -f migrations/002_seed_data.sql
```

## Architecture

```
src/
├── index.ts          # Server entry: DB/Redis init, graceful shutdown
├── app.ts            # Express setup: middleware stack, route registration
├── config/           # Environment config, DB pool, Redis client
├── middleware/       # auth (JWT), errorHandler, rateLimiter
├── routes/           # Route modules per connector
│   ├── auth.ts       # Generic OAuth routes
│   ├── netsuite.ts   # NetSuite REST API
│   └── snowflake/    # Snowflake SQL REST API (ISOLATED)
│       ├── auth.ts   # Snowflake OAuth
│       ├── statements.ts  # POST /api/v2/statements
│       └── index.ts  # Route aggregator
├── services/         # Business logic per connector
│   ├── netsuiteService.ts
│   ├── snowflakeService.ts
│   └── snowflakeQueryEngine.ts
├── shapes/           # API response formatters
│   ├── base.ts       # ApiShape interface
│   ├── snowflake.ts  # Snowflake JSON format
│   └── index.ts      # Shape registry
├── types/            # TypeScript interfaces
└── utils/            # Logger (Winston)

migrations/
├── 001_initial_schema.sql      # Core tables
├── 002_seed_data.sql           # NetSuite seed data
├── 004_snowflake_metadata.sql  # Snowflake metadata tables
└── 005_snowflake_sample_data.sql # Snowflake sample data
```

### Data Isolation Principle
Each connector has ISOLATED tables: `snowflake_*`, `netsuite_*`, `google_*`. Data is NOT shared between connectors.

### Request Flow
1. Security headers (Helmet) → CORS → Body parsing → Compression
2. Morgan logging → Rate limiting (production) → Request ID injection
3. Route handlers → JWT auth middleware → Service layer → Database
4. Error handler catches all exceptions with typed responses

### Key Patterns
- **Singleton services**: `export default new NetSuiteService()`
- **Async error wrapper**: `asyncHandler()` in errorHandler.ts catches promise rejections
- **Database**: Connection pooling via `src/config/database.ts`, parameterized queries
- **Auth**: JWT tokens with Redis-backed blacklist for revocation
- **Config**: All env vars centralized in `src/config/index.ts`

## Testing Structure

```
tests/
├── setup.ts              # Jest setup, mock configuration
├── unit/                 # Isolated tests with mocked pg/ioredis
│   ├── auth.test.ts
│   ├── database.test.ts
│   ├── errorHandler.test.ts
│   └── netsuiteService.test.ts
└── integration/          # Full HTTP tests via supertest
    ├── customers.test.ts
    ├── invoices.test.ts
    ├── oauth.test.ts
    └── errorHandling.test.ts
```

Tests mock `pg` and `ioredis` modules. Integration tests use supertest against the Express app.

## Adding a New Connector

1. Add types to `src/types/index.ts`
2. Create migration in `migrations/00N_connector_tables.sql`
3. Create service in `src/services/connectorService.ts`
4. Create routes in `src/routes/connector.ts`
5. Register routes in `src/app.ts`: `app.use('/api/connector', connectorRoutes)`
6. Add tests in `tests/unit/` and `tests/integration/`
7. Update `docs/API.md`

## Environment Setup

Copy `.env.example` to `.env`. Key variables:
- `DATABASE_URL` or individual `DB_*` vars for PostgreSQL
- `REDIS_URL` for Redis connection
- `JWT_SECRET` for token signing
- `OAUTH_CLIENT_ID/SECRET` for mock OAuth

## E2E Testing Rules

**These rules MUST be followed during any end-to-end pipeline testing session.**

### Rule 1: Document Before Fix
When a test run reveals an issue:
1. **STOP** — do not immediately start fixing
2. **Document** the issue in the active progress tracker (`Project_Summary_<date>.md`)
3. Include: error output, root cause analysis, and proposed fix options
4. **Get user approval** on which fix approach to take
5. Only then implement the fix

### Rule 2: Fix the Core Issue
- Never apply short-term workarounds or bandaids
- Trace the failure back to its **root cause** in the pipeline architecture
- The fix should handle the general case, not just the specific URL/input that failed
- Document the fix rationale in the issue entry

### Issue Documentation Format
```markdown
### Issue #N: <title>
- **Test**: <command that was run>
- **Error**: <error message>
- **Root Cause**: <why it actually failed — trace through the code>
- **Fix Options**:
  - Option A: <description> — pros/cons
  - Option B: <description> — pros/cons
- **Chosen Fix**: <which option, after approval>
- **Status**: Open | In Progress | Fixed
```

## Conventions

- TypeScript strict mode enabled
- ESLint with `@typescript-eslint`, Prettier with single quotes
- Conventional commits: `feat(scope):`, `fix(scope):`, etc.
- Migrations are sequential SQL files: `001_`, `002_`, etc.
