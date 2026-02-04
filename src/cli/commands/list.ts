import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { registryService } from '../../services/registryService';
import { formatInstanceTable } from '../utils/formatters';
import { MockServerStatus } from '../../types';

export function createListCommand(): Command {
  const cmd = new Command('list')
    .description('List all mock server instances')
    .option('-c, --connector <type>', 'Filter by connector type (e.g., netsuite, snowflake)')
    .option('-o, --org <orgId>', 'Filter by organization ID')
    .option('-s, --status <status>', 'Filter by status (creating, active, stopped, error)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Fetching instances...').start();

      try {
        const filter: { connector?: string; orgId?: string; status?: MockServerStatus } = {};
        if (options.connector) filter.connector = options.connector;
        if (options.org) filter.orgId = options.org;
        if (options.status) filter.status = options.status as MockServerStatus;

        const instances = await registryService.list(
          Object.keys(filter).length > 0 ? filter : undefined
        );

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(instances, null, 2));
        } else {
          console.log('\n' + formatInstanceTable(instances) + '\n');
        }
      } catch (error) {
        spinner.fail(chalk.red('Failed to list instances'));
        console.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return cmd;
}
