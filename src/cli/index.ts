#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('mock-factory')
  .description('Mock Server Factory - Create isolated mock servers for AI agent testing')
  .version('1.0.0');

// Commands will be added here
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

export { program };
