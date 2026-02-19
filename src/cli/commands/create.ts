import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import * as readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import { registryService } from '../../services/registryService';
import { factoryPipelineService, PipelineInput } from '../../services/factoryPipelineService';

function generateInstanceId(connector: string, orgId: string, jobId?: string): string {
  const safeConnector = connector.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const safeOrgId = orgId.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const safeJobId = jobId ? jobId.replace(/[^a-z0-9]/g, '_') : uuidv4().split('-')[0];
  return `${safeConnector}_${safeOrgId}_${safeJobId}`;
}

/**
 * Check if interactive prompts should be shown
 */
export function shouldPrompt(options: { json?: boolean }): boolean {
  return !!process.stdin.isTTY && !options.json;
}

/**
 * Ask a single question with a default value
 */
export function askQuestion(
  rl: readline.Interface,
  question: string,
  defaultValue: string
): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

/**
 * Prompt for missing options interactively
 */
export async function promptForMissingOptions(
  options: Record<string, any>
): Promise<Record<string, any>> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    if (options.industry === 'technology') {
      options.industry = await askQuestion(
        rl,
        `Industry context [technology]: `,
        'technology'
      );
    }

    if (options.volume === '100') {
      const volumeStr = await askQuestion(
        rl,
        `Records per entity [100]: `,
        '100'
      );
      options.volume = volumeStr;
    }

    return options;
  } finally {
    rl.close();
  }
}

export function createCreateCommand(): Command {
  const cmd = new Command('create')
    .description('Create a new mock server instance with full pipeline (schema inference → data generation → WireMock setup)')
    .requiredOption('-c, --connector <type>', 'Connector type (e.g., netsuite, snowflake)')
    .requiredOption('-o, --org <orgId>', 'Organization ID (e.g., sharechat)')
    .option('-j, --job <jobId>', 'Job ID (auto-generated if not provided)')
    .option('-a, --api-docs <url>', 'URL to API documentation for schema inference')
    .option('-s, --schema <path>', 'Path to existing ConnectorSchema JSON')
    .option('-i, --industry <industry>', 'Industry context for data generation', 'technology')
    .option('-n, --volume <number>', 'Number of records per entity', '100')
    .option('-d, --output-dir <path>', 'Output directory', './output')
    .option('--skip-ssl', 'Skip SSL/DNS auto-configuration')
    .option('--skip-data', 'Skip data generation (schema + stubs only)')
    .option('--skip-wiremock', 'Skip WireMock setup')
    .option('--dry-run', 'Show what would be created without executing')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      // Interactive prompts when running in TTY mode
      if (shouldPrompt(options)) {
        await promptForMissingOptions(options);
      }

      const spinner = ora('Creating mock server instance...').start();

      try {
        // Generate identifiers
        const jobId = options.job || uuidv4().split('-')[0];
        const instanceId = generateInstanceId(options.connector, options.org, jobId);

        spinner.text = `Checking if instance ${instanceId} already exists...`;

        // Check if instance already exists
        const existing = await registryService.get(instanceId);
        if (existing) {
          spinner.fail(chalk.red(`Instance ${instanceId} already exists`));
          console.log(chalk.gray(`Use 'mock-factory delete ${instanceId}' to remove it first.`));
          process.exit(1);
        }

        // Build pipeline input
        const outputDir = path.resolve(options.outputDir, jobId);
        const pipelineInput: PipelineInput = {
          jobId,
          orgId: options.org,
          connector: options.connector,
          jobIdSuffix: jobId,
          apiDocsUrl: options.apiDocs,
          schemaPath: options.schema,
          industry: options.industry,
          volume: parseInt(options.volume, 10) || 100,
          outputDirectory: outputDir,
          statusFile: path.join(outputDir, 'status.json'),
          skipDataGeneration: options.skipData,
          skipWireMockSetup: options.skipWiremock,
          skipSsl: options.skipSsl,
          dryRun: options.dryRun,
        };

        // Dry run - show plan only
        if (options.dryRun) {
          spinner.succeed('Pipeline configuration (dry run):');
          console.log(chalk.cyan('\nPipeline Input:'));
          console.log(chalk.gray(JSON.stringify(pipelineInput, null, 2)));
          console.log('');
          console.log(chalk.cyan('Stages that would execute:'));
          console.log(chalk.gray('  1. Schema Inference (from API docs or existing schema)'));
          console.log(chalk.gray('  2. OpenAPI Generation'));
          if (!options.skipData) {
            console.log(chalk.gray('  3. Data Generation'));
          }
          if (!options.skipWiremock) {
            console.log(chalk.gray('  4. WireMock Setup'));
          }
          console.log(chalk.gray('  5. Registry & Credentials'));
          return;
        }

        // Execute the full factory pipeline
        spinner.text = 'Running factory pipeline...';

        const result = await factoryPipelineService.execute(pipelineInput);

        if (result.success) {
          spinner.succeed(chalk.green(`Instance ${instanceId} created successfully!`));
        } else {
          spinner.fail(chalk.red(`Pipeline failed at stage: ${result.error?.stage}`));
        }

        // Output
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          // Display pipeline stages
          console.log('');
          console.log(chalk.cyan('═'.repeat(60)));
          console.log(chalk.cyan.bold('  FACTORY PIPELINE RESULT'));
          console.log(chalk.cyan('═'.repeat(60)));
          console.log('');

          // Show stages
          console.log(chalk.cyan('  Pipeline Stages:'));
          for (const stage of result.stages) {
            const statusIcon = stage.status === 'success' ? chalk.green('✓') :
                               stage.status === 'skipped' ? chalk.gray('○') : chalk.red('✗');
            const duration = stage.durationMs > 0 ? chalk.gray(`(${stage.durationMs}ms)`) : '';
            console.log(`    ${statusIcon} ${stage.stage} ${duration}`);
          }
          console.log('');

          // Show credentials if available
          if (result.credentials) {
            console.log(chalk.cyan('═'.repeat(60)));
            console.log(chalk.cyan.bold('  MOCK CREDENTIALS'));
            console.log(chalk.cyan('═'.repeat(60)));
            console.log('');
            console.log(chalk.white(`  Instance ID:   ${chalk.yellow(result.instanceId)}`));
            console.log(chalk.white(`  Client ID:     ${chalk.yellow(result.credentials.clientId)}`));
            console.log(chalk.white(`  Client Secret: ${chalk.yellow(result.credentials.clientSecret)}`));
            console.log(chalk.white(`  Token URL:     ${chalk.gray(result.credentials.tokenEndpoint)}`));
            console.log(chalk.white(`  Base URL:      ${chalk.green(result.credentials.baseUrl)}`));
            console.log('');
            console.log(chalk.cyan('═'.repeat(60)));
            console.log('');

            // Usage instructions
            console.log(chalk.cyan('  Next Steps:'));
            console.log(chalk.gray('  1. Copy the credentials above into your AI agent configuration'));
            console.log(chalk.gray('  2. Point your agent to the Base URL'));
            console.log(chalk.gray('  3. Use the Client ID/Secret for OAuth authentication'));
            console.log('');
            console.log(chalk.gray(`  Output directory: ${outputDir}`));
            console.log(chalk.gray(`  Status file:      ${path.join(outputDir, 'status.json')}`));
            console.log('');
          }

          // Show error details if failed
          if (result.error) {
            console.log(chalk.red('  Error Details:'));
            console.log(chalk.red(`    Stage:   ${result.error.stage}`));
            console.log(chalk.red(`    Message: ${result.error.message}`));
            if (result.error.details) {
              console.log(chalk.gray(`    Details: ${result.error.details.slice(0, 200)}...`));
            }
            console.log('');
            process.exit(1);
          }
        }
      } catch (error) {
        spinner.fail(chalk.red('Failed to create instance'));
        console.error(error instanceof Error ? error.message : 'Unknown error');
        if (error instanceof Error && error.stack) {
          console.error(chalk.gray(error.stack));
        }
        process.exit(1);
      }
    });

  return cmd;
}
