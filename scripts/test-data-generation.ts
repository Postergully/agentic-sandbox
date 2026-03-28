#!/usr/bin/env ts-node
/**
 * Data Generation Pipeline Integration Test
 *
 * End-to-end test: ConnectorSchema → generate data → load into WireMock → verify API responses
 *
 * Usage:
 *   npx ts-node scripts/test-data-generation.ts
 *   npx ts-node scripts/test-data-generation.ts --connector snowflake --count 50
 *   npx ts-node scripts/test-data-generation.ts --cost-optimize  # Use Faker only
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';

// Import our modules
import { DataGenerationService } from '../src/services/dataGenerationService';
import { wiremockProxyService } from '../src/services/wiremockProxyService';
import { GenerationPlanBuilder, orchestrator } from '../src/generators';
import { fakerGenerator } from '../src/generators/fakerGenerator';
import {
  GenerationBrief,
  ConnectorSchema,
  DataGenConfig,
} from '../src/types/dataGeneration';

// Test configuration
interface TestConfig {
  connector: string;
  count: number;
  costOptimize: boolean;
  verbose: boolean;
  skipWiremock: boolean;
}

const defaultConfig: TestConfig = {
  connector: 'snowflake',
  count: 10,
  costOptimize: true, // Use Faker for speed in tests
  verbose: false,
  skipWiremock: false,
};

// Parse command line args
function parseArgs(): TestConfig {
  const args = process.argv.slice(2);
  const config = { ...defaultConfig };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--connector':
      case '-c':
        config.connector = args[++i];
        break;
      case '--count':
      case '-n':
        config.count = parseInt(args[++i], 10);
        break;
      case '--cost-optimize':
        config.costOptimize = true;
        break;
      case '--no-cost-optimize':
        config.costOptimize = false;
        break;
      case '--verbose':
      case '-v':
        config.verbose = true;
        break;
      case '--skip-wiremock':
        config.skipWiremock = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Data Generation Pipeline Test

Usage: npx ts-node scripts/test-data-generation.ts [options]

Options:
  -c, --connector <name>  Connector to test (default: snowflake)
  -n, --count <number>    Records per entity (default: 10)
  --cost-optimize         Use Faker only (fast, no API calls)
  --no-cost-optimize      Use Tonic Fabricate if available
  -v, --verbose           Show detailed output
  --skip-wiremock         Skip WireMock integration tests
  -h, --help              Show this help
        `);
        process.exit(0);
    }
  }

  return config;
}

// Test utilities
function log(message: string, data?: unknown) {
  console.log(chalk.cyan(`[TEST] ${message}`));
  if (data) {
    console.log(chalk.gray(JSON.stringify(data, null, 2)));
  }
}

function success(message: string) {
  console.log(chalk.green(`  ✓ ${message}`));
}

function failure(message: string) {
  console.log(chalk.red(`  ✗ ${message}`));
}

function section(title: string) {
  console.log('');
  console.log(chalk.yellow('═'.repeat(60)));
  console.log(chalk.yellow.bold(`  ${title}`));
  console.log(chalk.yellow('═'.repeat(60)));
  console.log('');
}

// ============================================================================
// Test Cases
// ============================================================================

async function testSchemaLoading(config: TestConfig): Promise<ConnectorSchema | null> {
  log(`Loading schema for connector: ${config.connector}`);

  const schemaPath = path.join(process.cwd(), 'schemas', `${config.connector}.json`);

  try {
    const content = await fs.readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(content) as ConnectorSchema;

    success(`Schema loaded: ${Object.keys(schema.entities).length} entities`);

    if (config.verbose) {
      console.log(chalk.gray(`  Entities: ${Object.keys(schema.entities).join(', ')}`));
    }

    return schema;
  } catch (error) {
    failure(`Failed to load schema: ${error}`);
    return null;
  }
}

async function testGenerationPlanBuilding(
  schema: ConnectorSchema,
  config: TestConfig
): Promise<boolean> {
  log('Building generation plan');

  try {
    const brief: GenerationBrief = {
      jobId: `test-${Date.now()}`,
      orgId: 'test-org',
      sessionId: 'test-session',
      callbacks: {
        outputDirectory: path.join(process.cwd(), 'output', 'test'),
        statusFile: path.join(process.cwd(), 'output', 'test', 'status.json'),
      },
      connectors: [
        {
          name: config.connector,
          entities: Object.keys(schema.entities)
            .slice(0, 3) // Test with first 3 entities
            .map((name) => ({
              name,
              estimatedVolume: config.count,
            })),
        },
      ],
      metadata: {
        industry: 'technology',
        companySize: 'medium',
        region: 'US',
      },
    };

    const plan = GenerationPlanBuilder.buildPlan(schema, brief, brief.jobId);

    success(`Plan built: ${plan.tables.length} tables, ${plan.estimatedTotalRecords} total records`);

    if (config.verbose) {
      console.log(chalk.gray(`  Execution order: ${plan.executionOrder.join(' → ')}`));
      for (const table of plan.tables) {
        console.log(
          chalk.gray(`  - ${table.tableName}: ${table.fields.length} fields, ${table.rowCount} rows`)
        );
      }
    }

    return true;
  } catch (error) {
    failure(`Failed to build plan: ${error}`);
    return false;
  }
}

async function testFakerGenerator(
  schema: ConnectorSchema,
  config: TestConfig
): Promise<boolean> {
  log('Testing Faker generator');

  try {
    const isAvailable = await fakerGenerator.isAvailable();
    if (!isAvailable) {
      failure('Faker generator not available');
      return false;
    }

    success('Faker generator is available');

    // Test generating a small table
    const entityName = Object.keys(schema.entities)[0];
    const entitySchema = schema.entities[entityName];

    const tablePlan = GenerationPlanBuilder.buildTablePlan(
      entityName,
      entitySchema,
      config.count,
      schema.dataGenerationHints?.[entityName]
    );

    const brief: GenerationBrief = {
      jobId: `faker-test-${Date.now()}`,
      orgId: 'test-org',
      sessionId: 'test-session',
      callbacks: {
        outputDirectory: '/tmp/test',
        statusFile: '/tmp/test/status.json',
      },
      connectors: [
        {
          name: config.connector,
          entities: [{ name: entityName, estimatedVolume: config.count }],
        },
      ],
      metadata: {
        industry: 'technology',
      },
    };

    const context = {
      jobId: brief.jobId,
      connectorSchema: schema,
      brief,
      generatedTables: new Map(),
      config: {
        primaryEngine: 'faker' as const,
        fallbackChain: ['faker' as const],
        engineOverrides: {},
        costOptimization: true,
        maxRetries: 1,
        timeoutMs: 30000,
      },
    };

    const result = await fakerGenerator.generateTable(tablePlan, context);

    success(`Generated ${result.rows.length} rows for ${entityName}`);

    if (config.verbose) {
      console.log(chalk.gray(`  Columns: ${result.columns.join(', ')}`));
      if (result.rows.length > 0) {
        console.log(chalk.gray(`  Sample row: ${JSON.stringify(result.rows[0], null, 2)}`));
      }
    }

    // Validate data
    if (result.rows.length !== config.count) {
      failure(`Expected ${config.count} rows, got ${result.rows.length}`);
      return false;
    }

    // Check for required fields
    const requiredFields = entitySchema.fields
      .filter((f) => f.required)
      .map((f) => f.name);

    for (const row of result.rows) {
      for (const field of requiredFields) {
        if (row[field] === undefined || row[field] === null) {
          failure(`Missing required field: ${field}`);
          return false;
        }
      }
    }

    success('All required fields populated');
    return true;
  } catch (error) {
    failure(`Faker generator test failed: ${error}`);
    return false;
  }
}

async function testOrchestrator(
  schema: ConnectorSchema,
  config: TestConfig
): Promise<Map<string, unknown> | null> {
  log('Testing orchestrator with full generation');

  try {
    const entities = Object.keys(schema.entities).slice(0, 2); // Test with 2 entities

    const brief: GenerationBrief = {
      jobId: `orchestrator-test-${Date.now()}`,
      orgId: 'test-org',
      sessionId: 'test-session',
      callbacks: {
        outputDirectory: path.join(process.cwd(), 'output', 'test-orchestrator'),
        statusFile: path.join(
          process.cwd(),
          'output',
          'test-orchestrator',
          'status.json'
        ),
      },
      connectors: [
        {
          name: config.connector,
          entities: entities.map((name) => ({
            name,
            estimatedVolume: config.count,
          })),
        },
      ],
      metadata: {
        industry: 'technology',
        companySize: 'startup',
        region: 'US',
      },
    };

    const plan = GenerationPlanBuilder.buildPlan(schema, brief, brief.jobId);

    const configOverride: Partial<DataGenConfig> = config.costOptimize
      ? { primaryEngine: 'faker', costOptimization: true }
      : {};

    const customOrchestrator = new (await import('../src/generators')).DataGenerationOrchestrator(
      configOverride
    );

    const results = await customOrchestrator.executePlan(plan, schema, brief);

    success(`Generated data for ${results.size} tables`);

    let totalRecords = 0;
    for (const [tableName, data] of results) {
      const tableData = data as { rows: unknown[]; entityName: string };
      totalRecords += tableData.rows.length;

      if (config.verbose) {
        console.log(
          chalk.gray(`  - ${tableName}: ${tableData.rows.length} rows`)
        );
      }
    }

    success(`Total records generated: ${totalRecords}`);

    return results;
  } catch (error) {
    failure(`Orchestrator test failed: ${error}`);
    return null;
  }
}

async function testWireMockIntegration(
  schema: ConnectorSchema,
  generatedData: Map<string, unknown>,
  config: TestConfig
): Promise<boolean> {
  if (config.skipWiremock) {
    log('Skipping WireMock integration tests');
    return true;
  }

  log('Testing WireMock integration');

  try {
    // Check WireMock health
    const isHealthy = await wiremockProxyService.isHealthy();
    if (!isHealthy) {
      failure('WireMock is not healthy - skipping integration tests');
      console.log(
        chalk.yellow('  Run: docker-compose up -d wiremock')
      );
      return false;
    }

    success('WireMock is healthy');

    // Load generated data into WireMock
    const typedData = generatedData as Map<
      string,
      import('../src/types/dataGeneration').GeneratedTableData
    >;

    const loadResult = await wiremockProxyService.loadGeneratedData(
      config.connector,
      typedData,
      'test-instance'
    );

    if (!loadResult.success) {
      failure(`Failed to load data: ${loadResult.errors.join(', ')}`);
      return false;
    }

    success(`Loaded ${loadResult.filesLoaded.length} data files into WireMock`);

    // Verify data is accessible
    for (const [tableName, data] of generatedData) {
      const tableData = data as { entityName: string; rows: unknown[] };
      const verifyResult = await wiremockProxyService.verifyDataLoaded(
        config.connector,
        tableData.entityName,
        'test-instance'
      );

      if (verifyResult.success) {
        success(`Verified ${tableData.entityName}: ${verifyResult.recordCount} records accessible`);
      } else {
        failure(`Failed to verify ${tableData.entityName}: ${verifyResult.error}`);
      }
    }

    return true;
  } catch (error) {
    failure(`WireMock integration test failed: ${error}`);
    return false;
  }
}

async function testFullService(
  schema: ConnectorSchema,
  config: TestConfig
): Promise<boolean> {
  log('Testing full DataGenerationService');

  try {
    const outputDir = path.join(process.cwd(), 'output', `test-full-${Date.now()}`);

    const brief: GenerationBrief = {
      jobId: `full-test-${Date.now()}`,
      orgId: 'test-org',
      sessionId: 'test-session',
      callbacks: {
        outputDirectory: outputDir,
        statusFile: path.join(outputDir, 'status.json'),
      },
      connectors: [
        {
          name: config.connector,
          entities: Object.keys(schema.entities)
            .slice(0, 2)
            .map((name) => ({
              name,
              estimatedVolume: config.count,
            })),
        },
      ],
      metadata: {
        industry: 'technology',
        companySize: 'medium',
        region: 'US',
      },
    };

    const service = new DataGenerationService({
      configOverride: config.costOptimize
        ? { primaryEngine: 'faker', costOptimization: true }
        : {},
    });

    const outputs = await service.executeJob(brief, {
      outputFormat: 'json',
    });

    success('DataGenerationService completed successfully');

    // Verify outputs
    const connectorOutput = outputs.connectors[config.connector];
    if (!connectorOutput) {
      failure(`No output for connector: ${config.connector}`);
      return false;
    }

    success(`Generated ${connectorOutput.stats.totalRecords} total records`);
    success(`Entities: ${connectorOutput.stats.entitiesGenerated.join(', ')}`);
    success(`Duration: ${connectorOutput.stats.generationTimeMs}ms`);

    // Verify files exist
    for (const file of connectorOutput.dataFiles.slice(0, 3)) {
      const filePath = path.join(outputDir, file);
      try {
        await fs.access(filePath);
        if (config.verbose) {
          console.log(chalk.gray(`  File exists: ${file}`));
        }
      } catch {
        failure(`Output file not found: ${file}`);
        return false;
      }
    }

    success('All output files created');

    // Verify status file
    try {
      const statusContent = await fs.readFile(brief.callbacks.statusFile, 'utf-8');
      const status = JSON.parse(statusContent);
      if (status.status === 'completed') {
        success('Status file shows completed');
      } else {
        failure(`Status file shows: ${status.status}`);
        return false;
      }
    } catch (error) {
      failure(`Could not read status file: ${error}`);
      return false;
    }

    // Cleanup test output
    try {
      await fs.rm(outputDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }

    return true;
  } catch (error) {
    failure(`Full service test failed: ${error}`);
    return false;
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function main() {
  const config = parseArgs();

  console.log('');
  console.log(chalk.cyan.bold('═'.repeat(60)));
  console.log(chalk.cyan.bold('  DATA GENERATION PIPELINE INTEGRATION TEST'));
  console.log(chalk.cyan.bold('═'.repeat(60)));
  console.log('');
  console.log(chalk.white(`  Connector:     ${chalk.yellow(config.connector)}`));
  console.log(chalk.white(`  Count:         ${chalk.yellow(config.count)} records per entity`));
  console.log(
    chalk.white(`  Cost Optimize: ${config.costOptimize ? chalk.green('Yes (Faker only)') : chalk.yellow('No (Tonic if available)')}`)
  );
  console.log('');

  const results: { test: string; passed: boolean }[] = [];

  // Test 1: Schema Loading
  section('1. Schema Loading');
  const schema = await testSchemaLoading(config);
  results.push({ test: 'Schema Loading', passed: schema !== null });

  if (!schema) {
    console.log(chalk.red('\nCannot continue without schema. Exiting.'));
    process.exit(1);
  }

  // Test 2: Generation Plan Building
  section('2. Generation Plan Building');
  const planBuilt = await testGenerationPlanBuilding(schema, config);
  results.push({ test: 'Generation Plan Building', passed: planBuilt });

  // Test 3: Faker Generator
  section('3. Faker Generator');
  const fakerPassed = await testFakerGenerator(schema, config);
  results.push({ test: 'Faker Generator', passed: fakerPassed });

  // Test 4: Orchestrator
  section('4. Orchestrator');
  const generatedData = await testOrchestrator(schema, config);
  results.push({ test: 'Orchestrator', passed: generatedData !== null });

  // Test 5: WireMock Integration
  if (generatedData) {
    section('5. WireMock Integration');
    const wiremockPassed = await testWireMockIntegration(schema, generatedData, config);
    results.push({ test: 'WireMock Integration', passed: wiremockPassed });
  }

  // Test 6: Full Service
  section('6. Full DataGenerationService');
  const servicePassed = await testFullService(schema, config);
  results.push({ test: 'Full Service', passed: servicePassed });

  // Summary
  console.log('');
  console.log(chalk.cyan.bold('═'.repeat(60)));
  console.log(chalk.cyan.bold('  TEST SUMMARY'));
  console.log(chalk.cyan.bold('═'.repeat(60)));
  console.log('');

  let passedCount = 0;
  for (const result of results) {
    if (result.passed) {
      console.log(chalk.green(`  ✓ ${result.test}`));
      passedCount++;
    } else {
      console.log(chalk.red(`  ✗ ${result.test}`));
    }
  }

  console.log('');
  console.log(
    chalk.white(
      `  Total: ${passedCount}/${results.length} tests passed`
    )
  );
  console.log('');

  if (passedCount === results.length) {
    console.log(chalk.green.bold('  ALL TESTS PASSED!'));
    console.log('');
    process.exit(0);
  } else {
    console.log(chalk.red.bold('  SOME TESTS FAILED'));
    console.log('');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(chalk.red('Test runner failed:'), error);
  process.exit(1);
});
