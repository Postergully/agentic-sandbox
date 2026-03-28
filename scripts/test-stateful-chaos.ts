/**
 * Test script to verify stateful CRUD and chaos injection
 *
 * Run with: npx ts-node scripts/test-stateful-chaos.ts
 */

import axios from 'axios';

const WIREMOCK_URL = process.env.WIREMOCK_URL || 'http://localhost:8080';

async function resetScenarios() {
  await axios.post(`${WIREMOCK_URL}/__admin/scenarios/reset`);
}

async function testStatefulCrud() {
  console.log('=== Stateful CRUD Test ===\n');

  // Reset scenarios to initial state
  console.log('Resetting scenarios...');
  await resetScenarios();
  console.log('   ✓ Scenarios reset\n');

  // Test 1: Initially, db-new-001 should not exist (404)
  console.log('1. Verify database does not exist initially...');
  try {
    await axios.get(`${WIREMOCK_URL}/api/v2/databases/db-new-001`);
    console.log('   ✗ Expected 404 but got success');
  } catch (error: unknown) {
    const axiosError = error as { response?: { status: number } };
    if (axiosError.response?.status === 404) {
      console.log('   ✓ Database not found (404) as expected\n');
    } else {
      console.log(`   ✗ Unexpected error: ${(error as Error).message}\n`);
    }
  }

  // Test 2: Create a new database
  console.log('2. Creating new database...');
  try {
    const response = await axios.post(`${WIREMOCK_URL}/api/v2/databases`, {
      name: 'NEW_DATABASE',
      owner: 'ACCOUNTADMIN',
      comment: 'Newly created database',
    });
    console.log(`   ✓ Database created: ${response.data.name}`);
    console.log(`     ID: ${response.data.id}`);
    console.log(`     Status: ${response.status}\n`);
  } catch (error) {
    console.log(`   ✗ Create failed: ${(error as Error).message}\n`);
  }

  // Test 3: Get the created database (should now exist)
  console.log('3. Verifying database exists after creation...');
  try {
    const response = await axios.get(`${WIREMOCK_URL}/api/v2/databases/db-new-001`);
    console.log(`   ✓ Database found: ${response.data.name}`);
    console.log(`     Owner: ${response.data.owner}\n`);
  } catch (error) {
    console.log(`   ✗ Get failed: ${(error as Error).message}\n`);
  }

  // Test 4: Update the database
  console.log('4. Updating database...');
  try {
    const response = await axios.put(`${WIREMOCK_URL}/api/v2/databases/db-new-001`, {
      name: 'UPDATED_DATABASE',
      owner: 'SYSADMIN',
      comment: 'Updated database',
    });
    console.log(`   ✓ Database updated: ${response.data.name}`);
    console.log(`     Owner: ${response.data.owner}\n`);
  } catch (error) {
    console.log(`   ✗ Update failed: ${(error as Error).message}\n`);
  }

  console.log('=== Stateful CRUD Test Complete ===\n');
}

async function testChaosInjection() {
  console.log('=== Chaos Injection Test ===\n');

  // Test 1: 500 Error via header
  console.log('1. Testing 500 error injection...');
  try {
    await axios.get(`${WIREMOCK_URL}/api/v2/databases`, {
      headers: { 'X-Chaos-Error': '500' },
    });
    console.log('   ✗ Expected 500 error but got success');
  } catch (error: unknown) {
    const axiosError = error as { response?: { status: number; data?: { message?: string } } };
    if (axiosError.response?.status === 500) {
      console.log(`   ✓ Got 500 error: ${axiosError.response?.data?.message}\n`);
    } else {
      console.log(`   ✗ Unexpected response: ${(error as Error).message}\n`);
    }
  }

  // Test 2: 429 Rate Limit
  console.log('2. Testing 429 rate limit injection...');
  try {
    await axios.get(`${WIREMOCK_URL}/api/v2/databases`, {
      headers: { 'X-Chaos-Error': '429' },
    });
    console.log('   ✗ Expected 429 error but got success');
  } catch (error: unknown) {
    const axiosError = error as { response?: { status: number; data?: { message?: string }; headers?: { 'retry-after'?: string } } };
    if (axiosError.response?.status === 429) {
      console.log(`   ✓ Got 429 error: ${axiosError.response?.data?.message}`);
      console.log(`     Retry-After: ${axiosError.response?.headers?.['retry-after']}\n`);
    } else {
      console.log(`   ✗ Unexpected response: ${(error as Error).message}\n`);
    }
  }

  // Test 3: 503 Service Unavailable
  console.log('3. Testing 503 service unavailable injection...');
  try {
    await axios.get(`${WIREMOCK_URL}/api/v2/databases`, {
      headers: { 'X-Chaos-Error': '503' },
    });
    console.log('   ✗ Expected 503 error but got success');
  } catch (error: unknown) {
    const axiosError = error as { response?: { status: number; data?: { message?: string } } };
    if (axiosError.response?.status === 503) {
      console.log(`   ✓ Got 503 error: ${axiosError.response?.data?.message}\n`);
    } else {
      console.log(`   ✗ Unexpected response: ${(error as Error).message}\n`);
    }
  }

  // Test 4: Malformed JSON
  console.log('4. Testing malformed JSON injection...');
  try {
    const response = await axios.get(`${WIREMOCK_URL}/api/v2/databases`, {
      headers: { 'X-Chaos-Error': 'malformed' },
      transformResponse: (data) => data, // Don't parse JSON
    });
    console.log(`   ✓ Got malformed response: "${response.data.substring(0, 30)}..."\n`);
  } catch (error) {
    console.log(`   Response triggers parse error: ${(error as Error).message}\n`);
  }

  // Test 5: Normal request (no chaos)
  console.log('5. Verifying normal requests still work...');
  try {
    const response = await axios.get(`${WIREMOCK_URL}/api/v2/databases`);
    console.log(`   ✓ Normal request successful: ${response.data.data?.length} databases\n`);
  } catch (error) {
    console.log(`   ✗ Normal request failed: ${(error as Error).message}\n`);
  }

  console.log('=== Chaos Injection Test Complete ===\n');
}

async function main() {
  try {
    await testStatefulCrud();
    await testChaosInjection();
  } catch (error) {
    console.error('Test suite failed:', (error as Error).message);
    process.exit(1);
  }
}

main();
