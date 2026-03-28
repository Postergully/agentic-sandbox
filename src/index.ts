import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import app from './app';
import config from './config';
import logger from './utils/logger';
import database from './config/database';
import redisClient from './config/redis';
import { sslDnsService, SSLConfig } from './services/sslDnsService';

/**
 * Resolve SSL options via sslDnsService or fallback to scanning certs directory.
 */
function getSSLOptions(): { key: Buffer; cert: Buffer } | null {
  // 1. Try explicit cert/key paths via sslDnsService
  if (config.ssl.certPath && config.ssl.keyPath) {
    const sslConfig: SSLConfig = {
      domain: '',
      localIp: '127.0.0.1',
      port: config.ssl.httpsPort,
      certPath: config.ssl.certPath,
      keyPath: config.ssl.keyPath,
      hostsEntryAdded: false,
      mockUrl: '',
      certsGenerated: true,
    };
    const opts = sslDnsService.getExpressSSLOptions(sslConfig);
    if (opts) {
      logger.info(`SSL: Using explicit cert ${config.ssl.certPath}`);
      return opts;
    }
  }

  // 2. Fallback: scan certsDir for .pem files
  try {
    const certsDir = config.ssl.certsDir;
    const certFiles = fs.readdirSync(certsDir);
    const certFile = certFiles.find(f => f.endsWith('.pem') && !f.includes('-key'));
    const keyFile = certFiles.find(f => f.endsWith('-key.pem'));

    if (certFile && keyFile) {
      logger.info(`SSL: Found certs in ${certsDir} — ${certFile}, ${keyFile}`);

      // Log configured domains from cert filenames
      const domains = certFiles
        .filter(f => f.endsWith('.pem') && !f.includes('-key'))
        .map(f => f.replace('.pem', ''));
      if (domains.length > 0) {
        logger.info(`SSL: Configured domains — ${domains.join(', ')}`);
      }

      return {
        cert: fs.readFileSync(path.join(certsDir, certFile)),
        key: fs.readFileSync(path.join(certsDir, keyFile)),
      };
    }
    return null;
  } catch {
    return null;
  }
}

const startServer = async () => {
  try {
    // Test database connection (optional in development)
    const dbConnected = await database.testConnection();
    if (!dbConnected) {
      logger.warn('Failed to connect to database - some features may be unavailable');
    }

    // Test Redis connection
    const redisConnected = await redisClient.testConnection();
    if (!redisConnected) {
      logger.warn('Failed to connect to Redis - continuing without cache');
    }

    // Start HTTP server
    const server = app.listen(config.port, config.host, () => {
      logger.info(`HTTP Server running on ${config.host}:${config.port}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`API Base URL: http://${config.host}:${config.port}/api`);
    });

    // Start HTTPS server if enabled and certs are available
    let httpsServer: https.Server | null = null;

    if (config.ssl.enabled) {
      const sslOpts = getSSLOptions();
      if (sslOpts) {
        try {
          httpsServer = https.createServer(sslOpts, app);
          httpsServer.listen(config.ssl.httpsPort, '0.0.0.0', () => {
            logger.info(`HTTPS Server running on 0.0.0.0:${config.ssl.httpsPort}`);
            logger.info('Mock URLs will work via /etc/hosts + HTTPS');
          });
        } catch (err) {
          logger.warn(`Failed to start HTTPS server: ${err}. Run with sudo for port 443.`);
        }
      } else {
        logger.info(`No SSL certs found in ${config.ssl.certsDir} — HTTPS disabled`);
        logger.info('Run: npm run cli -- create -c snowflake -o yourorg to generate certs');
      }
    } else {
      logger.info('SSL disabled via SSL_ENABLED=false');
    }

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      // Close HTTPS server if running
      if (httpsServer) {
        httpsServer.close(() => logger.info('HTTPS server closed'));
      }

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await database.close();
          await redisClient.close();
          logger.info('All connections closed. Exiting process.');
          process.exit(0);
        } catch (error) {
          logger.error(`Error during shutdown: ${error}`);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    // Handle termination signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error(`Uncaught Exception: ${error.message}`);
      logger.error(error.stack);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any) => {
      logger.error(`Unhandled Rejection: ${reason}`);
      process.exit(1);
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error}`);
    process.exit(1);
  }
};

startServer();
