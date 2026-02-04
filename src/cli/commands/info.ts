import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { registryService } from '../../services/registryService';
import { formatCredentialsBox, formatSSLInstructions } from '../utils/formatters';
import { SSLConfig } from '../../services/sslDnsService';

export function createInfoCommand(): Command {
  const cmd = new Command('info')
    .description('Get details of a specific mock server instance')
    .argument('<instanceId>', 'Instance ID (e.g., netsuite_sharechat_331)')
    .option('--json', 'Output as JSON')
    .option('--creds', 'Show only credentials box (for quick copy/paste)')
    .action(async (instanceId, options) => {
      const spinner = ora(`Fetching instance ${instanceId}...`).start();

      try {
        const instance = await registryService.get(instanceId);

        if (!instance) {
          spinner.fail(chalk.red(`Instance ${instanceId} not found`));
          process.exit(1);
        }

        await registryService.updateLastAccessed(instanceId);

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(instance, null, 2));
        } else if (options.creds) {
          console.log(formatCredentialsBox(instance));
          const sslConfig = instance.sslConfig as SSLConfig | undefined;
          if (sslConfig?.domain) {
            console.log(formatSSLInstructions(sslConfig.domain));
          }
        } else {
          console.log('\n' + chalk.bold.underline(`Instance: ${instanceId}`) + '\n');
          console.log(`  ${chalk.gray('Connector:')}    ${instance.connector}`);
          console.log(`  ${chalk.gray('Organization:')} ${instance.orgId}`);
          console.log(`  ${chalk.gray('Job ID:')}       ${instance.jobId || '(none)'}`);
          console.log(`  ${chalk.gray('Status:')}       ${instance.status}`);
          console.log(`  ${chalk.gray('PG Schema:')}    ${instance.pgSchema}`);
          console.log(`  ${chalk.gray('Base URL:')}     ${instance.baseUrl || '(not configured)'}`);
          console.log(`  ${chalk.gray('Created:')}      ${instance.createdAt}`);
          console.log(`  ${chalk.gray('Updated:')}      ${instance.updatedAt}`);

          console.log('\n' + formatCredentialsBox(instance));

          const sslConfig = instance.sslConfig as SSLConfig | undefined;
          if (sslConfig?.domain) {
            console.log(formatSSLInstructions(sslConfig.domain));
          }
        }
      } catch (error) {
        spinner.fail(chalk.red('Failed to get instance info'));
        console.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return cmd;
}
