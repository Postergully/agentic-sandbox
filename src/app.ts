import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import config from './config';
import logger from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimiter';

// Import routes
import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import netsuiteRoutes from './routes/netsuite';
import connectorRoutes from './routes/connectors';
import snowflakeRoutes from './routes/snowflake';
import factoryRoutes from './routes/factory';
import mcpRoutes from './routes/mcp';
import googleWorkspaceRoutes from './routes/google-workspace';

class App {
  public app: Application;

  constructor() {
    this.app = express();
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddlewares(): void {
    // Security middleware
    this.app.use(helmet());

    // CORS configuration
    this.app.use(
      cors({
        origin: config.cors.origin,
        credentials: config.cors.credentials,
      })
    );

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Compression middleware
    this.app.use(compression());

    // Request logging
    const morganFormat = config.env === 'development' ? 'dev' : 'combined';
    this.app.use(
      morgan(morganFormat, {
        stream: {
          write: (message: string) => {
            logger.http(message.trim());
          },
        },
      })
    );

    // Rate limiting
    if (config.env === 'production') {
      this.app.use('/api/', apiRateLimiter);
    }

    // Request ID middleware
    this.app.use((req, _res, next) => {
      req.headers['x-request-id'] = req.headers['x-request-id'] || crypto.randomUUID();
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check routes
    this.app.use('/health', healthRoutes);
    this.app.use('/api/health', healthRoutes);

    // Authentication routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/oauth', authRoutes);

    // Connector routes
    this.app.use('/api/netsuite', netsuiteRoutes);
    this.app.use('/api/v1/connectors', connectorRoutes);

    // Snowflake SQL REST API routes (isolated mock server)
    // Matches Snowflake's actual API structure: /api/v2/statements, /api/v2/oauth
    this.app.use('/api/v2', snowflakeRoutes);

    // Mock Server Factory routes
    this.app.use('/api/factory', factoryRoutes);

    // Google Workspace API mock routes (Drive, Calendar, Gmail)
    this.app.use('/api/google', googleWorkspaceRoutes);

    // MCP (Model Context Protocol) routes for Claude Cowork / Claude Desktop
    this.app.use('/mcp', mcpRoutes);

    // Root route
    this.app.get('/', (_req, res) => {
      res.json({
        success: true,
        message: 'Agentic Sandbox API',
        version: '1.0.0',
        documentation: '/api/docs',
      });
    });
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }
}

export default new App().app;
