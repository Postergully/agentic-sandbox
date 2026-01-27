# Agentic Sandbox

A mock connector service that mimics real enterprise systems (NetSuite, Salesforce, HubSpot, QuickBooks) for testing AI agents with realistic data and authentic OAuth flows.

## Overview

Agentic Sandbox provides:
- **Realistic mock APIs** that mimic enterprise connector endpoints
- **Authentic OAuth flows** for testing authentication integrations
- **Synthetic data generation** based on industry and business context
- **Scenario planning** for testing moderate, difficult, and edge cases

## Features

- 🔐 Full OAuth 2.0 authentication flow
- 📊 NetSuite REST API endpoints (customers, invoices, SuiteQL)
- 🗄️ PostgreSQL database with sample data
- ⚡ Redis caching layer for performance
- 🐳 Docker containerization for easy deployment
- 📝 Comprehensive API documentation
- 🔒 Rate limiting and security best practices

## Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
- Docker and Docker Compose (optional, recommended)
- PostgreSQL 15+ (if not using Docker)
- Redis 7+ (if not using Docker)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd agentic-sandbox
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start with Docker (recommended):
```bash
npm run docker:up
```

Or manually:
```bash
# Start PostgreSQL and Redis
# Run migrations
psql -U agentic_user -d agentic_sandbox -f migrations/001_initial_schema.sql
psql -U agentic_user -d agentic_sandbox -f migrations/002_seed_data.sql

# Start the server
npm run dev
```

5. Verify the installation:
```bash
curl http://localhost:3000/health
```

## Usage

### OAuth Authentication Flow

1. **Get Authorization Code:**
```bash
curl "http://localhost:3000/oauth/authorize?client_id=agentic-sandbox-client&redirect_uri=http://localhost:3000/callback&response_type=code&connector_id=netsuite"
```

2. **Exchange Code for Token:**
```bash
curl -X POST http://localhost:3000/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "YOUR_AUTH_CODE",
    "client_id": "agentic-sandbox-client",
    "client_secret": "agentic-sandbox-secret",
    "redirect_uri": "http://localhost:3000/callback"
  }'
```

### NetSuite API Examples

**List Customers:**
```bash
curl http://localhost:3000/api/netsuite/customers \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Get Customer by ID:**
```bash
curl http://localhost:3000/api/netsuite/customers/{id} \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Create Customer:**
```bash
curl -X POST http://localhost:3000/api/netsuite/customers \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "New Company Inc",
    "email": "contact@newcompany.com",
    "phone": "+1-555-0199",
    "subsidiary": "Parent Company",
    "currency": "USD",
    "terms": "Net 30"
  }'
```

**List Invoices:**
```bash
curl http://localhost:3000/api/netsuite/invoices \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## API Endpoints

### Health Check
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health with service status

### Authentication
- `GET /oauth/authorize` - OAuth authorization endpoint
- `POST /oauth/token` - Token exchange endpoint
- `GET /oauth/userinfo` - User information endpoint

### NetSuite API
- `GET /api/netsuite/customers` - List customers (with pagination)
- `GET /api/netsuite/customers/:id` - Get customer by ID
- `POST /api/netsuite/customers` - Create customer
- `PATCH /api/netsuite/customers/:id` - Update customer
- `GET /api/netsuite/invoices` - List invoices (with pagination)
- `GET /api/netsuite/invoices/:id` - Get invoice by ID
- `POST /api/netsuite/invoices` - Create invoice
- `GET /api/netsuite/query` - SuiteQL query endpoint

See [API.md](./docs/API.md) for complete API documentation.

## Configuration

Key environment variables:

```bash
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/agentic_sandbox

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h

# OAuth
OAUTH_CLIENT_ID=agentic-sandbox-client
OAUTH_CLIENT_SECRET=agentic-sandbox-secret
```

## Development

### Project Structure

```
agentic-sandbox/
├── src/
│   ├── config/          # Configuration files
│   ├── middleware/      # Express middleware
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── models/          # Data models
│   ├── connectors/      # Connector implementations
│   ├── types/           # TypeScript types
│   └── utils/           # Utility functions
├── migrations/          # Database migrations
├── tests/              # Test files
├── docs/               # Documentation
└── config/             # Config files
```

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run lint` - Lint code
- `npm run format` - Format code with Prettier
- `npm run docker:up` - Start Docker containers
- `npm run docker:down` - Stop Docker containers

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Docker

### Start all services:
```bash
docker-compose up -d
```

### View logs:
```bash
docker-compose logs -f
```

### Stop services:
```bash
docker-compose down
```

### Access management tools:
```bash
# Start with tools profile
docker-compose --profile tools up -d

# pgAdmin: http://localhost:5050
# Redis Commander: http://localhost:8081
```

## Roadmap

### Phase 1 (Current)
- ✅ NetSuite connector with OAuth
- ✅ Customer and invoice endpoints
- ✅ PostgreSQL database setup
- ✅ Redis caching
- ✅ Docker support

### Phase 2 (Next)
- [ ] Salesforce connector
- [ ] HubSpot connector
- [ ] QuickBooks connector
- [ ] Data generation with Faker.js

### Phase 3 (Future)
- [ ] Gretel.ai integration for advanced data generation
- [ ] Admin UI for connector management
- [ ] Scenario builder for testing
- [ ] API documentation UI (Swagger)
- [ ] Webhook support

## Contributing

See [DEVELOPMENT.md](./docs/DEVELOPMENT.md) for contribution guidelines.

## Architecture

The system follows a modular architecture:

- **API Gateway Layer**: Authentication, rate limiting, logging
- **Connector Services**: Mock implementations of enterprise APIs
- **OAuth Service**: Token management and authentication
- **Data Layer**: PostgreSQL for persistent storage, Redis for caching
- **Data Generation**: Synthetic data generation for testing

## Security

- JWT-based authentication
- Token blacklisting support
- Rate limiting on all endpoints
- Helmet.js security headers
- CORS configuration
- Input validation
- SQL injection prevention

## License

MIT

## Support

For issues, questions, or contributions, please open an issue on GitHub.

## Acknowledgments

Built to support AI agent companies in delivering better demos and testing experiences.
