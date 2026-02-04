#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import {
  createCreateCommand,
  createListCommand,
  createInfoCommand,
  createDeleteCommand,
} from './commands';

// Initialize database connection for CLI operations
import '../config/database';

const program = new Command();

program
  .name('mock-factory')
  .description(
    chalk.cyan('Mock Server Factory') +
    '\n  Create isolated mock servers for AI agent testing.\n' +
    '  Each instance gets its own PostgreSQL schema and HTTPS endpoint.\n\n' +
    chalk.gray('  Supports: Snowflake, NetSuite, Salesforce, HubSpot, Google Workspace')
  )
  .version('1.0.0');

// Register commands
program.addCommand(createCreateCommand());
program.addCommand(createListCommand());
program.addCommand(createInfoCommand());
program.addCommand(createDeleteCommand());

// Clone command (simplified version - coming soon)
program
  .command('clone')
  .description('Clone an existing instance with new org/job')
  .requiredOption('-f, --from <instanceId>', 'Source instance to clone')
  .requiredOption('-o, --org <orgId>', 'New organization ID')
  .option('-j, --job <jobId>', 'New job ID')
  .action(async (options) => {
    console.log(chalk.yellow('Clone command - coming soon'));
    console.log(chalk.gray(`Would clone ${options.from} to new org: ${options.org}`));
  });

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

export { program };
