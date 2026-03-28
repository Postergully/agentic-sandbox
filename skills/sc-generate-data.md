---
name: sc:generate-data
description: Generate synthetic data from ConnectorSchema using Faker.js
---

# Generate Data Skill

Generate synthetic test data from a `ConnectorSchema` JSON file using Faker.js.

## When to Use

- After running `/sc:generate-migration` to create database tables
- When you need realistic test data for development
- For populating demo environments
- For integration testing

## Input Requirements

A valid `ConnectorSchema` JSON file, typically from:
- `/sc:infer-schema` output (OpenAPI, LLM, Large Docs, or JSON parser)
- Manually created schema in `schemas/` directory

## Usage

```bash
# Generate seed data with defaults (10 records per entity)
/sc:generate-data --schema schemas/netsuite.json

# Generate 100 records per entity
/sc:generate-data --schema schemas/netsuite.json --count 100

# Use specific seed for reproducibility
/sc:generate-data --schema schemas/netsuite.json --seed 12345

# Output as JSON instead of SQL
/sc:generate-data --schema schemas/netsuite.json --format json

# Dry run to preview
/sc:generate-data --schema schemas/netsuite.json --dry-run
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--schema` | Path to ConnectorSchema JSON (required) | - |
| `--count` | Records per entity | `10` |
| `--seed` | Random seed for reproducibility | random |
| `--format` | Output format: `sql`, `json`, `seed-script` | `sql` |
| `--output` | Output file path | `migrations/004_{name}_seed_data.sql` |
| `--dry-run` | Preview without writing files | `false` |

## Generated Output

### SQL Format (default)

```sql
-- NETSUITE SEED DATA
-- Generated at: 2026-01-28T...
-- Seed: 12345
-- Total records: 720

-- Customer (10 records)
INSERT INTO netsuite_customers (id, company_name, email, phone)
VALUES ('uuid-1', 'Acme Corp', 'john@acme.com', '555-1234');
```

### JSON Format

```json
[
  {
    "entityName": "Customer",
    "tableName": "netsuite_customers",
    "records": [
      { "id": "uuid-1", "companyName": "Acme Corp", "email": "john@acme.com" }
    ]
  }
]
```

### Seed Script Format

Generates a TypeScript script that can be run with `ts-node`:

```typescript
import pool from '../src/config/database';

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // INSERT statements...
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

## Features

### Topological Sort

Entities are generated in dependency order based on foreign key relationships. Referenced entities are populated before referencing entities.

### Faker Hints

The generator uses `faker` hints from the schema:

```json
{
  "name": "email",
  "type": "string",
  "faker": "internet.email"
}
```

### Smart Field Detection

Without explicit faker hints, the generator infers appropriate data:

| Field Pattern | Generated Data |
|--------------|----------------|
| `*email*` | `faker.internet.email()` |
| `*phone*`, `*fax*` | `faker.phone.number()` |
| `*name*` | `faker.person.fullName()` |
| `*company*` | `faker.company.name()` |
| `*address*` | `faker.location.streetAddress()` |
| `*price*`, `*amount*` | `faker.finance.amount()` |
| `*description*` | `faker.lorem.paragraph()` |

### Foreign Key Handling

Automatically references valid IDs from related entities:

```json
{
  "name": "customerId",
  "type": "uuid",
  "foreignKey": { "entity": "Customer", "field": "id" }
}
```

## Implementation

**Generator**: `src/generators/data-generator.ts`

```typescript
import { DataGenerator, generateDataFromFile } from '../src/generators/data-generator';

// Quick generation
const result = generateDataFromFile('./schemas/netsuite.json');
console.log(result.totalRecords);

// With options
const generator = new DataGenerator({
  defaultCount: 100,
  seed: 12345,
  outputFormat: 'sql',
});
const result = generator.generate(schema);
```

## Reproducibility

Use the `--seed` flag to generate identical data:

```bash
# First run - generates random seed
/sc:generate-data --schema schemas/netsuite.json
# Output: Seed: 7967 (use --seed 7967 to reproduce)

# Reproduce exact same data
/sc:generate-data --schema schemas/netsuite.json --seed 7967
```

## Next Steps

After generating data:

1. Ensure migration has been run first
2. Load seed data:
   ```bash
   psql -U agentic_user -d agentic_sandbox -f migrations/004_netsuite_seed_data.sql
   ```
3. Verify data:
   ```bash
   psql -U agentic_user -d agentic_sandbox -c "SELECT COUNT(*) FROM netsuite_customers"
   ```

## Related Skills

- `/sc:infer-schema` - Create ConnectorSchema from documentation
- `/sc:generate-migration` - Generate SQL migrations from ConnectorSchema
- `/sc:generate-routes` - Generate Express routes from ConnectorSchema
