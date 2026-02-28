import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { fetchFromAllSources } from '../../schema/sources/multi-source-fetcher';
import { reconcileSchemas } from '../../schema/reconciler';
import { validateSchemaQuality } from '../../schema/parsers/schema-quality-validator';
import { getConnectorsForVertical, getAllVerticals } from '../../schema/sources/verticals';
import { getAllKnownConnectors } from '../../schema/sources/registry';

export function createHarvestCommand(): Command {
  const cmd = new Command('harvest')
    .description(
      'Harvest API schemas from public registries (APIs.guru, GitHub, Apideck, Postman)\n' +
      '  Pre-populates schemas for faster mock server creation.'
    )
    .option('-v, --vertical <vertical>', `Industry vertical (${getAllVerticals().join(', ')})`)
    .option('-c, --connector <name>', 'Specific connector to harvest')
    .option('-o, --output <dir>', 'Output directory', path.join(process.cwd(), 'schemas', 'harvested'))
    .option('--list-connectors', 'List all known connectors')
    .option('--list-verticals', 'List all verticals and their connectors')
    .option('--json', 'Output as JSON')
    .option('--verbose', 'Verbose output')
    .action(async (options) => {
      // List commands
      if (options.listConnectors) {
        const connectors = getAllKnownConnectors();
        if (options.json) {
          console.log(JSON.stringify(connectors, null, 2));
        } else {
          console.log(chalk.cyan.bold('\nKnown Connectors:'));
          for (const c of connectors) {
            console.log(`  ${chalk.white(c)}`);
          }
          console.log(chalk.gray(`\n  Total: ${connectors.length} connectors\n`));
        }
        return;
      }

      if (options.listVerticals) {
        const verticals = getAllVerticals();
        if (options.json) {
          const data: Record<string, string[]> = {};
          for (const v of verticals) data[v] = getConnectorsForVertical(v);
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(chalk.cyan.bold('\nIndustry Verticals:'));
          for (const v of verticals) {
            const connectors = getConnectorsForVertical(v);
            console.log(`  ${chalk.yellow(v)}: ${connectors.join(', ')}`);
          }
          console.log('');
        }
        return;
      }

      // Determine which connectors to harvest
      let connectors: string[] = [];

      if (options.connector) {
        connectors = [options.connector.toLowerCase().replace(/[^a-z0-9_]/g, '_')];
      } else if (options.vertical) {
        connectors = getConnectorsForVertical(options.vertical);
        if (connectors.length === 0) {
          console.error(chalk.red(`Unknown vertical: ${options.vertical}`));
          console.error(chalk.gray(`Available: ${getAllVerticals().join(', ')}`));
          process.exit(1);
        }
      } else {
        console.error(chalk.red('Specify --connector or --vertical'));
        console.error(chalk.gray('Use --list-connectors or --list-verticals to see options'));
        process.exit(1);
      }

      // Create output directory
      const outputDir = path.resolve(options.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      console.log(chalk.cyan.bold(`\nHarvesting schemas for ${connectors.length} connector(s)...\n`));

      const results: Array<{
        connector: string;
        success: boolean;
        sourcesFound: number;
        entityCount: number;
        qualityScore: number;
        outputPath?: string;
        error?: string;
      }> = [];

      for (const connector of connectors) {
        const spinner = ora(`Harvesting ${connector}...`).start();

        try {
          // Fetch from all sources
          spinner.text = `${connector}: fetching from public registries...`;
          const fetchResult = await fetchFromAllSources(connector);

          if (fetchResult.sources.length === 0) {
            spinner.warn(chalk.yellow(`${connector}: no sources found`));
            results.push({
              connector,
              success: false,
              sourcesFound: 0,
              entityCount: 0,
              qualityScore: 0,
              error: 'No sources found',
            });
            continue;
          }

          // Reconcile
          spinner.text = `${connector}: reconciling ${fetchResult.sources.length} sources...`;
          const reconciled = await reconcileSchemas(connector, fetchResult.sources, {
            apiKey: process.env.ANTHROPIC_API_KEY,
            verbose: options.verbose,
          });

          // Quality check
          const quality = validateSchemaQuality(reconciled.schema);

          // Save with metadata
          const outputPath = path.join(outputDir, `${connector}.json`);
          const outputData = {
            ...reconciled.schema,
            _harvestedAt: Date.now(),
            _qualityScore: quality.score,
            _sourcesUsed: reconciled.sourcesUsed,
          };
          fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));

          spinner.succeed(
            `${chalk.green(connector)}: ${reconciled.schema.entities.length} entities, ` +
            `quality ${quality.score}/100, ${fetchResult.sources.length} sources ` +
            chalk.gray(`(${fetchResult.fetchDurationMs + reconciled.metadata.totalDurationMs}ms)`)
          );

          results.push({
            connector,
            success: true,
            sourcesFound: fetchResult.sources.length,
            entityCount: reconciled.schema.entities.length,
            qualityScore: quality.score,
            outputPath,
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          spinner.fail(chalk.red(`${connector}: ${msg}`));
          results.push({
            connector,
            success: false,
            sourcesFound: 0,
            entityCount: 0,
            qualityScore: 0,
            error: msg,
          });
        }
      }

      // Summary
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      if (options.json) {
        console.log(JSON.stringify({ results, outputDir }, null, 2));
      } else {
        console.log('');
        console.log(chalk.cyan('═'.repeat(60)));
        console.log(chalk.cyan.bold('  HARVEST SUMMARY'));
        console.log(chalk.cyan('═'.repeat(60)));
        console.log(`  ${chalk.green(`${successful.length} succeeded`)}, ${chalk.red(`${failed.length} failed`)}`);
        console.log(`  Output: ${chalk.gray(outputDir)}`);
        console.log(chalk.cyan('═'.repeat(60)));
        console.log('');
      }
    });

  return cmd;
}
