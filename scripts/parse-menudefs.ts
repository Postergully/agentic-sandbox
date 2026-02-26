#!/usr/bin/env npx ts-node

/**
 * Parse NetSuite menudefs.js into compact JSON index
 *
 * This script processes the massive menudefs.js file (30K+ lines, 1.2MB)
 * and extracts record metadata into a compact JSON index (~50KB)
 * that can fit in LLM context for tiered schema loading.
 *
 * Usage:
 *   npx ts-node scripts/parse-menudefs.ts [options]
 *
 * Options:
 *   --input <path>    Path to menudefs.js (default: docs/2025_2/menudefs.js)
 *   --output <path>   Output JSON path (default: src/schema/indexes/netsuite-2025_2.json)
 *   --verbose         Show detailed parsing info
 *   --stats           Show statistics only, don't write file
 *
 * @module scripts/parse-menudefs
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

interface MenuDefsRecord {
  inSchema: 'T' | 'F';
  schemaName?: string;
  schemaNamespace?: string;
  schemaPackage?: string;
  schemaXSDFile?: string;
  inScript: 'T' | 'F';
  scriptName?: string;
  scriptLabel?: string;
  inOdbc: 'T' | 'F';
  odbcName?: string;
  domains?: string;
  inAnalytics: 'T' | 'F';
  kind: string;
  ignore4script?: string;
}

interface RecordIndexEntry {
  /** Original record key (e.g., "record__customer") */
  key: string;
  /** Schema name if available (e.g., "Customer") */
  schemaName: string | null;
  /** Script name if available (e.g., "customer") */
  scriptName: string | null;
  /** Human-readable label (e.g., "Customer") */
  label: string | null;
  /** Schema package/category (e.g., "lists", "transactions") */
  package: string | null;
  /** Namespace for SOAP (e.g., "urn:relationships.lists.webservices.netsuite.com") */
  namespace: string | null;
  /** XSD file name for detailed schema */
  xsdFile: string | null;
  /** ODBC table name */
  odbcName: string | null;
  /** Available interfaces */
  interfaces: {
    schema: boolean;
    script: boolean;
    odbc: boolean;
    analytics: boolean;
  };
  /** Feature domains */
  domains: string[];
}

interface RecordIndex {
  version: string;
  generatedAt: string;
  source: string;
  stats: {
    totalRecords: number;
    withSchema: number;
    withScript: number;
    withOdbc: number;
    byPackage: Record<string, number>;
  };
  records: RecordIndexEntry[];
  /** Quick lookup maps */
  bySchemaName: Record<string, string>;
  byScriptName: Record<string, string>;
  byPackage: Record<string, string[]>;
}

// =============================================================================
// PARSER
// =============================================================================

function parseMenuDefs(content: string): Map<string, MenuDefsRecord> {
  const records = new Map<string, MenuDefsRecord>();

  // Remove the "objectIDMap = {" prefix and trailing "};" suffix
  let cleaned = content.trim();
  if (cleaned.startsWith('objectIDMap')) {
    cleaned = cleaned.replace(/^objectIDMap\s*=\s*\{/, '{');
  }
  if (cleaned.endsWith('};')) {
    cleaned = cleaned.slice(0, -1);
  }

  // Match each record entry: "record__name": { ... }
  const recordPattern = /"(record__[^"]+)":\s*\{([^}]+)\}/g;
  let match;

  while ((match = recordPattern.exec(cleaned)) !== null) {
    const key = match[1];
    const propsStr = match[2];

    const record: Partial<MenuDefsRecord> = {};

    // Extract each property
    const propPattern = /"([^"]+)":\s*"([^"]*)"/g;
    let propMatch;
    while ((propMatch = propPattern.exec(propsStr)) !== null) {
      const [, propName, propValue] = propMatch;
      (record as Record<string, string>)[propName] = propValue;
    }

    if (record.kind) {
      records.set(key, record as MenuDefsRecord);
    }
  }

  return records;
}

function buildIndex(
  records: Map<string, MenuDefsRecord>,
  sourcePath: string
): RecordIndex {
  const entries: RecordIndexEntry[] = [];
  const bySchemaName: Record<string, string> = {};
  const byScriptName: Record<string, string> = {};
  const byPackage: Record<string, string[]> = {};
  const packageCounts: Record<string, number> = {};

  let withSchema = 0;
  let withScript = 0;
  let withOdbc = 0;

  for (const [key, record] of records) {
    // Only process record kinds
    if (record.kind !== 'record') continue;

    const hasSchema = record.inSchema === 'T';
    const hasScript = record.inScript === 'T';
    const hasOdbc = record.inOdbc === 'T';
    const hasAnalytics = record.inAnalytics === 'T';

    if (hasSchema) withSchema++;
    if (hasScript) withScript++;
    if (hasOdbc) withOdbc++;

    const pkg = record.schemaPackage || null;
    if (pkg) {
      packageCounts[pkg] = (packageCounts[pkg] || 0) + 1;
      if (!byPackage[pkg]) byPackage[pkg] = [];
      byPackage[pkg].push(key);
    }

    // Parse domains string into array
    const domains: string[] = [];
    if (record.domains) {
      // Domains are concatenated without separator, split by known patterns
      // e.g., "expense_amortizationgeneral_accounting" -> ["expense_amortization", "general_accounting"]
      const domainStr = record.domains;
      const knownDomains = [
        'expense_amortization',
        'general_accounting',
        'invoice_with_amortization',
        'multibooks',
        'revenue_recognition',
        'advanced_billing',
        'demand_planning',
        'fixed_assets',
        'manufacturing',
        'payroll',
        'project_management',
        'subscription_billing',
        'suite_analytics',
        'warehouse',
        'web_store',
      ];
      for (const d of knownDomains) {
        if (domainStr.includes(d.replace(/_/g, ''))) {
          domains.push(d);
        }
      }
    }

    const entry: RecordIndexEntry = {
      key,
      schemaName: record.schemaName || null,
      scriptName: record.scriptName || null,
      label: record.scriptLabel || null,
      package: pkg,
      namespace: record.schemaNamespace || null,
      xsdFile: record.schemaXSDFile || null,
      odbcName: record.odbcName || null,
      interfaces: {
        schema: hasSchema,
        script: hasScript,
        odbc: hasOdbc,
        analytics: hasAnalytics,
      },
      domains,
    };

    entries.push(entry);

    // Build lookup maps
    if (entry.schemaName) {
      bySchemaName[entry.schemaName.toLowerCase()] = key;
    }
    if (entry.scriptName) {
      byScriptName[entry.scriptName.toLowerCase()] = key;
    }
  }

  // Sort entries by schemaName for easier browsing
  entries.sort((a, b) => {
    const nameA = a.schemaName || a.scriptName || a.key;
    const nameB = b.schemaName || b.scriptName || b.key;
    return nameA.localeCompare(nameB);
  });

  return {
    version: '2025.2',
    generatedAt: new Date().toISOString(),
    source: sourcePath,
    stats: {
      totalRecords: entries.length,
      withSchema,
      withScript,
      withOdbc,
      byPackage: packageCounts,
    },
    records: entries,
    bySchemaName,
    byScriptName,
    byPackage,
  };
}

// =============================================================================
// CLI
// =============================================================================

function parseArgs(): {
  input: string;
  output: string;
  verbose: boolean;
  statsOnly: boolean;
} {
  const args = process.argv.slice(2);
  let input = 'docs/2025_2/menudefs.js';
  let output = 'src/schema/indexes/netsuite-2025_2.json';
  let verbose = false;
  let statsOnly = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
        input = args[++i];
        break;
      case '--output':
        output = args[++i];
        break;
      case '--verbose':
        verbose = true;
        break;
      case '--stats':
        statsOnly = true;
        break;
      case '--help':
        console.log(`
Usage: npx ts-node scripts/parse-menudefs.ts [options]

Options:
  --input <path>    Path to menudefs.js (default: docs/2025_2/menudefs.js)
  --output <path>   Output JSON path (default: src/schema/indexes/netsuite-2025_2.json)
  --verbose         Show detailed parsing info
  --stats           Show statistics only, don't write file
  --help            Show this help message
`);
        process.exit(0);
    }
  }

  return { input, output, verbose, statsOnly };
}

async function main() {
  const { input, output, verbose, statsOnly } = parseArgs();

  // Resolve paths relative to project root
  const projectRoot = path.resolve(__dirname, '..');
  const inputPath = path.resolve(projectRoot, input);
  const outputPath = path.resolve(projectRoot, output);

  console.log(`Parsing NetSuite menudefs.js...`);
  console.log(`Input: ${inputPath}`);

  // Check input file exists
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  // Read and parse
  const content = fs.readFileSync(inputPath, 'utf8');
  console.log(`File size: ${(content.length / 1024 / 1024).toFixed(2)} MB`);

  const records = parseMenuDefs(content);
  console.log(`Parsed ${records.size} total entries`);

  // Build index
  const index = buildIndex(records, input);

  // Show stats
  console.log(`\nStatistics:`);
  console.log(`  Total records: ${index.stats.totalRecords}`);
  console.log(`  With schema: ${index.stats.withSchema}`);
  console.log(`  With script: ${index.stats.withScript}`);
  console.log(`  With ODBC: ${index.stats.withOdbc}`);
  console.log(`\n  By package:`);
  for (const [pkg, count] of Object.entries(index.stats.byPackage).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`    ${pkg}: ${count}`);
  }

  if (verbose) {
    console.log(`\nSample records (first 10):`);
    for (const record of index.records.slice(0, 10)) {
      console.log(`  - ${record.schemaName || record.scriptName || record.key}`);
      console.log(`    package: ${record.package}, interfaces: ${JSON.stringify(record.interfaces)}`);
    }
  }

  if (statsOnly) {
    console.log(`\nStats only mode - not writing output file.`);
    return;
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write output
  const jsonOutput = JSON.stringify(index, null, 2);
  fs.writeFileSync(outputPath, jsonOutput);
  console.log(`\nOutput written to: ${outputPath}`);
  console.log(`Output size: ${(jsonOutput.length / 1024).toFixed(2)} KB`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
