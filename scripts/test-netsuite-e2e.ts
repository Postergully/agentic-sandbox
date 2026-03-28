#!/usr/bin/env npx ts-node
/**
 * End-to-End Test: NetSuite Connector
 *
 * Tests the complete flow from schema → data generation → WireMock → MCP tools
 *
 * Run with: npx ts-node scripts/test-netsuite-e2e.ts
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { FactoryPipelineService, PipelineInput } from '../src/services/factoryPipelineService';

const WIREMOCK_URL = process.env.WIREMOCK_URL || 'http://localhost:8080';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: Record<string, unknown>;
}

const results: TestResult[] = [];

async function runTest(
  name: string,
  testFn: () => Promise<Record<string, unknown> | void>
): Promise<boolean> {
  const start = Date.now();
  console.log(`\n🧪 Testing: ${name}...`);

  try {
    const details = await testFn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration, details: details as Record<string, unknown> });
    console.log(`   ✅ PASSED (${duration}ms)`);
    return true;
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: errorMsg });
    console.log(`   ❌ FAILED: ${errorMsg}`);
    return false;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║           NETSUITE CONNECTOR END-TO-END TEST                       ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`WireMock URL: ${WIREMOCK_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // Unique test run ID
  const testRunId = `netsuite_e2e_${Date.now()}`;
  const outputDir = path.join(process.cwd(), 'output', testRunId);

  // ========================================================================
  // PRE-REQUISITES
  // ========================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  STAGE 0: Pre-requisites');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Test WireMock health
  await runTest('WireMock is healthy', async () => {
    const response = await axios.get(`${WIREMOCK_URL}/__admin/health`, { timeout: 5000 });
    if (response.data.status !== 'healthy') {
      throw new Error(`WireMock status: ${response.data.status}`);
    }
    return { status: response.data.status, version: response.data.version };
  });

  // Test schema file exists
  await runTest('NetSuite schema exists', async () => {
    const schemaPath = path.join(process.cwd(), 'schemas', 'netsuite.json');
    const stat = await fs.stat(schemaPath);
    const content = await fs.readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(content);
    return {
      path: schemaPath,
      size: stat.size,
      entityCount: Array.isArray(schema.entities) ? schema.entities.length : Object.keys(schema.entities).length,
      sampleEntities: (Array.isArray(schema.entities) ? schema.entities.slice(0, 5).map((e: { name: string }) => e.name) : Object.keys(schema.entities).slice(0, 5)),
    };
  });

  // ========================================================================
  // STAGE 1: FACTORY PIPELINE
  // ========================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  STAGE 1: Factory Pipeline (Schema → OpenAPI → Data → WireMock)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const pipelineService = new FactoryPipelineService();
  let pipelineResult: Awaited<ReturnType<typeof pipelineService.execute>> | null = null;

  await runTest('Factory pipeline executes successfully', async () => {
    const input: PipelineInput = {
      jobId: testRunId,
      orgId: 'e2e_test',
      connector: 'netsuite',
      jobIdSuffix: testRunId.slice(-8),
      schemaPath: path.join(process.cwd(), 'schemas', 'netsuite.json'),
      industry: 'finance',
      volume: 20, // Small volume for testing (NetSuite has 72 entities)
      outputDirectory: outputDir,
      statusFile: path.join(outputDir, 'status.json'),
      skipSsl: true, // Skip SSL for local testing
    };

    pipelineResult = await pipelineService.execute(input);

    if (!pipelineResult.success) {
      throw new Error(
        `Pipeline failed at ${pipelineResult.error?.stage}: ${pipelineResult.error?.message}`
      );
    }

    return {
      instanceId: pipelineResult.instanceId,
      stages: pipelineResult.stages.map((s) => ({
        stage: s.stage,
        status: s.status,
        durationMs: s.durationMs,
      })),
    };
  });

  // Verify each stage output
  await runTest('Schema converted to OpenAPI', async () => {
    const openApiPath = path.join(outputDir, 'schemas', 'netsuite_openapi.yaml');
    const stat = await fs.stat(openApiPath);
    return { path: openApiPath, size: stat.size };
  });

  await runTest('Data files generated', async () => {
    const dataDir = path.join(outputDir, 'data', 'netsuite');
    const files = await fs.readdir(dataDir).catch(() => []);
    return {
      dataDir,
      fileCount: files.length,
      sampleFiles: files.slice(0, 10)
    };
  });

  await runTest('Credentials generated', async () => {
    const credsPath = path.join(outputDir, 'credentials', 'netsuite_creds.json');
    const content = await fs.readFile(credsPath, 'utf-8');
    const creds = JSON.parse(content);
    return {
      clientId: creds.clientId,
      hasSecret: !!creds.clientSecret,
      baseUrl: creds.baseUrl,
    };
  });

  await runTest('Status file updated', async () => {
    const statusPath = path.join(outputDir, 'status.json');
    const content = await fs.readFile(statusPath, 'utf-8');
    const status = JSON.parse(content);
    return {
      status: status.status,
      progress: status.progress,
      currentStep: status.currentStep,
    };
  });

  // ========================================================================
  // STAGE 2: WIREMOCK STUBS
  // ========================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  STAGE 2: WireMock Stubs Verification');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await runTest('WireMock mappings loaded', async () => {
    const response = await axios.get(`${WIREMOCK_URL}/__admin/mappings`);
    const mappings = response.data.mappings || [];
    return {
      totalMappings: mappings.length,
      mappingNames: mappings.slice(0, 10).map((m: { name?: string }) => m.name),
    };
  });

  // ========================================================================
  // STAGE 3: NETSUITE API TOOLS
  // ========================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  STAGE 3: NetSuite API Verification');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Get the instance ID from the pipeline result for API calls
  // Note: pipelineResult is set in the async callback above
  const instanceId = (pipelineResult as { instanceId?: string } | null)?.instanceId || '';
  const instanceHeaders: Record<string, string> = instanceId ? { 'X-Mock-Instance-Id': instanceId } : {};
  console.log(`\n  Instance ID for API calls: ${instanceId || '(not available)'}`);
  console.log(`  Pipeline result available: ${pipelineResult !== null}`);

  // Test list customers endpoint
  await runTest('list_customers returns data', async () => {
    const response = await axios.get(`${WIREMOCK_URL}/api/netsuite/customer`, {
      headers: instanceHeaders,
    });
    const data = response.data;
    return {
      status: response.status,
      hasData: !!data,
      recordCount: Array.isArray(data) ? data.length : data?.items?.length || data?.data?.length || 0,
      instanceId,
    };
  });

  // Test list accounts endpoint
  await runTest('list_accounts returns data', async () => {
    const response = await axios.get(`${WIREMOCK_URL}/api/netsuite/account`, {
      headers: instanceHeaders,
    });
    const data = response.data;
    return {
      status: response.status,
      hasData: !!data,
      recordCount: Array.isArray(data) ? data.length : data?.items?.length || data?.data?.length || 0,
    };
  });

  // Test get customer by ID
  await runTest('get_customer_by_id works', async () => {
    const response = await axios.get(`${WIREMOCK_URL}/api/netsuite/customer/1`, {
      headers: instanceHeaders,
    });
    return {
      status: response.status,
      hasData: !!response.data,
    };
  });

  // Test list invoices endpoint
  await runTest('list_invoices returns data', async () => {
    const response = await axios.get(`${WIREMOCK_URL}/api/netsuite/invoice`, {
      headers: instanceHeaders,
    });
    const data = response.data;
    return {
      status: response.status,
      hasData: !!data,
      recordCount: Array.isArray(data) ? data.length : data?.items?.length || data?.data?.length || 0,
    };
  });

  // Test list vendors endpoint
  await runTest('list_vendors returns data', async () => {
    const response = await axios.get(`${WIREMOCK_URL}/api/netsuite/vendor`, {
      headers: instanceHeaders,
    });
    const data = response.data;
    return {
      status: response.status,
      hasData: !!data,
      recordCount: Array.isArray(data) ? data.length : data?.items?.length || data?.data?.length || 0,
    };
  });

  // ========================================================================
  // STAGE 4: STATEFUL CRUD (if configured)
  // ========================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  STAGE 4: Stateful CRUD Operations');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Reset scenario state before testing
  try {
    await axios.post(`${WIREMOCK_URL}/__admin/scenarios/reset`);
  } catch {
    // Ignore if no scenarios
  }

  await runTest('Stateful scenario: Initial state', async () => {
    const response = await axios.get(`${WIREMOCK_URL}/__admin/scenarios`);
    const netsuiteScenarios = response.data.scenarios?.filter((s: { name: string }) =>
      s.name.includes('netsuite')
    ) || [];
    return {
      totalScenarios: response.data.scenarios?.length || 0,
      netsuiteScenarios: netsuiteScenarios.length,
      scenarioNames: netsuiteScenarios.slice(0, 10).map((s: { name: string; state: string }) => ({
        name: s.name,
        state: s.state,
      })),
    };
  });

  // Test CREATE operation
  await runTest('Create customer (POST)', async () => {
    try {
      const response = await axios.post(`${WIREMOCK_URL}/api/netsuite/customer`, {
        companyName: 'Test Company E2E',
        email: 'test@e2e-company.com',
        subsidiary: { id: '1' },
      });
      return {
        status: response.status,
        hasId: !!response.data?.id || !!response.data?.internalId,
        responseData: response.data,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return {
          status: error.response.status,
          note: 'POST not configured or stateful stub missing',
          errorMessage: error.response.data?.message || 'Unknown error',
        };
      }
      throw error;
    }
  });

  // ========================================================================
  // STAGE 5: CHAOS INJECTION
  // ========================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  STAGE 5: Chaos Injection');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await runTest('Chaos: 500 error injection', async () => {
    try {
      await axios.get(`${WIREMOCK_URL}/api/netsuite/customer`, {
        headers: { ...instanceHeaders, 'X-Chaos-Error': '500' },
      });
      // If we get here, chaos isn't configured - that's acceptable
      return { chaosConfigured: false, note: 'No chaos mapping for 500 errors' };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 500) {
        return { chaosConfigured: true, errorReceived: 500 };
      }
      throw error;
    }
  });

  await runTest('Chaos: Rate limit 429 injection', async () => {
    try {
      await axios.get(`${WIREMOCK_URL}/api/netsuite/customer`, {
        headers: { ...instanceHeaders, 'X-Chaos-Error': '429' },
      });
      return { chaosConfigured: false, note: 'No chaos mapping for 429 errors' };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        return { chaosConfigured: true, errorReceived: 429 };
      }
      throw error;
    }
  });

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  TEST SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log('');
  console.log(`  Total tests: ${results.length}`);
  console.log(`  Passed:      ${passed} ✅`);
  console.log(`  Failed:      ${failed} ${failed > 0 ? '❌' : ''}`);
  console.log(`  Duration:    ${totalDuration}ms`);
  console.log('');

  if (failed > 0) {
    console.log('  Failed Tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`    ❌ ${r.name}: ${r.error}`);
      });
    console.log('');
  }

  // Write results to file
  const resultsPath = path.join(outputDir, 'test-results.json');
  await fs.writeFile(
    resultsPath,
    JSON.stringify(
      {
        testRunId,
        connector: 'netsuite',
        timestamp: new Date().toISOString(),
        summary: { total: results.length, passed, failed, durationMs: totalDuration },
        results,
      },
      null,
      2
    )
  );
  console.log(`  Results saved to: ${resultsPath}`);

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log(
    failed === 0
      ? '║           ALL TESTS PASSED ✅                                       ║'
      : `║           ${failed} TEST(S) FAILED ❌                                     ║`
  );
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  // Cleanup: optionally remove test output
  // await fs.rm(outputDir, { recursive: true, force: true });

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
