---
name: sc:generate-routes
description: Generate Express CRUD routes from ConnectorSchema output of infer-schema
---

# Generate Routes Skill

Generate Express.js CRUD routes from a `ConnectorSchema` JSON file.

## When to Use

- After running `/sc:infer-schema` to create a ConnectorSchema
- When you need API endpoints for a connector
- After running `/sc:generate-migration` to create database tables

## Input Requirements

A valid `ConnectorSchema` JSON file, typically from:
- `/sc:infer-schema` output (OpenAPI, LLM, Large Docs, or JSON parser)
- Manually created schema in `schemas/` directory

## Usage

```bash
# Generate routes from schema
/sc:generate-routes --schema schemas/netsuite.json

# With custom output paths
/sc:generate-routes --schema schemas/hubspot.json --output src/routes/hubspot.ts

# Without auth middleware
/sc:generate-routes --schema schemas/netsuite.json --no-auth

# Dry run to preview
/sc:generate-routes --schema schemas/netsuite.json --dry-run
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--schema` | Path to ConnectorSchema JSON (required) | - |
| `--output` | Output route file path | `src/routes/{name}-generated.ts` |
| `--service-output` | Output service stub path | `src/services/{name}GeneratedService.ts` |
| `--no-auth` | Skip authentication middleware | `false` |
| `--no-validation` | Skip request validation | `false` |
| `--dry-run` | Preview without writing files | `false` |

## Generated Output

### Routes File

For each entity, generates:

1. **GET /{entity}** - List with pagination
   - Query params: `page`, `limit`, `sort`, `order`, `search`
   - Response: `{ success, data, meta: { page, limit, total } }`

2. **GET /{entity}/:id** - Get by ID
   - Response: `{ success, data }`
   - 404 error if not found

3. **POST /{entity}** - Create
   - Validates required fields
   - Response: `{ success, data }` (201)

4. **PATCH /{entity}/:id** - Update
   - Response: `{ success, data }`
   - 404 error if not found

5. **DELETE /{entity}/:id** - Delete
   - Response: `{ success, data: { id, deleted: true } }`
   - 404 error if not found

### Service Stub

Also generates a service stub with:
- TypeScript interfaces for each entity
- Database query methods (with TODO comments)
- CRUD operations skeleton

## Implementation

**Generator**: `src/generators/route-generator.ts`

```typescript
import { RouteGenerator, generateRoutesFromFile } from '../src/generators/route-generator';

// Quick generation
const result = generateRoutesFromFile('./schemas/netsuite.json');
console.log(result.routeCode);

// With options
const generator = new RouteGenerator({
  includeAuth: true,
  includeValidation: true,
  includeLogging: true,
  serviceImportPath: '../services/netsuiteService',
});
const result = generator.generate(schema);
```

## Example Output

```typescript
import { Router, Response } from 'express';
import { AuthRequest, ApiResponse, QueryParams } from '../types';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import netsuiteService from '../services/netsuiteService';

const router = Router();
router.use(authenticate);

// GET /customers - List customers
router.get('/customers', asyncHandler(async (req: AuthRequest, res: Response) => {
  const queryParams: QueryParams = {
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 50, 100),
    sort: (req.query.sort as string) || 'created_at',
    order: (req.query.order as 'asc' | 'desc') || 'desc',
  };

  const { data, total } = await netsuiteService.getCustomers(queryParams);

  res.json({
    success: true,
    data,
    meta: { page: queryParams.page, limit: queryParams.limit, total },
  });
}));

// POST /customers - Create customer
router.post('/customers', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { companyName, email, ...rest } = req.body;

  if (!companyName || !email) {
    throw new AppError('Required fields: companyName, email', 400, 'VALIDATION_ERROR');
  }

  const customer = await netsuiteService.createCustomer({ companyName, email, ...rest });
  logger.info(`Customer created by user ${req.user?.id}: ${customer.id}`);

  res.status(201).json({ success: true, data: customer });
}));

export default router;
```

## Next Steps

After generating routes:

1. Review generated routes and service stub
2. Implement actual database queries in service file
3. Register routes in `src/app.ts`:
   ```typescript
   import netsuiteGeneratedRoutes from './routes/netsuite-generated';
   app.use('/api/netsuite', netsuiteGeneratedRoutes);
   ```
4. Test endpoints

## Related Skills

- `/sc:infer-schema` - Create ConnectorSchema from documentation
- `/sc:generate-migration` - Generate SQL migrations from ConnectorSchema
- `/sc:generate-data` - Generate synthetic data from ConnectorSchema
