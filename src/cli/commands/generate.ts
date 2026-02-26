import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { dataGenerationService } from '../../services/dataGenerationService';
import { factoryPipelineService, PipelineInput, PipelineResult } from '../../services/factoryPipelineService';
import { GenerationBrief, GenerationStatus } from '../../types/dataGeneration';

export function createGenerateCommand(): Command {
  const cmd = new Command('generate')
    .description('Generate mock server from API docs, schema, or GenerationBrief')
    .option('-b, --brief <path>', 'Path to GenerationBrief JSON file')
    .option('-c, --connector <type>', 'Connector type (e.g., netsuite, snowflake)')
    .option('-o, --org <orgId>', 'Organization ID')
    .option('-j, --job <jobId>', 'Job ID (auto-generated if not provided)')
    .option('-a, --api-docs <url>', 'URL to API documentation for schema inference')
    .option('-s, --schema <path>', 'Path to existing ConnectorSchema JSON')
    .option('-i, --industry <industry>', 'Industry context for data generation', 'technology')
    .option('-n, --count <number>', 'Number of records per entity', '100')
    .option('-d, --output-dir <path>', 'Output directory for generated files', './output')
    .option('--format <format>', 'Output format: wiremock, json, postgresql', 'wiremock')
    .option('--cost-optimize', 'Use cost-optimized generation (local engines only)')
    .option('--skip-data', 'Skip data generation (schema + stubs only)')
    .option('--skip-wiremock', 'Skip WireMock setup')
    .option('--dry-run', 'Show generation plan without executing')
    .option('--json', 'Output results as JSON')
    .action(async (options) => {
      const spinner = ora('Initializing factory pipeline...').start();

      try {
        // If brief provided, use the full pipeline from brief
        if (options.brief) {
          spinner.text = 'Loading generation brief...';
          if (!fs.existsSync(options.brief)) {
            spinner.fail(chalk.red(`Brief file not found: ${options.brief}`));
            process.exit(1);
          }
          const brief: GenerationBrief = JSON.parse(fs.readFileSync(options.brief, 'utf-8'));

          // Validate brief
          spinner.text = 'Validating generation brief...';
          const validationErrors = validateBrief(brief);
          if (validationErrors.length > 0) {
            spinner.fail(chalk.red('Brief validation failed'));
            validationErrors.forEach((e) => console.error(chalk.red(`  - ${e}`)));
            process.exit(1);
          }

          // Dry run - show plan only
          if (options.dryRun) {
            spinner.succeed('Generation plan (dry run):');
            console.log(chalk.cyan('\nGeneration Brief:'));
            console.log(chalk.gray(JSON.stringify(brief, null, 2)));
            return;
          }

          // Execute full pipeline for each connector in the brief
          spinner.text = `Processing brief with ${brief.connectors.length} connector(s)...`;
          const results = await factoryPipelineService.executeFromBrief(brief);

          spinner.succeed(chalk.green('Factory pipeline completed!'));

          // Display results
          if (options.json) {
            console.log(JSON.stringify(results, null, 2));
          } else {
            for (const result of results) {
              console.log(formatPipelineResult(result));
            }
          }
          return;
        }

        // If connector provided with api-docs, use the full factory pipeline
        if (options.connector && (options.apiDocs || options.schema)) {
          const pipelineInput: PipelineInput = {
            connector: options.connector,
            orgId: options.org || 'default',
            jobIdSuffix: options.job,
            apiDocsUrl: options.apiDocs,
            schemaPath: options.schema,
            industry: options.industry,
            volume: parseInt(options.count, 10) || 100,
            outputDirectory: path.resolve(options.outputDir, options.job || uuidv4().split('-')[0]),
            skipDataGeneration: options.skipData,
            skipWireMockSetup: options.skipWiremock,
            dryRun: options.dryRun,
          };

          if (options.dryRun) {
            spinner.succeed('Pipeline configuration (dry run):');
            console.log(chalk.cyan('\nPipeline Input:'));
            console.log(chalk.gray(JSON.stringify(pipelineInput, null, 2)));
            return;
          }

          spinner.text = `Running factory pipeline for ${options.connector}...`;
          const result = await factoryPipelineService.execute(pipelineInput);

          if (result.success) {
            spinner.succeed(chalk.green('Factory pipeline completed!'));
          } else {
            spinner.fail(chalk.red(`Pipeline failed at stage: ${result.error?.stage}`));
          }

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log(formatPipelineResult(result));
          }
          return;
        }

        // Fallback: connector only (use existing schema from schemas/ directory)
        if (options.connector) {
          const brief = buildBriefFromOptions(options);

          // Validate brief
          spinner.text = 'Validating generation brief...';
          const validationErrors = validateBrief(brief);
          if (validationErrors.length > 0) {
            spinner.fail(chalk.red('Brief validation failed'));
            validationErrors.forEach((e) => console.error(chalk.red(`  - ${e}`)));
            process.exit(1);
          }

          // Ensure output directory exists
          const outputDir = path.resolve(brief.callbacks.outputDirectory);
          fs.mkdirSync(outputDir, { recursive: true });

          // Dry run - show plan only
          if (options.dryRun) {
            spinner.succeed('Generation plan (dry run):');
            console.log(chalk.cyan('\nGeneration Brief:'));
            console.log(chalk.gray(JSON.stringify(brief, null, 2)));
            return;
          }

          spinner.text = `Generating data for ${brief.connectors.map((c) => c.name).join(', ')}...`;

          // Execute generation (data only, no schema inference)
          const outputs = await dataGenerationService.executeJob(brief, {
            outputFormat: options.format as 'wiremock' | 'json' | 'postgresql',
            configOverride: options.costOptimize
              ? { primaryEngine: 'faker', costOptimization: true }
              : undefined,
          });

          spinner.succeed(chalk.green('Data generation completed!'));

          // Display results
          if (options.json) {
            console.log(JSON.stringify(outputs, null, 2));
          } else {
            console.log(formatGenerationResults(brief, outputs));
          }
          return;
        }

        // No valid options provided
        spinner.fail(chalk.red('Either --brief, or --connector with --api-docs/--schema is required'));
        process.exit(1);
      } catch (error) {
        spinner.fail(chalk.red('Factory pipeline failed'));
        console.error(error instanceof Error ? error.message : 'Unknown error');
        if (error instanceof Error && error.stack) {
          console.error(chalk.gray(error.stack));
        }
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Format pipeline result for display
 */
function formatPipelineResult(result: PipelineResult): string {
  const lines: string[] = [
    '',
    chalk.cyan('═'.repeat(60)),
    chalk.cyan.bold('  FACTORY PIPELINE RESULT'),
    chalk.cyan('═'.repeat(60)),
    '',
    chalk.white(`  Instance ID:  ${chalk.yellow(result.instanceId)}`),
    chalk.white(`  Success:      ${result.success ? chalk.green('✓ YES') : chalk.red('✗ NO')}`),
    '',
  ];

  // Show stages
  lines.push(chalk.cyan('  ─── Pipeline Stages ───'));
  for (const stage of result.stages) {
    const statusIcon = stage.status === 'success' ? chalk.green('✓') :
                       stage.status === 'skipped' ? chalk.gray('○') : chalk.red('✗');
    const duration = stage.durationMs > 0 ? chalk.gray(`(${stage.durationMs}ms)`) : '';
    lines.push(`    ${statusIcon} ${stage.stage} ${duration}`);
    if (stage.error) {
      lines.push(chalk.red(`      Error: ${stage.error}`));
    }
  }
  lines.push('');

  // Show credentials if available
  if (result.credentials) {
    lines.push(chalk.cyan('  ─── Mock Credentials ───'));
    lines.push(chalk.white(`    Client ID:     ${chalk.yellow(result.credentials.clientId)}`));
    lines.push(chalk.white(`    Client Secret: ${chalk.yellow(result.credentials.clientSecret)}`));
    lines.push(chalk.white(`    Token URL:     ${chalk.gray(result.credentials.tokenEndpoint)}`));
    lines.push(chalk.white(`    Base URL:      ${chalk.gray(result.credentials.baseUrl)}`));
    lines.push('');
  }

  // Show error if failed
  if (result.error) {
    lines.push(chalk.red('  ─── Error ───'));
    lines.push(chalk.red(`    Stage:   ${result.error.stage}`));
    lines.push(chalk.red(`    Message: ${result.error.message}`));
    lines.push('');
  }

  lines.push(chalk.cyan('═'.repeat(60)));
  lines.push('');

  return lines.join('\n');
}

/**
 * Build a GenerationBrief from CLI options
 */
function buildBriefFromOptions(options: {
  connector: string;
  org?: string;
  job?: string;
  industry: string;
  count: string;
  outputDir: string;
}): GenerationBrief {
  const jobId = options.job || uuidv4().split('-')[0];
  const orgId = options.org || 'default';
  const outputDir = path.resolve(options.outputDir, jobId);
  const count = parseInt(options.count, 10) || 100;

  // Load the connector schema to get entity names
  const schemaPath = path.join(process.cwd(), 'schemas', `${options.connector}.json`);
  let entityNames: string[] = [];

  if (fs.existsSync(schemaPath)) {
    try {
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
      entityNames = Object.keys(schema.entities || {});
    } catch {
      console.warn(chalk.yellow(`Could not parse schema for ${options.connector}`));
    }
  }

  // If no schema, use default entities based on connector type
  if (entityNames.length === 0) {
    entityNames = getDefaultEntities(options.connector);
  }

  return {
    jobId,
    orgId,
    sessionId: `cli-${Date.now()}`,
    callbacks: {
      outputDirectory: outputDir,
      statusFile: path.join(outputDir, 'status.json'),
    },
    connectors: [
      {
        name: options.connector,
        entities: entityNames.map((name) => ({
          name,
          estimatedVolume: count,
        })),
      },
    ],
    metadata: {
      industry: options.industry,
      companySize: 'medium',
      region: 'US',
    },
  };
}

/**
 * Get default entities for common connectors
 */
function getDefaultEntities(connector: string): string[] {
  const defaults: Record<string, string[]> = {
    snowflake: ['databases', 'schemas', 'warehouses', 'customers', 'orders', 'products'],
    netsuite: ['customers', 'invoices', 'items', 'vendors', 'transactions'],
    salesforce: ['accounts', 'contacts', 'opportunities', 'leads', 'cases'],
    hubspot: ['companies', 'contacts', 'deals', 'tickets'],
    google: ['files', 'sheets', 'documents', 'events', 'emails'],
  };

  return defaults[connector.toLowerCase()] || ['records'];
}

/**
 * Validate a GenerationBrief
 */
function validateBrief(brief: GenerationBrief): string[] {
  const errors: string[] = [];

  if (!brief.jobId) {
    errors.push('jobId is required');
  }

  if (!brief.orgId) {
    errors.push('orgId is required');
  }

  if (!brief.callbacks?.outputDirectory) {
    errors.push('callbacks.outputDirectory is required');
  }

  if (!brief.callbacks?.statusFile) {
    errors.push('callbacks.statusFile is required');
  }

  if (!brief.connectors || brief.connectors.length === 0) {
    errors.push('At least one connector is required');
  }

  for (const connector of brief.connectors || []) {
    if (!connector.name) {
      errors.push('Connector name is required');
    }
    if (!connector.entities || connector.entities.length === 0) {
      errors.push(`Connector ${connector.name}: at least one entity is required`);
    }
  }

  if (!brief.metadata?.industry) {
    errors.push('metadata.industry is required');
  }

  return errors;
}

/**
 * Format generation results for display
 */
function formatGenerationResults(
  brief: GenerationBrief,
  outputs: import('../../types/dataGeneration').OutputManifest
): string {
  const lines: string[] = [
    '',
    chalk.cyan('═'.repeat(60)),
    chalk.cyan.bold('  DATA GENERATION COMPLETE'),
    chalk.cyan('═'.repeat(60)),
    '',
    chalk.white(`  Job ID:     ${chalk.yellow(brief.jobId)}`),
    chalk.white(`  Org ID:     ${chalk.yellow(brief.orgId)}`),
    chalk.white(`  Industry:   ${chalk.yellow(brief.metadata.industry)}`),
    '',
  ];

  for (const [connectorName, output] of Object.entries(outputs.connectors)) {
    lines.push(chalk.cyan(`  ─── ${connectorName.toUpperCase()} ───`));
    lines.push('');
    lines.push(chalk.white(`    Status:        ${chalk.green(output.status)}`));
    lines.push(chalk.white(`    Total Records: ${chalk.yellow(output.stats.totalRecords)}`));
    lines.push(
      chalk.white(`    Entities:      ${chalk.yellow(output.stats.entitiesGenerated.join(', '))}`)
    );
    lines.push(chalk.white(`    Duration:      ${chalk.yellow(output.stats.generationTimeMs)}ms`));
    lines.push('');
    lines.push(chalk.gray('    Output Files:'));
    for (const file of output.dataFiles.slice(0, 5)) {
      lines.push(chalk.gray(`      - ${file}`));
    }
    if (output.dataFiles.length > 5) {
      lines.push(chalk.gray(`      ... and ${output.dataFiles.length - 5} more`));
    }
    lines.push('');
    lines.push(chalk.cyan('    Mock Credentials:'));
    lines.push(chalk.white(`      Client ID:     ${chalk.yellow(output.credentials.clientId)}`));
    lines.push(
      chalk.white(`      Client Secret: ${chalk.yellow(output.credentials.clientSecret)}`)
    );
    lines.push(chalk.white(`      Token URL:     ${chalk.gray(output.credentials.tokenEndpoint)}`));
    lines.push(chalk.white(`      Base URL:      ${chalk.gray(output.credentials.baseUrl)}`));
    lines.push('');
  }

  lines.push(chalk.cyan('═'.repeat(60)));
  lines.push('');
  lines.push(
    chalk.gray(
      `  Output directory: ${path.resolve(brief.callbacks.outputDirectory)}`
    )
  );
  lines.push(chalk.gray(`  Status file:      ${brief.callbacks.statusFile}`));
  lines.push('');

  return lines.join('\n');
}

/**
 * Validate command - validates a brief without executing
 */
export function createValidateCommand(): Command {
  const cmd = new Command('validate')
    .description('Validate a GenerationBrief without executing')
    .requiredOption('-b, --brief <path>', 'Path to GenerationBrief JSON file')
    .action(async (options) => {
      try {
        if (!fs.existsSync(options.brief)) {
          console.error(chalk.red(`Brief file not found: ${options.brief}`));
          process.exit(1);
        }

        const brief = JSON.parse(fs.readFileSync(options.brief, 'utf-8'));
        const errors = validateBrief(brief);

        if (errors.length > 0) {
          console.log(chalk.red('✗ Validation failed:'));
          errors.forEach((e) => console.log(chalk.red(`  - ${e}`)));
          process.exit(1);
        }

        console.log(chalk.green('✓ Brief is valid'));
        console.log(chalk.gray(`  Job ID: ${brief.jobId}`));
        console.log(chalk.gray(`  Connectors: ${brief.connectors.map((c: { name: string }) => c.name).join(', ')}`));
        console.log(chalk.gray(`  Industry: ${brief.metadata.industry}`));
      } catch (error) {
        console.error(chalk.red('Failed to validate brief'));
        console.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Status command - check job status
 */
export function createStatusCommand(): Command {
  const cmd = new Command('status')
    .description('Check the status of a generation job')
    .requiredOption('-j, --job-id <jobId>', 'Job ID to check')
    .option('-d, --output-dir <path>', 'Output directory', './output')
    .option('--watch', 'Watch for status updates')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const statusFile = path.join(options.outputDir, options.jobId, 'status.json');

      const checkStatus = () => {
        if (!fs.existsSync(statusFile)) {
          console.error(chalk.red(`Status file not found: ${statusFile}`));
          process.exit(1);
        }

        const status: GenerationStatus = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));

        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
        } else {
          console.clear();
          console.log(formatStatus(status));
        }

        return status;
      };

      if (options.watch) {
        console.log(chalk.gray('Watching for status updates... (Ctrl+C to exit)'));
        const interval = setInterval(() => {
          const status = checkStatus();
          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(interval);
          }
        }, 2000);
      } else {
        checkStatus();
      }
    });

  return cmd;
}

/**
 * Format status for display
 */
function formatStatus(status: GenerationStatus): string {
  const statusColors: Record<string, typeof chalk.green> = {
    pending: chalk.gray,
    parsing: chalk.yellow,
    generating: chalk.cyan,
    loading: chalk.blue,
    completed: chalk.green,
    failed: chalk.red,
  };

  const statusColor = statusColors[status.status] || chalk.white;

  const lines: string[] = [
    '',
    chalk.cyan('═'.repeat(50)),
    chalk.cyan.bold(`  Job Status: ${status.jobId}`),
    chalk.cyan('═'.repeat(50)),
    '',
    `  Status:   ${statusColor(status.status.toUpperCase())}`,
    `  Progress: ${chalk.yellow(status.progress + '%')}`,
    `  Step:     ${chalk.gray(status.currentStep)}`,
    '',
  ];

  if (status.error) {
    lines.push(chalk.red(`  Error: ${status.error.message}`));
    lines.push('');
  }

  for (const [name, connectorStatus] of Object.entries(status.connectors)) {
    const connectorColor = statusColors[connectorStatus.status] || chalk.white;
    lines.push(chalk.cyan(`  ─── ${name} ───`));
    lines.push(`    Status:   ${connectorColor(connectorStatus.status)}`);
    lines.push(`    Progress: ${chalk.yellow(connectorStatus.progress + '%')}`);
    lines.push(
      `    Records:  ${chalk.yellow(connectorStatus.recordsGenerated)}/${connectorStatus.totalRecords}`
    );
    lines.push('');
  }

  lines.push(chalk.gray(`  Started:  ${status.startedAt}`));
  lines.push(chalk.gray(`  Updated:  ${status.updatedAt}`));
  if (status.completedAt) {
    lines.push(chalk.gray(`  Completed: ${status.completedAt}`));
  }

  return lines.join('\n');
}
