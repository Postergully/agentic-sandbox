import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { registryService } from '../../services/registryService';
import { sslDnsService, SSLConfig } from '../../services/sslDnsService';

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export function createDeleteCommand(): Command {
  const cmd = new Command('delete')
    .description('Delete a mock server instance')
    .argument('<instanceId>', 'Instance ID to delete')
    .option('-f, --force', 'Skip confirmation prompt')
    .option('--cleanup-ssl', 'Also cleanup SSL certificates')
    .action(async (instanceId, options) => {
      try {
        // Check instance exists
        const instance = await registryService.get(instanceId);
        if (!instance) {
          console.error(chalk.red(`Instance ${instanceId} not found`));
          process.exit(1);
        }

        // Confirm deletion
        if (!options.force) {
          const confirmed = await confirm(
            chalk.yellow(`Are you sure you want to delete ${instanceId}? [y/N] `)
          );
          if (!confirmed) {
            console.log('Deletion cancelled.');
            return;
          }
        }

        const spinner = ora(`Deleting instance ${instanceId}...`).start();

        // Cleanup SSL if requested
        if (options.cleanupSsl && instance.sslConfig) {
          spinner.text = 'Cleaning up SSL certificates...';
          const sslConfig = instance.sslConfig as SSLConfig;
          await sslDnsService.teardownSSL(sslConfig);
        }

        // Delete from registry
        await registryService.delete(instanceId);

        spinner.succeed(chalk.green(`Instance ${instanceId} deleted successfully`));

        if (instance.sslConfig) {
          const sslConfig = instance.sslConfig as SSLConfig;
          console.log(chalk.yellow(`\n⚠️  Manual cleanup may be required:`));
          console.log(chalk.gray(`   Remove from /etc/hosts: ${sslConfig.domain}`));
        }
      } catch (error) {
        console.error(chalk.red('Failed to delete instance'));
        console.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return cmd;
}
