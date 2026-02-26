#!/usr/bin/env npx ts-node
/**
 * Connector Generator CLI
 *
 * Orchestrates schema, route, and data generators from ConnectorSchema.
 *
 * Usage:
 *   npx ts-node scripts/generate-connector.ts --schema schemas/netsuite.json --all
 *   npx ts-node scripts/generate-connector.ts --schema schemas/netsuite.json --migration
 *   npx ts-node scripts/generate-connector.ts --schema schemas/netsuite.json --routes
 *   npx ts-node scripts/generate-connector.ts --schema schemas/netsuite.json --data --count 100
 *
 * @module scripts/generate-connector
 */

import * as fs from 'fs';
import * as path from 'path';
import { validateSchema, ConnectorSchema } from '../src/schema/connector-schema';
import { SchemaGenerator } from '../src/generators/schema-generator';
import { RouteGenerator } from '../src/generators/route-generator';
import { DataGenerator } from '../src/generators/data-generator';

// =============================================================================
// CLI ARGUMENTS
// =============================================================================

interface CLIArgs {
  schema: string;
  all?: boolean;
  migration?: boolean;
  routes?: boolean;
  data?: boolean;
  count?: number;
  seed?: number;
  outputDir?: string;
  verbose?: boolean;
  dryRun?: boolean;
  help?: boolean;
}

function parseArgs(): CLIArgs {
  const args: CLIArgs = {
    schema: '',
  };

  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case '--schema':
      case '-s':
        args.schema = argv[++i];
        break;
      case '--all':
      case '-a':
        args.all = true;
        break;
      case '--migration':
      case '-m':
        args.migration = true;
        break;
      case '--routes':
      case '-r':
        args.routes = true;
        break;
      case '--data':
      case '-d':
        args.data = true;
        break;
      case '--count':
      case '-c':
        args.count = parseInt(argv[++i]);
        break;
      case '--seed':
        args.seed = parseInt(argv[++i]);
        break;
      case '--output':
      case '-o':
        args.outputDir = argv[++i];
        break;
      case '--verbose':
      case '-v':
        args.verbose = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`
Connector Generator CLI

Usage:
  npx ts-node scripts/generate-connector.ts [options]

Options:
  --schema, -s <path>    Path to ConnectorSchema JSON file (required)
  --all, -a              Generate all (migration, routes, data)
  --migration, -m        Generate SQL migration
  --routes, -r           Generate Express routes
  --data, -d             Generate synthetic data
  --count, -c <number>   Records per entity for data generation (default: 10)
  --seed <number>        Seed for reproducible data generation
  --output, -o <dir>     Output directory (default: based on schema name)
  --verbose, -v          Verbose output
  --dry-run              Show what would be generated without writing files
  --help, -h             Show this help message

Examples:
  # Generate everything from NetSuite schema
  npx ts-node scripts/generate-connector.ts --schema schemas/netsuite.json --all

  # Generate only migration
  npx ts-node scripts/generate-connector.ts --schema schemas/netsuite.json --migration

  # Generate data with 100 records per entity
  npx ts-node scripts/generate-connector.ts --schema schemas/netsuite.json --data --count 100

  # Dry run to see what would be generated
  npx ts-node scripts/generate-connector.ts --schema schemas/netsuite.json --all --dry-run
`);
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.schema) {
    console.error('Error: --schema is required');
    printHelp();
    process.exit(1);
  }

  // Load and validate schema
  console.log('='.repeat(60));
  console.log('Connector Generator');
  console.log('='.repeat(60));
  console.log(`\nSchema: ${args.schema}`);

  if (!fs.existsSync(args.schema)) {
    console.error(`Error: Schema file not found: ${args.schema}`);
    process.exit(1);
  }

  let schema: ConnectorSchema;
  try {
    const content = fs.readFileSync(args.schema, 'utf8');
    schema = validateSchema(JSON.parse(content));
    console.log(`Connector: ${schema.name} v${schema.version}`);
    console.log(`Entities: ${schema.entities.length}`);
  } catch (error) {
    console.error(`Error loading schema: ${error}`);
    process.exit(1);
  }

  // Determine output directory
  const outputDir = args.outputDir || `.`;

  // Determine what to generate
  const generateMigration = args.all || args.migration;
  const generateRoutes = args.all || args.routes;
  const generateData = args.all || args.data;

  if (!generateMigration && !generateRoutes && !generateData) {
    console.error('\nError: Specify what to generate: --all, --migration, --routes, or --data');
    process.exit(1);
  }

  console.log(`\nOutput directory: ${outputDir}`);
  console.log(`Dry run: ${args.dryRun ? 'Yes' : 'No'}`);
  console.log('');

  // Generate migration
  if (generateMigration) {
    console.log('-'.repeat(40));
    console.log('Generating SQL Migration...');
    console.log('-'.repeat(40));

    const generator = new SchemaGenerator({
      includeDrop: false,
      includeTimestamps: true,
      includeFkIndexes: true,
      includeAuditColumns: true,
    });

    const result = generator.generate(schema);

    const migrationPath = path.join(outputDir, 'migrations', `003_${schema.name}_auto_schema.sql`);

    if (args.dryRun) {
      console.log(`Would write to: ${migrationPath}`);
      console.log(`Tables: ${result.tables.length}`);
      console.log(`Foreign keys: ${result.foreignKeys.length}`);
      console.log(`SQL size: ${(result.sql.length / 1024).toFixed(2)} KB`);
    } else {
      const dir = path.dirname(migrationPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(migrationPath, result.sql, 'utf8');
      console.log(`✅ Migration saved to: ${migrationPath}`);
      console.log(`   Tables: ${result.tables.length}`);
      console.log(`   SQL size: ${(result.sql.length / 1024).toFixed(2)} KB`);
    }

    if (result.warnings.length > 0) {
      console.log(`   Warnings: ${result.warnings.length}`);
      if (args.verbose) {
        result.warnings.forEach(w => console.log(`     - ${w}`));
      }
    }
    console.log('');
  }

  // Generate routes
  if (generateRoutes) {
    console.log('-'.repeat(40));
    console.log('Generating Express Routes...');
    console.log('-'.repeat(40));

    const generator = new RouteGenerator({
      includeAuth: true,
      includeValidation: true,
      includeLogging: true,
      serviceImportPath: `../services/${schema.name}Service`,
      generateServiceStubs: true,
    });

    const result = generator.generate(schema);

    const routePath = path.join(outputDir, 'src', 'routes', `${schema.name}-generated.ts`);
    const servicePath = path.join(outputDir, 'src', 'services', `${schema.name}GeneratedService.ts`);

    if (args.dryRun) {
      console.log(`Would write routes to: ${routePath}`);
      console.log(`Would write service to: ${servicePath}`);
      console.log(`Entities: ${result.entities.length}`);
      console.log(`Endpoints: ${result.endpoints.length}`);
      console.log(`Route code size: ${(result.routeCode.length / 1024).toFixed(2)} KB`);
    } else {
      // Save routes
      const routeDir = path.dirname(routePath);
      if (!fs.existsSync(routeDir)) {
        fs.mkdirSync(routeDir, { recursive: true });
      }
      fs.writeFileSync(routePath, result.routeCode, 'utf8');
      console.log(`✅ Routes saved to: ${routePath}`);

      // Save service stub
      if (result.serviceCode) {
        const serviceDir = path.dirname(servicePath);
        if (!fs.existsSync(serviceDir)) {
          fs.mkdirSync(serviceDir, { recursive: true });
        }
        fs.writeFileSync(servicePath, result.serviceCode, 'utf8');
        console.log(`✅ Service saved to: ${servicePath}`);
      }

      console.log(`   Entities: ${result.entities.length}`);
      console.log(`   Endpoints: ${result.endpoints.length}`);
    }

    if (result.warnings.length > 0) {
      console.log(`   Warnings: ${result.warnings.length}`);
      if (args.verbose) {
        result.warnings.forEach(w => console.log(`     - ${w}`));
      }
    }
    console.log('');
  }

  // Generate data
  if (generateData) {
    console.log('-'.repeat(40));
    console.log('Generating Synthetic Data...');
    console.log('-'.repeat(40));

    const count = args.count || 10;
    const seed = args.seed || Math.floor(Math.random() * 1000000);

    const generator = new DataGenerator({
      defaultCount: count,
      seed,
      outputFormat: 'sql',
      includeTimestamps: true,
    });

    const result = generator.generate(schema);

    const seedSqlPath = path.join(outputDir, 'migrations', `004_${schema.name}_seed_data.sql`);
    const seedJsonPath = path.join(outputDir, 'data', `${schema.name}-seed.json`);

    if (args.dryRun) {
      console.log(`Would write SQL seed to: ${seedSqlPath}`);
      console.log(`Would write JSON data to: ${seedJsonPath}`);
      console.log(`Records per entity: ${count}`);
      console.log(`Total records: ${result.totalRecords}`);
      console.log(`Seed: ${seed}`);
    } else {
      // Generate SQL seed
      const sqlGenerator = new DataGenerator({
        defaultCount: count,
        seed,
        outputFormat: 'sql',
        includeTimestamps: true,
      });
      const sqlContent = sqlGenerator.generateAndFormat(schema);

      const sqlDir = path.dirname(seedSqlPath);
      if (!fs.existsSync(sqlDir)) {
        fs.mkdirSync(sqlDir, { recursive: true });
      }
      fs.writeFileSync(seedSqlPath, sqlContent, 'utf8');
      console.log(`✅ SQL seed saved to: ${seedSqlPath}`);

      // Generate JSON data
      const jsonDir = path.dirname(seedJsonPath);
      if (!fs.existsSync(jsonDir)) {
        fs.mkdirSync(jsonDir, { recursive: true });
      }
      fs.writeFileSync(seedJsonPath, JSON.stringify(result.data, null, 2), 'utf8');
      console.log(`✅ JSON data saved to: ${seedJsonPath}`);

      console.log(`   Records per entity: ${count}`);
      console.log(`   Total records: ${result.totalRecords}`);
      console.log(`   Seed: ${seed} (use --seed ${seed} to reproduce)`);
    }

    if (result.warnings.length > 0) {
      console.log(`   Warnings: ${result.warnings.length}`);
      if (args.verbose) {
        result.warnings.forEach(w => console.log(`     - ${w}`));
      }
    }
    console.log('');
  }

  // Summary
  console.log('='.repeat(60));
  console.log('Generation Complete!');
  console.log('='.repeat(60));

  if (!args.dryRun) {
    console.log('\nNext steps:');
    if (generateMigration) {
      console.log('  1. Review and run migration:');
      console.log(`     psql -U agentic_user -d agentic_sandbox -f migrations/003_${schema.name}_auto_schema.sql`);
    }
    if (generateRoutes) {
      console.log('  2. Register routes in src/app.ts:');
      console.log(`     import ${schema.name}GeneratedRoutes from './routes/${schema.name}-generated';`);
      console.log(`     app.use('/api/${schema.name}', ${schema.name}GeneratedRoutes);`);
    }
    if (generateData) {
      console.log('  3. Load seed data:');
      console.log(`     psql -U agentic_user -d agentic_sandbox -f migrations/004_${schema.name}_seed_data.sql`);
    }
  }
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
