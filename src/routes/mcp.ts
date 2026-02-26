/**
 * MCP (Model Context Protocol) Routes
 *
 * Implements MCP protocol endpoints for Claude Cowork / Claude Desktop integration.
 * MCP is Anthropic's protocol for connecting Claude to external tools and data sources.
 *
 * This implementation proxies tool calls to WireMock for dynamic mock responses.
 *
 * Endpoints:
 *   GET  /mcp           - Server info and capabilities
 *   POST /mcp           - Handle MCP messages (tool calls, etc.)
 */

import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import { wiremockProxyService } from '../services/wiremockProxyService';

const router = Router();

// MCP Protocol version
const MCP_VERSION = '2024-11-05';

// Server info (for initialize response)
const SERVER_INFO = {
  name: 'agentic-sandbox',
  version: '1.0.0',
};

// Server capabilities (for initialize response)
const SERVER_CAPABILITIES = {
  tools: { listChanged: true },
  resources: {},
  prompts: {},
};

/**
 * GET /mcp - Server info endpoint
 * Returns server capabilities for MCP discovery
 */
router.get('/', async (_req: Request, res: Response) => {
  logger.info('MCP: Discovery request received');

  // Check WireMock health
  const isHealthy = await wiremockProxyService.isHealthy();
  if (!isHealthy) {
    logger.warn('MCP: WireMock is not healthy, some tools may be unavailable');
  }

  res.json({
    jsonrpc: '2.0',
    result: {
      protocolVersion: MCP_VERSION,
      capabilities: SERVER_CAPABILITIES,
      serverInfo: SERVER_INFO,
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
          protocolVersion: MCP_VERSION,
          capabilities: SERVER_CAPABILITIES,
          serverInfo: SERVER_INFO,
        };
        break;

      case 'notifications/initialized':
        // Client notification that initialization is complete - no response needed
        res.status(204).end();
        return;

      case 'tools/list':
        result = await handleToolsList(params);
        break;

      case 'tools/call':
        result = await handleToolCall(params, req);
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
 * Handle tools/list - Get available tools from WireMock proxy
 */
async function handleToolsList(
  _params?: { cursor?: string }
): Promise<{ tools: unknown[]; nextCursor?: string }> {
  // Get tools from WireMock proxy service
  // Default to Snowflake connector for now
  const connector = 'snowflake';
  const tools = await wiremockProxyService.getTools(connector);

  logger.info(`MCP: Returning ${tools.length} tools for ${connector}`);

  return { tools };
}

/**
 * Handle tool calls by proxying to WireMock
 */
async function handleToolCall(
  params: { name: string; arguments?: Record<string, unknown> },
  req: Request
): Promise<unknown> {
  const { name, arguments: args = {} } = params;

  logger.info(`MCP: Tool call: ${name}`, args);

  // Extract instance ID from headers or query params if provided
  const instanceId =
    (req.headers['x-mock-instance-id'] as string) ||
    (req.query.instanceId as string) ||
    undefined;

  // Execute tool call via WireMock proxy
  const result = await wiremockProxyService.executeToolCall(name, args, instanceId);

  if (result.isError) {
    logger.warn(`MCP: Tool ${name} returned error`, result);
  } else {
    logger.info(`MCP: Tool ${name} completed successfully`);
  }

  return result;
}

export default router;
