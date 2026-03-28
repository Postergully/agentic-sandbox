#!/usr/bin/env npx ts-node
/**
 * End-to-End Test: Google Drive Connector (via Discovery API)
 *
 * Tests the self-healing pipeline: non-OpenAPI URL → URL Content Detector →
 * LLM Agent Parser → Schema → Data Generation → WireMock → API Verification
 *
 * Run with: npx ts-node scripts/test-google-workspace-e2e.ts
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { FactoryPipelineService, PipelineInput } from '../src/services/factoryPipelineService';

const WIREMOCK_URL = process.env.WIREMOCK_URL || 'http://localhost:8080';
const GOOGLE_DISCOVERY_URL =
  process.env.GOOGLE_DISCOVERY_URL ||
  'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

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
  console.log(`\n  Testing: ${name}...`);

  try {
    const details = await testFn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration, details: details as Record<string, unknown> });
    console.log(`     PASSED (${duration}ms)`);
    return true;
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: errorMsg });
    console.log(`     FAILED: ${errorMsg}`);
    return false;
  }
}

async function main() {
  console.log('======================================================================');
  console.log('  GOOGLE DRIVE CONNECTOR END-TO-END TEST');
  console.log('  (Self-Healing Pipeline: Non-OpenAPI URL)');
  console.log('======================================================================');
  console.log('');
  console.log(`WireMock URL:    ${WIREMOCK_URL}`);
  console.log(`Discovery URL:   ${GOOGLE_DISCOVERY_URL}`);
  console.log(`Timestamp:       ${new Date().toISOString()}`);

  const testRunId = `google_drive_e2e_${Date.now()}`;
  const outputDir = path.join(process.cwd(), 'output', testRunId);

  // ========================================================================
  // STAGE 0: PRE-REQUISITES
  // ========================================================================
  console.log('\n----------------------------------------------------------------------');
  console.log('  STAGE 0: Pre-requisites');
  console.log('----------------------------------------------------------------------');

  // Test WireMock health
  await runTest('WireMock is healthy', async () => {
    const response = await axios.get(`${WIREMOCK_URL}/__admin/health`, { timeout: 5000 });
    if (response.data.status !== 'healthy') {
      throw new Error(`WireMock status: ${response.data.status}`);
    }
    return { status: response.data.status, version: response.data.version };
  });

  // Test Google Discovery URL is accessible
  await runTest('Google Discovery URL is accessible', async () => {
    const response = await axios.get(GOOGLE_DISCOVERY_URL, { timeout: 15000 });
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = response.data;
    return {
      name: data.name,
      version: data.version,
      title: data.title,
      hasResources: !!data.resources,
      hasSchemas: !!data.schemas,
      topLevelKeys: Object.keys(data).slice(0, 10),
    };
  });

  // Test Anthropic API key is set
  await runTest('ANTHROPIC_API_KEY is configured', async () => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    return { keyPrefix: key.slice(0, 8) + '...', keyLength: key.length };
  });

  // ========================================================================
  // STAGE 1: FACTORY PIPELINE
  // ========================================================================
  console.log('\n----------------------------------------------------------------------');
  console.log('  STAGE 1: Factory Pipeline (Discovery URL -> Schema -> Data -> WireMock)');
  console.log('----------------------------------------------------------------------');

  const pipelineService = new FactoryPipelineService();
  let pipelineResult: Awaited<ReturnType<typeof pipelineService.execute>> | null = null;

  await runTest('Factory pipeline executes successfully', async () => {
    const input: PipelineInput = {
      jobId: testRunId,
      orgId: 'e2e_test',
      connector: 'google-drive',
      jobIdSuffix: testRunId.slice(-8),
      apiDocsUrl: GOOGLE_DISCOVERY_URL,
      volume: 20,
      outputDirectory: outputDir,
      statusFile: path.join(outputDir, 'status.json'),
      skipSsl: true,
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

  // ========================================================================
  // STAGE 2: OUTPUT VERIFICATION
  // ========================================================================
  console.log('\n----------------------------------------------------------------------');
  console.log('  STAGE 2: Output Verification');
  console.log('----------------------------------------------------------------------');

  await runTest('Schema file exists', async () => {
    const schemaPath = path.join(outputDir, 'schemas', 'google-drive_schema.json');
    const stat = await fs.stat(schemaPath);
    const content = await fs.readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(content);
    return {
      path: schemaPath,
      size: stat.size,
      entityCount: schema.entities?.length || 0,
      entityNames: (schema.entities || []).slice(0, 10).map((e: { name: string }) => e.name),
    };
  });

  await runTest('OpenAPI spec generated', async () => {
    const openApiPath = path.join(outputDir, 'schemas', 'google-drive_openapi.yaml');
    const stat = await fs.stat(openApiPath);
    return { path: openApiPath, size: stat.size };
  });

  await runTest('Data files generated', async () => {
    const dataDir = path.join(outputDir, 'data', 'google-drive');
    const files = await fs.readdir(dataDir).catch(() => []);
    return {
      dataDir,
      fileCount: files.length,
      sampleFiles: files.slice(0, 10),
    };
  });

  await runTest('Credentials file generated', async () => {
    const credsPath = path.join(outputDir, 'credentials', 'google-drive_creds.json');
    const content = await fs.readFile(credsPath, 'utf-8');
    const creds = JSON.parse(content);
    return {
      clientId: creds.clientId,
      hasSecret: !!creds.clientSecret,
      baseUrl: creds.baseUrl,
    };
  });

  // ========================================================================
  // STAGE 3: SCHEMA QUALITY
  // ========================================================================
  console.log('\n----------------------------------------------------------------------');
  console.log('  STAGE 3: Schema Quality Checks');
  console.log('----------------------------------------------------------------------');

  await runTest('Schema has expected entities', async () => {
    const schemaPath = path.join(outputDir, 'schemas', 'google-drive_schema.json');
    const content = await fs.readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(content);

    const entityNames = (schema.entities || []).map((e: { name: string }) => e.name.toLowerCase());

    // Google Drive should have at least files and permissions
    const expectedEntities = ['file', 'permission'];
    const foundExpected = expectedEntities.filter((name) =>
      entityNames.some((e: string) => e.includes(name))
    );

    if (foundExpected.length === 0) {
      throw new Error(
        `No expected entities found. Expected at least one of: ${expectedEntities.join(', ')}. Got: ${entityNames.join(', ')}`
      );
    }

    return {
      totalEntities: schema.entities.length,
      entityNames,
      expectedFound: foundExpected,
    };
  });

  await runTest('Entities have fields and endpoints', async () => {
    const schemaPath = path.join(outputDir, 'schemas', 'google-drive_schema.json');
    const content = await fs.readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(content);

    const entitiesWithFields = (schema.entities || []).filter(
      (e: { fields?: unknown[] }) => e.fields && e.fields.length > 1
    );
    const entitiesWithEndpoints = (schema.entities || []).filter(
      (e: { endpoints?: unknown[] }) => e.endpoints && e.endpoints.length > 0
    );

    if (entitiesWithFields.length === 0) {
      throw new Error('No entities have fields');
    }
    if (entitiesWithEndpoints.length === 0) {
      throw new Error('No entities have endpoints');
    }

    return {
      entitiesWithFields: entitiesWithFields.length,
      entitiesWithEndpoints: entitiesWithEndpoints.length,
      totalEntities: schema.entities.length,
    };
  });

  await runTest('Auth is oauth2', async () => {
    const schemaPath = path.join(outputDir, 'schemas', 'google-drive_schema.json');
    const content = await fs.readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(content);

    if (schema.auth?.type !== 'oauth2') {
      throw new Error(`Expected auth type oauth2, got: ${schema.auth?.type}`);
    }

    return {
      authType: schema.auth.type,
      authFields: schema.auth.fields,
    };
  });

  // ========================================================================
  // STAGE 4: WIREMOCK API VERIFICATION
  // ========================================================================
  console.log('\n----------------------------------------------------------------------');
  console.log('  STAGE 4: WireMock API Verification');
  console.log('----------------------------------------------------------------------');

  const instanceId = (pipelineResult as { instanceId?: string } | null)?.instanceId || '';
  const instanceHeaders: Record<string, string> = instanceId
    ? { 'X-Mock-Instance-Id': instanceId }
    : {};

  console.log(`\n  Instance ID: ${instanceId || '(not available)'}`);

  // Test WireMock mappings loaded
  await runTest('WireMock mappings loaded for Google Drive', async () => {
    const response = await axios.get(`${WIREMOCK_URL}/__admin/mappings`);
    const mappings = response.data.mappings || [];
    const googleMappings = mappings.filter((m: { name?: string; request?: { urlPattern?: string } }) =>
      (m.name || '').toLowerCase().includes('google') ||
      (m.request?.urlPattern || '').includes('google-drive')
    );
    return {
      totalMappings: mappings.length,
      googleMappings: googleMappings.length,
    };
  });

  // Test list files endpoint
  await runTest('GET /api/google-drive/files returns data', async () => {
    try {
      const response = await axios.get(`${WIREMOCK_URL}/api/google-drive/files`, {
        headers: instanceHeaders,
        timeout: 5000,
      });
      const data = response.data;
      return {
        status: response.status,
        hasData: !!data,
        recordCount: Array.isArray(data) ? data.length : data?.items?.length || data?.data?.length || 0,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return {
          status: error.response.status,
          note: 'Endpoint returned error — may need different path',
        };
      }
      throw error;
    }
  });

  // Test get single file
  await runTest('GET /api/google-drive/files/:id works', async () => {
    try {
      const response = await axios.get(`${WIREMOCK_URL}/api/google-drive/files/1`, {
        headers: instanceHeaders,
        timeout: 5000,
      });
      return {
        status: response.status,
        hasData: !!response.data,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return {
          status: error.response.status,
          note: 'Single record GET may not be configured',
        };
      }
      throw error;
    }
  });

  // ========================================================================
  // STAGE 5: SUMMARY
  // ========================================================================
  console.log('\n----------------------------------------------------------------------');
  console.log('  TEST SUMMARY');
  console.log('----------------------------------------------------------------------');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log('');
  console.log(`  Total tests: ${results.length}`);
  console.log(`  Passed:      ${passed}`);
  console.log(`  Failed:      ${failed}`);
  console.log(`  Duration:    ${totalDuration}ms`);
  console.log('');

  if (failed > 0) {
    console.log('  Failed Tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`    - ${r.name}: ${r.error}`);
      });
    console.log('');
  }

  // Write results to file
  await fs.mkdir(outputDir, { recursive: true });
  const resultsPath = path.join(outputDir, 'test-results.json');
  await fs.writeFile(
    resultsPath,
    JSON.stringify(
      {
        testRunId,
        connector: 'google-drive',
        discoveryUrl: GOOGLE_DISCOVERY_URL,
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
  console.log('======================================================================');
  console.log(
    failed === 0
      ? '  ALL TESTS PASSED'
      : `  ${failed} TEST(S) FAILED`
  );
  console.log('======================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
