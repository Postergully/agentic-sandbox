---
name: sc:infer-schema
description: Use when inferring ConnectorSchema from API documentation, OpenAPI specs, sample responses, or massive ERP documentation (NetSuite, SAP, etc.)
---

# Schema Inference Skill

Automatically infer a `ConnectorSchema` from various input sources with intelligent parser routing.

## When to Use

- Inferring schema from OpenAPI/Swagger specifications
- Parsing massive ERP documentation (NetSuite 51MB+, SAP, etc.)
- Extracting schema from sample JSON responses
- Generating connector schema from API documentation URLs
- Natural language API description to schema conversion

## Input Types

### 1. Large ERP Documentation (Tiered Loading)

For massive documentation like NetSuite 2025_2 (51MB, 582 records):

```bash
# Parse specific records
/sc:infer-schema --docs docs/2025_2 --records customer,invoice,vendor

# Parse common business records (auto-selected)
/sc:infer-schema --docs docs/2025_2

# Parse by package/category
/sc:infer-schema --docs docs/2025_2 --package transactions

# Use pre-built index for faster startup
/sc:infer-schema --docs docs/2025_2 --index src/schema/indexes/netsuite-2025_2.json
```

### 2. OpenAPI/Swagger Specification

```bash
/sc:infer-schema --file path/to/openapi.yaml
/sc:infer-schema --file path/to/swagger.json
/sc:infer-schema --url https://api.example.com/openapi.json
```

### 3. Sample JSON Response

```bash
/sc:infer-schema --sample path/to/response.json
/sc:infer-schema --sample '{"customers": [{"id": "123", "name": "Acme"}]}'
```

### 4. Natural Language Description

```bash
/sc:infer-schema --describe "CRM API with customers, contacts, and deals"
```

## Process Flow

### Standard Flow (OpenAPI, Sample, Description)

```
Input → Type Detection → Parser Selection → Schema Generation → Validation → Output
```

### Large Docs Flow (NetSuite, SAP)

```
┌─────────────────────────────────────────────────────────────────┐
│                      TIER 1: INDEX LAYER                        │
│  Pre-parsed menudefs.js → JSON index (~50KB compressed)         │
│  - Record names, types, categories, relationships               │
│  - Fast lookup, fits in LLM context                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    TIER 2: SUBSET SELECTION                     │
│  User query → Select relevant records (1-20 records max)        │
│  - Semantic matching + category filtering                       │
│  - Dependency resolution (relationships)                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     TIER 3: DEEP DIVE                           │
│  Load full field definitions for selected records only          │
│  - Parse HTML with Cheerio (fast, jQuery-like)                  │
│  - Apply field type mapping with faker hints                    │
└─────────────────────────────────────────────────────────────────┘
```

## Output

The skill produces a validated `ConnectorSchema` JSON file:

```json
{
  "name": "netsuite",
  "version": "2025.2",
  "baseUrl": "/services/rest/record/v1",
  "auth": {
    "type": "tba",
    "fields": ["accountId", "consumerKey", "consumerSecret", "tokenId", "tokenSecret"]
  },
  "entities": [
    {
      "name": "Customer",
      "tableName": "netsuite_customers",
      "endpoints": [
        { "method": "GET", "path": "/customer", "operation": "list" },
        { "method": "GET", "path": "/customer/:id", "operation": "get" }
      ],
      "fields": [
        { "name": "id", "type": "uuid", "required": true, "unique": true },
        { "name": "companyName", "type": "string", "required": true, "faker": "company.name" },
        { "name": "email", "type": "string", "required": false, "faker": "internet.email" }
      ]
    }
  ],
  "relationships": [
    { "from": "Invoice", "to": "Customer", "type": "many-to-one", "foreignKey": "customerId" }
  ]
}
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--docs` | Path to large documentation directory | - |
| `--file` | Path to OpenAPI spec file | - |
| `--url` | URL to fetch spec or docs from | - |
| `--sample` | Path to sample JSON response | - |
| `--describe` | Natural language API description | - |
| `--records` | Specific record names to parse (comma-separated) | - |
| `--package` | Filter by schema package (e.g., transactions, lists) | - |
| `--index` | Path to pre-built index JSON | auto-detect |
| `--output` | Output file path | `schemas/{name}.json` |
| `--name` | Connector name override | inferred from input |
| `--dry-run` | Show schema without saving | `false` |
| `--verbose` | Show detailed parsing info | `false` |

## Implementation Files

### Core Parsers
- `src/schema/parsers/index.ts` - Unified parser routing
- `src/schema/parsers/openapi-parser.ts` - OpenAPI/Swagger parsing
- `src/schema/parsers/llm-inference-parser.ts` - Claude Haiku inference

### Large Docs Parser
- `src/schema/parsers/large-docs-parser/index.ts` - Main entry point
- `src/schema/parsers/large-docs-parser/menudefs-parser.ts` - Parse menudefs.js
- `src/schema/parsers/large-docs-parser/html-field-parser.ts` - Parse HTML with Cheerio
- `src/schema/parsers/large-docs-parser/record-selector.ts` - Smart record selection
- `src/schema/parsers/large-docs-parser/schema-assembler.ts` - Build ConnectorSchema
- `src/schema/parsers/large-docs-parser/field-mapper.ts` - Type mapping + faker hints

### Supporting
- `src/schema/connector-schema.ts` - Schema validation with Zod
- `src/schema/cache/schema-cache.ts` - File-based caching
- `src/schema/indexes/netsuite-2025_2.json` - Pre-built NetSuite index
- `scripts/parse-menudefs.ts` - Index generation script

## Examples

### Parse NetSuite Customer and Invoice

```bash
/sc:infer-schema --docs docs/2025_2 --records customer,invoice --verbose

# Output:
# Loaded index with 582 records
# Selected 2 records matching criteria
# Parsed Customer: 127 fields
# Parsed Invoice: 89 fields
# Detected 1 relationship: Invoice -> Customer
# Schema validated successfully
# Saved to: schemas/netsuite.json
```

### Parse All Transaction Records

```bash
/sc:infer-schema --docs docs/2025_2 --package transactions --output schemas/netsuite-transactions.json

# Output:
# Selected 45 records from package: transactions
# With documentation: 38
# Parsing records...
# Schema validated successfully
# Saved to: schemas/netsuite-transactions.json
```

### Generate Index for Large Docs

```bash
npx ts-node scripts/parse-menudefs.ts --input docs/2025_2/menudefs.js --output src/schema/indexes/netsuite-2025_2.json

# Output:
# Parsing NetSuite menudefs.js...
# File size: 1.18 MB
# Parsed 1247 total entries
# Statistics:
#   Total records: 582
#   With schema: 189
#   With script: 423
# Output written to: src/schema/indexes/netsuite-2025_2.json
# Output size: 48.32 KB
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `IndexNotFound` | Missing menudefs.js or index | Run `scripts/parse-menudefs.ts` |
| `RecordNotFound` | Requested record doesn't exist | Check spelling, use `--verbose` |
| `NoDocumentation` | HTML file missing for record | Record may not have schema interface |
| `InvalidOpenAPISpec` | Malformed YAML/JSON | Check spec syntax |
| `LLMRateLimitError` | Haiku API limit | Wait and retry |
| `SchemaValidationError` | Invalid output | Review inferred schema |

## Pressure Scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| 51MB docs directory | Uses tiered loading, index in <10s |
| 582 records requested | Paginates, max 20 per batch |
| Complex HTML (100+ fields) | All fields extracted correctly |
| Non-existent record | Graceful error with suggestions |
| Circular dependencies | Detected and reported |
| Missing HTML file | Skipped with warning |
| Invalid field types | Mapped to `string` with warning |

## Related Skills

- `/sc:generate-migration` - Generate SQL from ConnectorSchema
- `/sc:generate-routes` - Generate Express routes from ConnectorSchema
- `/sc:generate-data` - Generate synthetic data from ConnectorSchema
- `/sc:build-connector` - Full pipeline orchestration
