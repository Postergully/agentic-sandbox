import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { registryService } from '../../services/registryService';
import { sslDnsService } from '../../services/sslDnsService';
import { MockServerInstance, MockServerStatus } from '../../types';
import { formatCredentialsBox, formatSSLInstructions } from '../utils/formatters';

function generateInstanceId(connector: string, orgId: string, jobId?: string): string {
  const safeConnector = connector.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const safeOrgId = orgId.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const safeJobId = jobId ? jobId.replace(/[^a-z0-9]/g, '_') : uuidv4().split('-')[0];
  return `${safeConnector}_${safeOrgId}_${safeJobId}`;
}

export function createCreateCommand(): Command {
  const cmd = new Command('create')
    .description('Create a new mock server instance')
    .requiredOption('-c, --connector <type>', 'Connector type (e.g., netsuite, snowflake)')
    .requiredOption('-o, --org <orgId>', 'Organization ID (e.g., sharechat)')
    .option('-j, --job <jobId>', 'Job ID (auto-generated if not provided)')
    .option('-b, --brief <path>', 'Path to GenerationBrief JSON file')
    .option('-d, --api-docs <url>', 'URL to API documentation')
    .option('--skip-ssl', 'Skip SSL/DNS auto-configuration')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Creating mock server instance...').start();

      try {
        // Generate identifiers
        const instanceId = generateInstanceId(options.connector, options.org, options.job);
        const pgSchema = instanceId;

        spinner.text = `Checking if instance ${instanceId} already exists...`;

        // Check if instance already exists
        const existing = await registryService.get(instanceId);
        if (existing) {
          spinner.fail(chalk.red(`Instance ${instanceId} already exists`));
          process.exit(1);
        }

        // Load generation brief if provided
        let generationBrief: object | undefined;
        if (options.brief) {
          spinner.text = 'Loading generation brief...';
          if (!fs.existsSync(options.brief)) {
            spinner.fail(chalk.red(`Brief file not found: ${options.brief}`));
            process.exit(1);
          }
          generationBrief = JSON.parse(fs.readFileSync(options.brief, 'utf-8'));
        }

        // Setup SSL/DNS
        let sslConfig: object | undefined;
        let baseUrl: string | undefined;
        let domain: string | undefined;

        if (!options.skipSsl) {
          spinner.text = 'Setting up SSL/DNS configuration...';
          const sslResult = await sslDnsService.setupSSL({
            instanceId,
            connector: options.connector,
            orgId: options.org,
          });

          if (sslResult.success && sslResult.config) {
            sslConfig = sslResult.config;
            baseUrl = sslResult.config.mockUrl;
            domain = sslResult.config.domain;

            if (sslResult.warnings.length > 0) {
              sslResult.warnings.forEach((w) => console.warn(chalk.yellow(`  Warning: ${w}`)));
            }
          }
        }

        // Generate mock credentials
        const mockCredentials = {
          clientId: `mock-client-${options.org}-${options.connector}`,
          clientSecret: `mock-secret-${uuidv4().split('-')[0]}`,
          tokenEndpoint: `${baseUrl || 'http://localhost:3002'}/oauth/token`,
        };

        spinner.text = 'Creating registry entry...';

        // Create instance record
        const instance: Omit<MockServerInstance, 'id' | 'createdAt' | 'updatedAt'> = {
          instanceId,
          connector: options.connector,
          orgId: options.org,
          jobId: options.job,
          status: 'creating' as MockServerStatus,
          pgSchema,
          generationBrief,
          sslConfig,
          baseUrl,
          authEndpoint: '/oauth/token',
          mockCredentials,
          apiDocsSource: options.apiDocs,
        };

        await registryService.create(instance);

        // Update status to active (in real impl, this happens after provisioning)
        await registryService.update(instanceId, { status: 'active' as MockServerStatus });

        spinner.succeed(chalk.green(`Instance ${instanceId} created successfully!`));

        // Output
        if (options.json) {
          const result = await registryService.get(instanceId);
          console.log(JSON.stringify(result, null, 2));
        } else {
          const result = await registryService.get(instanceId);
          if (result) {
            result.mockCredentials = mockCredentials;
            result.baseUrl = baseUrl;
            console.log(formatCredentialsBox(result));

            if (domain && !options.skipSsl) {
              console.log(formatSSLInstructions(domain));
            }
          }
        }
      } catch (error) {
        spinner.fail(chalk.red('Failed to create instance'));
        console.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return cmd;
}
