/**
 * Test script to verify MCP routes work with WireMock backend
 *
 * Run with: npx ts-node scripts/test-mcp-wiremock.ts
 *
 * Note: Requires the main server to be running (npm run dev)
 */

import axios from 'axios';

const MCP_URL = process.env.MCP_URL || 'http://localhost:3000/mcp';

async function sendMcpRequest(method: string, params?: unknown, id = 1) {
  const response = await axios.post(MCP_URL, {
    jsonrpc: '2.0',
    id,
    method,
    params,
  });
  return response.data;
}

async function testMcpWireMock() {
  console.log('=== MCP + WireMock Integration Test ===\n');

  // Test 1: Initialize
  console.log('1. Testing MCP initialize...');
  try {
    const result = await sendMcpRequest('initialize');
    console.log(`   ✓ Protocol version: ${result.result?.protocolVersion}`);
    console.log(`   ✓ Server: ${result.result?.serverInfo?.name} v${result.result?.serverInfo?.version}`);
    console.log();
  } catch (error) {
    console.error('   ✗ Initialize failed:', (error as Error).message);
    console.log('\n   Note: Make sure the server is running with: npm run dev\n');
    process.exit(1);
  }

  // Test 2: List Tools
  console.log('2. Testing tools/list...');
  try {
    const result = await sendMcpRequest('tools/list');
    const tools = result.result?.tools || [];
    console.log(`   ✓ Got ${tools.length} tools:`);
    tools.forEach((tool: { name: string; description: string }) => {
      console.log(`     - ${tool.name}: ${tool.description}`);
    });
    console.log();
  } catch (error) {
    console.error('   ✗ tools/list failed:', (error as Error).message);
  }

  // Test 3: Call list_databases tool
  console.log('3. Testing tools/call: list_databases...');
  try {
    const result = await sendMcpRequest('tools/call', {
      name: 'list_databases',
      arguments: {},
    });
    const content = result.result?.content?.[0]?.text;
    if (content) {
      const parsed = JSON.parse(content);
      console.log(`   ✓ Got ${parsed.databases?.length || 'unknown'} databases`);
      if (parsed.databases) {
        parsed.databases.forEach((db: { name: string }) => {
          console.log(`     - ${db.name || db}`);
        });
      }
    }
    console.log();
  } catch (error) {
    console.error('   ✗ list_databases failed:', (error as Error).message);
  }

  // Test 4: Call execute_sql tool
  console.log('4. Testing tools/call: execute_sql...');
  try {
    const result = await sendMcpRequest('tools/call', {
      name: 'execute_sql',
      arguments: {
        statement: 'SELECT * FROM CUSTOMERS LIMIT 5',
        database: 'SAMPLE_DATA',
        schema: 'PUBLIC',
      },
    });
    const content = result.result?.content?.[0]?.text;
    if (content) {
      const parsed = JSON.parse(content);
      console.log(`   ✓ Statement executed: ${parsed.success ? 'success' : 'failed'}`);
      console.log(`     Handle: ${parsed.statementHandle}`);
      console.log(`     Message: ${parsed.message}`);
    }
    console.log();
  } catch (error) {
    console.error('   ✗ execute_sql failed:', (error as Error).message);
  }

  // Test 5: Call list_tables tool
  console.log('5. Testing tools/call: list_tables...');
  try {
    const result = await sendMcpRequest('tools/call', {
      name: 'list_tables',
      arguments: {
        database: 'SAMPLE_DATA',
        schema: 'PUBLIC',
      },
    });
    const content = result.result?.content?.[0]?.text;
    if (content) {
      const parsed = JSON.parse(content);
      console.log(`   ✓ Got ${parsed.tables?.length || 'unknown'} tables`);
      if (parsed.tables) {
        parsed.tables.forEach((table: { name: string } | string) => {
          const name = typeof table === 'string' ? table : table.name;
          console.log(`     - ${name}`);
        });
      }
    }
    console.log();
  } catch (error) {
    console.error('   ✗ list_tables failed:', (error as Error).message);
  }

  // Test 6: Ping
  console.log('6. Testing ping...');
  try {
    const result = await sendMcpRequest('ping');
    console.log(`   ✓ Ping successful: ${JSON.stringify(result.result)}`);
    console.log();
  } catch (error) {
    console.error('   ✗ Ping failed:', (error as Error).message);
  }

  // Test 7: Unknown tool (error handling)
  console.log('7. Testing error handling (unknown tool)...');
  try {
    const result = await sendMcpRequest('tools/call', {
      name: 'unknown_tool',
      arguments: {},
    });
    const content = result.result?.content?.[0]?.text;
    if (content) {
      const parsed = JSON.parse(content);
      if (parsed.error) {
        console.log(`   ✓ Error returned as expected: ${parsed.message}`);
      }
    }
    console.log();
  } catch (error) {
    console.error('   ✗ Error handling test failed:', (error as Error).message);
  }

  console.log('=== MCP + WireMock Test Complete ===');
}

testMcpWireMock().catch(console.error);
