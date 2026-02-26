/**
 * Test script to verify WireMock integration
 *
 * Run with: npx ts-node scripts/test-wiremock-integration.ts
 */

import axios from 'axios';

const WIREMOCK_URL = process.env.WIREMOCK_URL || 'http://localhost:8080';

async function testWireMockIntegration() {
  console.log('=== WireMock Integration Test ===\n');

  // Test 1: Health check
  console.log('1. Testing WireMock health...');
  try {
    const health = await axios.get(`${WIREMOCK_URL}/__admin/health`);
    console.log(`   ✓ WireMock is healthy: ${health.data.status}\n`);
  } catch (error) {
    console.error('   ✗ WireMock health check failed:', (error as Error).message);
    process.exit(1);
  }

  // Test 2: List databases
  console.log('2. Testing list_databases (GET /api/v2/databases)...');
  try {
    const response = await axios.get(`${WIREMOCK_URL}/api/v2/databases`);
    console.log(`   ✓ Got ${response.data.data?.length || 0} databases`);
    console.log(`   Response:`, JSON.stringify(response.data, null, 2).split('\n').map(l => '   ' + l).join('\n'));
    console.log();
  } catch (error) {
    console.error('   ✗ List databases failed:', (error as Error).message);
  }

  // Test 3: Execute SQL statement
  console.log('3. Testing execute_sql (POST /api/v2/statements)...');
  try {
    const response = await axios.post(`${WIREMOCK_URL}/api/v2/statements`, {
      statement: 'SELECT * FROM CUSTOMERS LIMIT 10',
      database: 'SAMPLE_DATA',
      schema: 'PUBLIC',
    });
    console.log(`   ✓ Statement submitted successfully`);
    console.log(`   Statement handle: ${response.data.statementHandle}`);
    console.log(`   Status: ${response.data.code} - ${response.data.message}\n`);
  } catch (error) {
    console.error('   ✗ Execute SQL failed:', (error as Error).message);
  }

  // Test 4: Get statement status
  console.log('4. Testing get_statement_status (GET /api/v2/statements/{handle})...');
  try {
    const response = await axios.get(`${WIREMOCK_URL}/api/v2/statements/test-handle-123`);
    console.log(`   ✓ Got statement status`);
    console.log(`   Status: ${response.data.statementStatus || response.data.code}\n`);
  } catch (error) {
    console.error('   ✗ Get statement status failed:', (error as Error).message);
  }

  // Test 5: Request log
  console.log('5. Checking WireMock request log...');
  try {
    const response = await axios.get(`${WIREMOCK_URL}/__admin/requests`, {
      params: { limit: 5 },
    });
    const requests = response.data.requests || [];
    console.log(`   ✓ Found ${requests.length} recent requests`);
    requests.forEach((req: { request: { method: string; url: string }; response: { status: number } }, i: number) => {
      console.log(`   ${i + 1}. ${req.request.method} ${req.request.url} → ${req.response.status}`);
    });
    console.log();
  } catch (error) {
    console.error('   ✗ Get request log failed:', (error as Error).message);
  }

  console.log('=== Integration Test Complete ===');
}

testWireMockIntegration().catch(console.error);
