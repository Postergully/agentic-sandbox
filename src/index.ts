import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import app from './app';
import config from './config';
import logger from './utils/logger';
import database from './config/database';
import redisClient from './config/redis';

// HTTPS configuration
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '443', 10);
const CERT_PATH = process.env.SSL_CERT_PATH || path.join(process.cwd(), 'certs');

function getSSLCerts(): { key: Buffer; cert: Buffer } | null {
  try {
    // Look for wildcard certs first, then specific certs
    const certFiles = fs.readdirSync(CERT_PATH);
    const certFile = certFiles.find(f => f.endsWith('.pem') && !f.includes('-key'));
    const keyFile = certFiles.find(f => f.endsWith('-key.pem'));

    if (certFile && keyFile) {
      return {
        cert: fs.readFileSync(path.join(CERT_PATH, certFile)),
        key: fs.readFileSync(path.join(CERT_PATH, keyFile)),
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

    // Start HTTPS server if certs are available
    const sslCerts = getSSLCerts();
    let httpsServer: https.Server | null = null;

    if (sslCerts) {
      try {
        httpsServer = https.createServer(sslCerts, app);
        httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
          logger.info(`HTTPS Server running on 0.0.0.0:${HTTPS_PORT}`);
          logger.info(`Mock URLs will work via /etc/hosts + HTTPS`);
        });
      } catch (err) {
        logger.warn(`Failed to start HTTPS server: ${err}. Run with sudo for port 443.`);
      }
    } else {
      logger.info('No SSL certs found in ./certs - HTTPS disabled');
      logger.info('Run: npm run cli -- create -c snowflake -o yourorg to generate certs');
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
