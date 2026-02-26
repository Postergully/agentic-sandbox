/**
 * Snowflake SQL REST API Routes - Statement Execution
 *
 * Implements Snowflake's SQL REST API for executing and managing SQL statements.
 * Reference: https://docs.snowflake.com/en/developer-guide/sql-api/reference
 *
 * Endpoints:
 * - POST /statements - Execute a SQL statement
 * - GET /statements/:statementHandle - Get statement status
 * - GET /statements/:statementHandle/result - Get statement results
 * - POST /statements/:statementHandle/cancel - Cancel a running statement
 */

import { Router, Request, Response, NextFunction } from 'express';
import { snowflakeService } from '../../services/snowflakeService';
import { snowflakeShape } from '../../shapes/snowflake';
import { asyncHandler } from '../../middleware/errorHandler';
import logger from '../../utils/logger';

const router = Router();

/**
 * Snowflake Authentication Middleware
 *
 * For mock server purposes, accepts any Bearer token.
 * Real Snowflake requires valid OAuth tokens obtained from /oauth/token-request.
 *
 * Snowflake Error Codes:
 * - 390103: OAuth access token is missing or invalid
 * - 390104: OAuth access token has expired
 */
const snowflakeAuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    logger.warn('Snowflake request missing authorization header');
    res.status(401).json(
      snowflakeShape.errorTransform(
        'Authorization header is required. Expected format: Bearer <token>',
        '390103'
      )
    );
    return;
  }

  if (!authHeader.startsWith('Bearer ')) {
    logger.warn('Snowflake request has invalid authorization format');
    res.status(401).json(
      snowflakeShape.errorTransform(
        'Invalid authorization format. Expected: Bearer <token>',
        '390103'
      )
    );
    return;
  }

  const token = authHeader.substring(7);

  if (!token || token.trim().length === 0) {
    logger.warn('Snowflake request has empty token');
    res.status(401).json(
      snowflakeShape.errorTransform('OAuth access token is missing or invalid', '390103')
    );
    return;
  }

  // For mock server, accept any non-empty token
  // In production Snowflake, this would validate the OAuth token
  logger.debug(`Snowflake auth: accepted token (length: ${token.length})`);
  next();
};

// Apply authentication middleware to all statement routes
router.use(snowflakeAuthMiddleware);

/**
 * POST /statements
 *
 * Execute a SQL statement against the Snowflake mock server.
 *
 * Request Body:
 * - statement (required): SQL statement to execute
 * - timeout: Query timeout in seconds (default: 300)
 * - database: Database context for the query
 * - schema: Schema context for the query
 * - warehouse: Warehouse to use for execution
 * - role: Role to use for execution
 * - bindings: Parameter bindings for prepared statements
 * - parameters: Session parameters
 *
 * Response (success):
 * - resultSetMetaData: Column metadata and partition info
 * - data: Query results as string arrays
 * - statementHandle: Unique identifier for this statement
 * - code: Snowflake result code (090001 = success)
 * - sqlState: SQL state code (00000 = success)
 *
 * Error Codes:
 * - 000900: Generic SQL error
 * - 001003: SQL syntax error
 * - 002003: Object does not exist
 * - 003001: Permission denied
 * - 000604: Query timeout
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const {
      statement,
      timeout,
      database,
      schema,
      warehouse,
      role,
      bindings,
      parameters,
    } = req.body;

    // Validate required field
    if (!statement) {
      logger.warn('Snowflake execute: missing statement');
      res.status(400).json(
        snowflakeShape.errorTransform('SQL statement is required in the request body', '000900')
      );
      return;
    }

    // Validate statement is a string
    if (typeof statement !== 'string') {
      logger.warn('Snowflake execute: statement is not a string');
      res.status(400).json(
        snowflakeShape.errorTransform('SQL statement must be a string', '000900')
      );
      return;
    }

    // Validate statement is not empty
    if (statement.trim().length === 0) {
      logger.warn('Snowflake execute: empty statement');
      res.status(400).json(
        snowflakeShape.errorTransform('SQL statement cannot be empty', '000900')
      );
      return;
    }

    logger.info('Snowflake SQL statement execution', {
      statementPreview: statement.substring(0, 100) + (statement.length > 100 ? '...' : ''),
      database: database || 'MOCK_DB',
      schema: schema || 'PUBLIC',
      warehouse: warehouse || 'MOCK_WH',
      role: role || 'PUBLIC',
      hasBindings: !!bindings,
      hasParameters: !!parameters,
    });

    // Execute the statement via the Snowflake service
    const result = await snowflakeService.executeStatement({
      statement,
      timeout,
      database,
      schema,
      warehouse,
      role,
      bindings,
      parameters,
    });

    // Check if result is an error response
    const resultObj = result as { code?: string; message?: string };
    if (resultObj.code && resultObj.code !== '090001') {
      // Return error with appropriate HTTP status
      const statusCode = getHttpStatusFromSnowflakeCode(resultObj.code);
      res.status(statusCode).json(result);
      return;
    }

    // Success response
    res.status(200).json(result);
  })
);

/**
 * GET /statements/:statementHandle
 *
 * Get the status of a statement execution.
 *
 * Path Parameters:
 * - statementHandle: Unique identifier for the statement
 *
 * Response:
 * - statementHandle: Statement identifier
 * - statementStatus: RUNNING, SUCCESS, FAILED_WITH_ERROR, or ABORTED
 * - statementStatusUrl: URL to check status
 * - code: Snowflake status code
 * - sqlState: SQL state code
 * - message: Status message
 * - progressInfo: (for running) Progress percentage
 */
router.get(
  '/:statementHandle',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { statementHandle } = req.params;

    if (!statementHandle) {
      res.status(400).json(
        snowflakeShape.errorTransform('Statement handle is required', '000900')
      );
      return;
    }

    logger.debug(`Snowflake get statement status: ${statementHandle}`);

    const result = await snowflakeService.getStatementStatus(statementHandle);

    // Check if statement was not found
    const resultObj = result as { code?: string; message?: string };
    if (resultObj.code === '000900' && resultObj.message?.includes('not found')) {
      res.status(404).json(result);
      return;
    }

    res.status(200).json(result);
  })
);

/**
 * GET /statements/:statementHandle/result
 *
 * Get the results of a completed statement.
 *
 * Path Parameters:
 * - statementHandle: Unique identifier for the statement
 *
 * Query Parameters:
 * - partition: (optional) Partition number for large result sets (0-based)
 *
 * Response (success):
 * - resultSetMetaData: Column metadata and partition info
 * - data: Query results as string arrays
 * - statementHandle: Statement identifier
 * - code: 090001 (success)
 *
 * Error Codes:
 * - 000900: Statement not found or result expired
 * - 333334: Statement is still running
 */
router.get(
  '/:statementHandle/result',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { statementHandle } = req.params;
    const partitionParam = req.query.partition;

    if (!statementHandle) {
      res.status(400).json(
        snowflakeShape.errorTransform('Statement handle is required', '000900')
      );
      return;
    }

    // Parse partition parameter
    let partition: number | undefined;
    if (partitionParam !== undefined) {
      partition = parseInt(partitionParam as string, 10);
      if (isNaN(partition) || partition < 0) {
        res.status(400).json(
          snowflakeShape.errorTransform('Partition must be a non-negative integer', '000900')
        );
        return;
      }
    }

    logger.debug(`Snowflake get statement result: ${statementHandle}, partition: ${partition}`);

    const result = await snowflakeService.getStatementResult(statementHandle, partition);

    // Check for various error conditions
    const resultObj = result as { code?: string; message?: string };
    if (resultObj.code === '000900') {
      if (resultObj.message?.includes('not found')) {
        res.status(404).json(result);
        return;
      }
      if (resultObj.message?.includes('expired')) {
        res.status(410).json(result); // Gone
        return;
      }
      res.status(400).json(result);
      return;
    }

    if (resultObj.code === '333334') {
      // Statement still running - return 202 Accepted
      res.status(202).json(result);
      return;
    }

    res.status(200).json(result);
  })
);

/**
 * POST /statements/:statementHandle/cancel
 *
 * Cancel a running statement.
 *
 * Path Parameters:
 * - statementHandle: Unique identifier for the statement
 *
 * Response (success):
 * - statementHandle: Statement identifier
 * - statementStatus: ABORTED
 * - code: 333334
 * - message: Statement was cancelled.
 *
 * Error Codes:
 * - 000900: Statement not found or cannot be cancelled
 */
router.post(
  '/:statementHandle/cancel',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { statementHandle } = req.params;

    if (!statementHandle) {
      res.status(400).json(
        snowflakeShape.errorTransform('Statement handle is required', '000900')
      );
      return;
    }

    logger.info(`Snowflake cancel statement: ${statementHandle}`);

    const result = await snowflakeService.cancelStatement(statementHandle);

    // Check if statement was not found
    const resultObj = result as { code?: string; message?: string };
    if (resultObj.code === '000900') {
      if (resultObj.message?.includes('not found')) {
        res.status(404).json(result);
        return;
      }
      // Cannot cancel (already completed or failed)
      res.status(409).json(result); // Conflict
      return;
    }

    res.status(200).json(result);
  })
);

/**
 * Map Snowflake error codes to HTTP status codes
 */
function getHttpStatusFromSnowflakeCode(code: string): number {
  const statusMap: Record<string, number> = {
    '000900': 400, // Generic SQL error
    '001003': 400, // SQL syntax error
    '002003': 404, // Object does not exist
    '003001': 403, // Permission denied
    '000604': 408, // Query timeout
    '333334': 202, // Statement still running
    '390103': 401, // OAuth token missing/invalid
    '390104': 401, // OAuth token expired
  };

  return statusMap[code] || 400;
}

export default router;
