/**
 * MCP (Model Context Protocol) Routes
 *
 * Implements basic MCP protocol endpoints for Claude Cowork / Claude Desktop integration.
 * MCP is Anthropic's protocol for connecting Claude to external tools and data sources.
 *
 * Endpoints:
 *   GET  /mcp           - Server info and capabilities
 *   POST /mcp           - Handle MCP messages (tool calls, etc.)
 */

import { Router, Request, Response } from 'express';
import logger from '../utils/logger';

const router = Router();

// MCP Protocol version
const MCP_VERSION = '2024-11-05';

// Server capabilities
const SERVER_INFO = {
  name: 'agentic-sandbox',
  version: '1.0.0',
  protocolVersion: MCP_VERSION,
  capabilities: {
    tools: {},
    resources: {},
    prompts: {},
  },
};

// Available tools for Snowflake mock
const SNOWFLAKE_TOOLS = [
  {
    name: 'execute_sql',
    description: 'Execute a SQL query against Snowflake',
    inputSchema: {
      type: 'object',
      properties: {
        statement: {
          type: 'string',
          description: 'SQL statement to execute',
        },
        database: {
          type: 'string',
          description: 'Database name (optional)',
        },
        schema: {
          type: 'string',
          description: 'Schema name (optional)',
        },
      },
      required: ['statement'],
    },
  },
  {
    name: 'list_databases',
    description: 'List all databases in Snowflake',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_tables',
    description: 'List tables in a database/schema',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string' },
        schema: { type: 'string' },
      },
    },
  },
];

/**
 * GET /mcp - Server info endpoint
 * Returns server capabilities for MCP discovery
 */
router.get('/', (_req: Request, res: Response) => {
  logger.info('MCP: Discovery request received');

  res.json({
    jsonrpc: '2.0',
    result: {
      ...SERVER_INFO,
      tools: SNOWFLAKE_TOOLS,
    },
  });
});

/**
 * POST /mcp - Handle MCP JSON-RPC messages
 */
router.post('/', async (req: Request, res: Response) => {
  const { jsonrpc, id, method, params } = req.body;

  logger.info(`MCP: Received method=${method} id=${id}`);

  if (jsonrpc !== '2.0') {
    res.status(400).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32600, message: 'Invalid Request: must use JSON-RPC 2.0' },
    });
    return;
  }

  try {
    let result: unknown;

    switch (method) {
      case 'initialize':
        result = {
          ...SERVER_INFO,
          tools: SNOWFLAKE_TOOLS,
        };
        break;

      case 'tools/list':
        result = { tools: SNOWFLAKE_TOOLS };
        break;

      case 'tools/call':
        result = await handleToolCall(params);
        break;

      case 'resources/list':
        result = { resources: [] };
        break;

      case 'prompts/list':
        result = { prompts: [] };
        break;

      case 'ping':
        result = {};
        break;

      default:
        res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
        return;
    }

    res.json({
      jsonrpc: '2.0',
      id,
      result,
    });
  } catch (error) {
    logger.error('MCP: Error handling request', error);
    res.json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error',
      },
    });
  }
});

/**
 * Handle tool calls
 */
async function handleToolCall(params: { name: string; arguments?: Record<string, unknown> }): Promise<unknown> {
  const { name, arguments: args } = params;

  logger.info(`MCP: Tool call: ${name}`, args);

  switch (name) {
    case 'execute_sql':
      // Mock SQL execution
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              statement: args?.statement,
              data: [
                { id: 1, name: 'Mock Result 1' },
                { id: 2, name: 'Mock Result 2' },
              ],
              rowCount: 2,
              message: 'Query executed successfully (mock)',
            }, null, 2),
          },
        ],
      };

    case 'list_databases':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              databases: ['MOCK_DB', 'SAMPLE_DATA', 'ANALYTICS'],
            }, null, 2),
          },
        ],
      };

    case 'list_tables':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              tables: ['CUSTOMERS', 'ORDERS', 'PRODUCTS', 'ORDER_ITEMS'],
            }, null, 2),
          },
        ],
      };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default router;
