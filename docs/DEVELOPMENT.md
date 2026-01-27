# Development Guide

Guide for contributing to Agentic Sandbox.

## Getting Started

### Prerequisites

- Node.js 18+ and npm 9+
- PostgreSQL 15+
- Redis 7+
- Git
- Docker (optional but recommended)

### Development Setup

1. **Fork and clone the repository:**
```bash
git clone https://github.com/your-username/agentic-sandbox.git
cd agentic-sandbox
```

2. **Install dependencies:**
```bash
npm install
```

3. **Set up environment:**
```bash
cp .env.example .env
# Edit .env with your local configuration
```

4. **Start dependencies with Docker:**
```bash
docker-compose up -d postgres redis
```

5. **Run database migrations:**
```bash
psql -U agentic_user -d agentic_sandbox -f migrations/001_initial_schema.sql
psql -U agentic_user -d agentic_sandbox -f migrations/002_seed_data.sql
```

6. **Start development server:**
```bash
npm run dev
```

The server will start at http://localhost:3000 with hot reload enabled.

## Project Structure

```
agentic-sandbox/
├── src/
│   ├── config/              # Configuration files
│   │   ├── index.ts         # Main config
│   │   ├── database.ts      # Database connection
│   │   └── redis.ts         # Redis connection
│   ├── middleware/          # Express middleware
│   │   ├── auth.ts          # Authentication middleware
│   │   ├── errorHandler.ts # Error handling
│   │   └── rateLimiter.ts  # Rate limiting
│   ├── routes/              # API route handlers
│   │   ├── auth.ts          # OAuth routes
│   │   ├── health.ts        # Health check routes
│   │   └── netsuite.ts      # NetSuite API routes
│   ├── services/            # Business logic
│   │   └── netsuiteService.ts
│   ├── models/              # Data models (future)
│   ├── connectors/          # Connector implementations
│   │   ├── netsuite/        # NetSuite connector
│   │   ├── salesforce/      # Salesforce connector (planned)
│   │   ├── hubspot/         # HubSpot connector (planned)
│   │   └── quickbooks/      # QuickBooks connector (planned)
│   ├── types/               # TypeScript type definitions
│   │   └── index.ts
│   ├── utils/               # Utility functions
│   │   └── logger.ts
│   ├── app.ts               # Express app configuration
│   └── index.ts             # Server entry point
├── migrations/              # Database migrations
├── tests/                   # Test files
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── e2e/                # End-to-end tests
├── docs/                   # Documentation
└── config/                 # Additional config files
```

## Development Workflow

### 1. Creating a New Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Making Changes

- Follow TypeScript best practices
- Use ESLint and Prettier for code formatting
- Write tests for new features
- Update documentation as needed

### 3. Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- path/to/test.spec.ts

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

### 4. Code Quality

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Type check
npm run typecheck
```

### 5. Committing Changes

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```bash
git commit -m "feat(netsuite): add customer search endpoint"
git commit -m "fix(auth): resolve token expiration issue"
git commit -m "docs(api): update endpoint documentation"
```

### 6. Submitting a Pull Request

1. Push your branch to GitHub
2. Create a pull request
3. Fill out the PR template
4. Wait for review and address feedback
5. Once approved, your PR will be merged

## Adding a New Connector

To add a new connector (e.g., Salesforce):

### 1. Create Connector Types

Add types to `src/types/index.ts`:

```typescript
export interface SalesforceAccount {
  id: string;
  name: string;
  type?: string;
  industry?: string;
  // ... other fields
}
```

### 2. Create Database Schema

Create migration file `migrations/003_salesforce_tables.sql`:

```sql
CREATE TABLE IF NOT EXISTS salesforce_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sf_id VARCHAR(18) UNIQUE,
  name VARCHAR(255) NOT NULL,
  -- ... other fields
);
```

### 3. Create Service

Create `src/services/salesforceService.ts`:

```typescript
class SalesforceService {
  async getAccounts(params: QueryParams) {
    // Implementation
  }
  // ... other methods
}

export default new SalesforceService();
```

### 4. Create Routes

Create `src/routes/salesforce.ts`:

```typescript
import { Router } from 'express';
import salesforceService from '../services/salesforceService';

const router = Router();

router.get('/accounts', async (req, res) => {
  // Implementation
});

export default router;
```

### 5. Register Routes

Add to `src/app.ts`:

```typescript
import salesforceRoutes from './routes/salesforce';
// ...
this.app.use('/api/salesforce', salesforceRoutes);
```

### 6. Add Tests

Create `tests/integration/salesforce.test.ts`:

```typescript
describe('Salesforce API', () => {
  it('should list accounts', async () => {
    // Test implementation
  });
});
```

### 7. Update Documentation

Update `docs/API.md` with new endpoints.

## Testing

### Unit Tests

Test individual functions and modules in isolation:

```typescript
// tests/unit/services/netsuiteService.test.ts
import netsuiteService from '../../../src/services/netsuiteService';

describe('NetSuiteService', () => {
  describe('getCustomers', () => {
    it('should return paginated customers', async () => {
      const result = await netsuiteService.getCustomers({ page: 1, limit: 10 });
      expect(result.data).toBeInstanceOf(Array);
      expect(result.total).toBeGreaterThanOrEqual(0);
    });
  });
});
```

### Integration Tests

Test API endpoints with database:

```typescript
// tests/integration/netsuite.test.ts
import request from 'supertest';
import app from '../../src/app';

describe('NetSuite API', () => {
  let accessToken: string;

  beforeAll(async () => {
    // Get access token
  });

  it('should list customers', async () => {
    const response = await request(app)
      .get('/api/netsuite/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeInstanceOf(Array);
  });
});
```

### E2E Tests

Test complete user flows:

```typescript
// tests/e2e/oauth-flow.test.ts
describe('OAuth Flow', () => {
  it('should complete full OAuth flow', async () => {
    // 1. Get authorization code
    // 2. Exchange for token
    // 3. Use token to access API
    // 4. Verify response
  });
});
```

## Debugging

### VSCode Debug Configuration

Add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Server",
      "runtimeArgs": ["-r", "ts-node/register"],
      "args": ["${workspaceFolder}/src/index.ts"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

### Logging

Use the logger utility for consistent logging:

```typescript
import logger from '../utils/logger';

logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');
```

## Database Management

### Creating Migrations

1. Create SQL file in `migrations/` directory
2. Name it with incremental number: `003_description.sql`
3. Include both up and down migrations if reversible

### Running Migrations

```bash
psql -U agentic_user -d agentic_sandbox -f migrations/003_your_migration.sql
```

### Viewing Database

Using Docker:
```bash
docker-compose --profile tools up -d pgadmin
# Access at http://localhost:5050
```

Using psql:
```bash
psql -U agentic_user -d agentic_sandbox
```

## Redis Management

### Viewing Redis Data

Using Docker:
```bash
docker-compose --profile tools up -d redis-commander
# Access at http://localhost:8081
```

Using redis-cli:
```bash
redis-cli
> KEYS *
> GET token:user-id
```

## Performance Optimization

### Database Queries

- Use indexes for frequently queried fields
- Avoid N+1 queries
- Use connection pooling
- Consider query result caching

### Redis Caching

- Cache frequently accessed data
- Set appropriate TTLs
- Use cache invalidation strategies

### API Performance

- Implement pagination
- Use compression middleware
- Optimize JSON payloads
- Monitor response times

## Security Best Practices

- Never commit `.env` files
- Use parameterized queries to prevent SQL injection
- Validate and sanitize all inputs
- Keep dependencies updated
- Use HTTPS in production
- Implement proper CORS policies
- Rate limit sensitive endpoints
- Log security-related events

## CI/CD

### GitHub Actions Workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

## Troubleshooting

### Common Issues

**Database connection fails:**
- Check PostgreSQL is running
- Verify credentials in `.env`
- Check database exists

**Redis connection fails:**
- Check Redis is running
- Verify Redis URL in `.env`

**TypeScript errors:**
- Run `npm run typecheck`
- Check for missing type definitions

**Tests failing:**
- Ensure database is seeded
- Check test environment configuration

## Resources

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Redis Documentation](https://redis.io/documentation)
- [Jest Testing Framework](https://jestjs.io/docs/getting-started)

## Getting Help

- Open an issue on GitHub
- Check existing issues and discussions
- Review documentation thoroughly

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn and grow
- Follow project guidelines

## License

MIT License - see LICENSE file for details.
