---
name: sc:infer-schema
description: Infer ConnectorSchema from API documentation, OpenAPI specs, or sample responses
version: 1.0.0
---

# Schema Inference Skill

Automatically infer a `ConnectorSchema` from various input sources including OpenAPI/Swagger specs, API documentation URLs, or sample JSON responses.

## Triggers

This skill activates when the user requests:
- "infer schema from [URL]"
- "parse API docs at [URL]"
- "create schema from [OpenAPI spec]"
- "extract schema from [sample JSON]"
- "generate connector schema for [API name]"
- `/sc:infer-schema [input]`

## Input Types

### 1. OpenAPI/Swagger Specification
```bash
/sc:infer-schema --file path/to/openapi.yaml
/sc:infer-schema --file path/to/swagger.json
/sc:infer-schema --url https://api.example.com/openapi.json
```

### 2. API Documentation URL
```bash
/sc:infer-schema https://docs.api.example.com/reference
/sc:infer-schema --url https://developer.example.com/api-docs
```

### 3. Sample JSON Response
```bash
/sc:infer-schema --sample path/to/response.json
/sc:infer-schema --sample '{"customers": [{"id": "123", "name": "Acme"}]}'
```

### 4. Manual Description
```bash
/sc:infer-schema --describe "CRM API with customers, contacts, and deals"
```

## Process Flow

```
┌─────────────────┐
│   User Input    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│              INPUT TYPE DETECTION                    │
│  ┌─────────────┐ ┌───────────┐ ┌────────────────┐  │
│  │ .yaml/.json │ │ URL input │ │ JSON structure │  │
│  │  OpenAPI?   │ │ Fetch doc │ │ Sample data?   │  │
│  └──────┬──────┘ └─────┬─────┘ └───────┬────────┘  │
└─────────┼──────────────┼───────────────┼───────────┘
          │              │               │
          ▼              ▼               ▼
┌─────────────────┐ ┌───────────┐ ┌───────────────┐
│ OpenAPI Parser  │ │ LLM Infer │ │ JSON Analyzer │
│ swagger-parser  │ │ Haiku API │ │ Type infer    │
└────────┬────────┘ └─────┬─────┘ └───────┬───────┘
         │                │               │
         └────────────────┼───────────────┘
                          │
                          ▼
         ┌─────────────────────────────────┐
         │     Unified ConnectorSchema      │
         │   • entities with fields         │
         │   • relationships detected       │
         │   • endpoints mapped             │
         │   • auth config inferred         │
         └─────────────────┬───────────────┘
                           │
                           ▼
         ┌─────────────────────────────────┐
         │      Zod Validation Pass         │
         │   • Required fields present      │
         │   • Types are valid              │
         │   • References resolve           │
         └─────────────────┬───────────────┘
                           │
                           ▼
         ┌─────────────────────────────────┐
         │       Output Schema File         │
         │   schemas/{connector}.json       │
         └─────────────────────────────────┘
```

## Output

The skill produces a validated `ConnectorSchema` JSON file:

```json
{
  "name": "example-api",
  "version": "1.0.0",
  "baseUrl": "/api/example",
  "auth": {
    "type": "oauth2",
    "fields": ["client_id", "client_secret"],
    "config": {
      "tokenEndpoint": "/oauth/token"
    }
  },
  "entities": [
    {
      "name": "Customer",
      "tableName": "example_customers",
      "endpoints": [
        { "method": "GET", "path": "/customers", "operation": "list" },
        { "method": "GET", "path": "/customers/:id", "operation": "get" }
      ],
      "fields": [
        { "name": "id", "type": "uuid", "required": true, "unique": true },
        { "name": "email", "type": "string", "required": true, "faker": "internet.email" }
      ]
    }
  ],
  "relationships": []
}
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--file` | Path to OpenAPI spec file | - |
| `--url` | URL to fetch spec or docs from | - |
| `--sample` | Path to sample JSON response | - |
| `--describe` | Natural language API description | - |
| `--output` | Output file path | `schemas/{name}.json` |
| `--name` | Connector name override | Inferred from input |
| `--dry-run` | Show schema without saving | `false` |
| `--verbose` | Show detailed parsing info | `false` |

## Examples

### Parse OpenAPI Spec
```bash
/sc:infer-schema --file docs/petstore.yaml --name petstore

# Output:
# Parsing OpenAPI spec: docs/petstore.yaml
# Found 3 entities: Pet, Order, User
# Detected 2 relationships: Order->Pet, Order->User
# Schema validated successfully
# Saved to: schemas/petstore.json
```

### Infer from API Documentation
```bash
/sc:infer-schema https://developer.hubspot.com/docs/api/crm/contacts

# Output:
# Fetching documentation...
# Using LLM inference (Claude Haiku)
# Extracted entities: Contact, Company, Deal
# Detected auth type: oauth2
# Schema validated successfully
# Saved to: schemas/hubspot-crm.json
```

### Extract from Sample Response
```bash
/sc:infer-schema --sample examples/netsuite-response.json --name netsuite

# Output:
# Analyzing JSON structure...
# Inferred entity: Customer (12 fields)
# Detecting field types...
# Schema validated successfully
# Saved to: schemas/netsuite.json
```

## Implementation Details

### Parser Selection Logic

```typescript
function selectParser(input: SchemaInput): Parser {
  if (isOpenAPISpec(input)) {
    return new OpenAPIParser();
  }
  if (isURL(input) && !isOpenAPIURL(input)) {
    return new LLMInferenceParser();
  }
  if (isJSONSample(input)) {
    return new JSONSchemaParser();
  }
  if (isDescription(input)) {
    return new LLMInferenceParser();
  }
  throw new Error('Unable to determine input type');
}
```

### Files Used

- `src/schema/parsers/openapi-parser.ts` - OpenAPI/Swagger parsing
- `src/schema/parsers/llm-inference-parser.ts` - Claude Haiku inference
- `src/schema/parsers/index.ts` - Parser orchestration
- `src/schema/connector-schema.ts` - Schema validation

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `InvalidOpenAPISpec` | Malformed YAML/JSON | Check spec syntax |
| `NetworkError` | URL fetch failed | Verify URL accessibility |
| `LLMRateLimitError` | Haiku API limit | Wait and retry |
| `SchemaValidationError` | Invalid output | Review inferred schema |
| `UnsupportedInputType` | Unknown format | Use explicit --file or --sample |

## Related Skills

- `/sc:generate-migration` - Generate SQL from ConnectorSchema
- `/sc:generate-routes` - Generate Express routes from ConnectorSchema
- `/sc:generate-data` - Generate synthetic data from ConnectorSchema
- `/sc:build-connector` - Full pipeline orchestration
