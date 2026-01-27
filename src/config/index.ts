import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

interface Config {
  env: string;
  port: number;
  host: string;
  database: {
    url: string;
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    ssl: boolean;
    poolMin: number;
    poolMax: number;
  };
  redis: {
    url: string;
    host: string;
    port: number;
    password: string;
    db: number;
    ttl: number;
  };
  jwt: {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };
  oauth: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  logging: {
    level: string;
    format: string;
  };
  cors: {
    origin: string;
    credentials: boolean;
  };
  dataGeneration: {
    provider: string;
    gretelApiKey: string;
    tonicApiKey: string;
  };
  connectors: {
    netsuite: {
      accountId: string;
      baseUrl: string;
      tokenId: string;
      tokenSecret: string;
    };
    salesforce: {
      instanceUrl: string;
      clientId: string;
      clientSecret: string;
    };
    hubspot: {
      clientId: string;
      clientSecret: string;
    };
    quickbooks: {
      clientId: string;
      clientSecret: string;
      companyId: string;
    };
  };
}

const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  database: {
    url: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'agentic_sandbox',
    user: process.env.DB_USER || 'agentic_user',
    password: process.env.DB_PASSWORD || 'agentic_password',
    ssl: process.env.DB_SSL === 'true',
    poolMin: parseInt(process.env.DB_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DB_POOL_MAX || '10', 10),
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB || '0', 10),
    ttl: parseInt(process.env.REDIS_TTL || '3600', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  oauth: {
    issuer: process.env.OAUTH_ISSUER || 'http://localhost:3000',
    clientId: process.env.OAUTH_CLIENT_ID || 'agentic-sandbox-client',
    clientSecret: process.env.OAUTH_CLIENT_SECRET || 'agentic-sandbox-secret',
    redirectUri: process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/callback',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    credentials: process.env.CORS_CREDENTIALS === 'true',
  },
  dataGeneration: {
    provider: process.env.DATA_GEN_PROVIDER || 'faker',
    gretelApiKey: process.env.GRETEL_API_KEY || '',
    tonicApiKey: process.env.TONIC_API_KEY || '',
  },
  connectors: {
    netsuite: {
      accountId: process.env.NETSUITE_ACCOUNT_ID || 'TSTDRV123456',
      baseUrl:
        process.env.NETSUITE_BASE_URL ||
        'https://tstdrv123456.suitetalk.api.netsuite.com',
      tokenId: process.env.NETSUITE_TOKEN_ID || 'mock-token-id',
      tokenSecret: process.env.NETSUITE_TOKEN_SECRET || 'mock-token-secret',
    },
    salesforce: {
      instanceUrl: process.env.SALESFORCE_INSTANCE_URL || 'https://na1.salesforce.com',
      clientId: process.env.SALESFORCE_CLIENT_ID || 'mock-salesforce-client-id',
      clientSecret:
        process.env.SALESFORCE_CLIENT_SECRET || 'mock-salesforce-client-secret',
    },
    hubspot: {
      clientId: process.env.HUBSPOT_CLIENT_ID || 'mock-hubspot-client-id',
      clientSecret: process.env.HUBSPOT_CLIENT_SECRET || 'mock-hubspot-client-secret',
    },
    quickbooks: {
      clientId: process.env.QUICKBOOKS_CLIENT_ID || 'mock-quickbooks-client-id',
      clientSecret:
        process.env.QUICKBOOKS_CLIENT_SECRET || 'mock-quickbooks-client-secret',
      companyId: process.env.QUICKBOOKS_COMPANY_ID || '123456789',
    },
  },
};

export default config;
