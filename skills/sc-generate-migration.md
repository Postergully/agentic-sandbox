---
name: sc:generate-migration
description: Generate PostgreSQL migrations from ConnectorSchema output of infer-schema
---

# Generate Migration Skill

Generate PostgreSQL schema migrations from a `ConnectorSchema` JSON file.

## When to Use

- After running `/sc:infer-schema` to create a ConnectorSchema
- When you need database tables for a connector
- Before running `/sc:generate-data` to seed the database

## Input Requirements

A valid `ConnectorSchema` JSON file, typically from:
- `/sc:infer-schema` output (OpenAPI, LLM, Large Docs, or JSON parser)
- Manually created schema in `schemas/` directory

## Usage

```bash
# Generate migration from schema
/sc:generate-migration --schema schemas/netsuite.json

# With custom output path
/sc:generate-migration --schema schemas/hubspot.json --output migrations/010_hubspot.sql

# Dry run to preview
/sc:generate-migration --schema schemas/netsuite.json --dry-run
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--schema` | Path to ConnectorSchema JSON (required) | - |
| `--output` | Output migration file path | `migrations/003_{name}_auto_schema.sql` |
| `--include-drop` | Add DROP TABLE statements | `false` |
| `--dry-run` | Preview without writing file | `false` |

## Generated Output

The generator creates a PostgreSQL migration with:

1. **UUID Extension**: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`
2. **Tables**: One per entity with:
   - Primary key (UUID with auto-generation)
   - All fields mapped to PostgreSQL types
   - NOT NULL constraints for required fields
   - CHECK constraints for enum fields
   - `created_at` and `updated_at` audit columns
3. **Foreign Keys**: Deferred constraint creation
4. **Indexes**: Automatic indexes on foreign key columns
5. **Triggers**: `updated_at` auto-update triggers

## Type Mapping

| ConnectorSchema Type | PostgreSQL Type |
|---------------------|-----------------|
| `string` | `VARCHAR(255)` / `TEXT` (for descriptions) |
| `number` | `NUMERIC` / `NUMERIC(18,2)` (for currency) |
| `boolean` | `BOOLEAN` |
| `date` | `DATE` |
| `datetime` | `TIMESTAMP WITH TIME ZONE` |
| `json` | `JSONB` |
| `uuid` | `UUID` |

## Implementation

**Generator**: `src/generators/schema-generator.ts`

```typescript
import { SchemaGenerator, generateMigrationFromFile } from '../src/generators/schema-generator';

// Quick generation
const result = generateMigrationFromFile('./schemas/netsuite.json');
console.log(result.sql);

// With options
const generator = new SchemaGenerator({
  includeDrop: true,
  includeTimestamps: true,
  includeFkIndexes: true,
});
const result = generator.generate(schema);
```

## Example Output

```sql
-- NETSUITE SCHEMA MIGRATION
-- Generated from ConnectorSchema v2025.2.0

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS netsuite_customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name VARCHAR(255) NOT NULL,
  email VARCHAR(320),
  phone VARCHAR(50),
  status VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Foreign key constraints
ALTER TABLE netsuite_invoices ADD CONSTRAINT fk_netsuite_invoices_customer_id
  FOREIGN KEY (customer_id) REFERENCES netsuite_customers(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_netsuite_invoices_customer_id
  ON netsuite_invoices (customer_id);
```

## Next Steps

After generating migration:

1. Review the generated SQL
2. Run migration: `psql -U agentic_user -d agentic_sandbox -f migrations/003_netsuite_auto_schema.sql`
3. Generate routes: `/sc:generate-routes --schema schemas/netsuite.json`
4. Generate seed data: `/sc:generate-data --schema schemas/netsuite.json`

## Related Skills

- `/sc:infer-schema` - Create ConnectorSchema from documentation
- `/sc:generate-routes` - Generate Express routes from ConnectorSchema
- `/sc:generate-data` - Generate synthetic data from ConnectorSchema
