/**
 * MenuDefs Parser
 *
 * Parses NetSuite menudefs.js file to extract record metadata.
 * Can also load pre-parsed JSON index for faster startup.
 *
 * @module large-docs-parser/menudefs-parser
 */

import * as fs from 'fs';
import * as path from 'path';
import { RecordIndex, RecordIndexEntry } from './types';

// =============================================================================
// RAW MENUDEFS TYPES
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

// =============================================================================
// PARSER CLASS
// =============================================================================

export class MenuDefsParser {
  private index: RecordIndex | null = null;
  private loaded = false;

  /**
   * Load index from JSON file (preferred - fast)
   */
  async loadIndex(indexPath: string): Promise<RecordIndex> {
    if (this.loaded && this.index) {
      return this.index;
    }

    if (!fs.existsSync(indexPath)) {
      throw new Error(`Index file not found: ${indexPath}`);
    }

    const content = fs.readFileSync(indexPath, 'utf8');
    this.index = JSON.parse(content) as RecordIndex;
    this.loaded = true;

    return this.index;
  }

  /**
   * Parse raw menudefs.js file (slower, use for index generation)
   */
  async parseMenuDefs(menudefsPath: string): Promise<RecordIndex> {
    if (!fs.existsSync(menudefsPath)) {
      throw new Error(`MenuDefs file not found: ${menudefsPath}`);
    }

    const content = fs.readFileSync(menudefsPath, 'utf8');
    const records = this.extractRecords(content);
    this.index = this.buildIndex(records, menudefsPath);
    this.loaded = true;

    return this.index;
  }

  /**
   * Get loaded index
   */
  getIndex(): RecordIndex {
    if (!this.loaded || !this.index) {
      throw new Error('Index not loaded. Call loadIndex() or parseMenuDefs() first.');
    }
    return this.index;
  }

  /**
   * Find record by name (case-insensitive)
   */
  findRecord(name: string): RecordIndexEntry | undefined {
    const index = this.getIndex();
    const normalized = name.toLowerCase();

    // Try schema name first
    const schemaKey = index.bySchemaName[normalized];
    if (schemaKey) {
      return index.records.find(r => r.key === schemaKey);
    }

    // Try script name
    const scriptKey = index.byScriptName[normalized];
    if (scriptKey) {
      return index.records.find(r => r.key === scriptKey);
    }

    // Try direct key match
    const directKey = `record__${normalized}`;
    return index.records.find(r => r.key === directKey);
  }

  /**
   * Get records by package
   */
  getRecordsByPackage(packageName: string): RecordIndexEntry[] {
    const index = this.getIndex();
    const keys = index.byPackage[packageName] || [];
    return index.records.filter(r => keys.includes(r.key));
  }

  /**
   * Get all packages
   */
  getPackages(): string[] {
    const index = this.getIndex();
    return Object.keys(index.byPackage);
  }

  /**
   * Search records by pattern
   */
  searchRecords(pattern: string): RecordIndexEntry[] {
    const index = this.getIndex();
    const regex = new RegExp(pattern, 'i');

    return index.records.filter(r => {
      return (
        (r.schemaName && regex.test(r.schemaName)) ||
        (r.scriptName && regex.test(r.scriptName)) ||
        (r.label && regex.test(r.label)) ||
        regex.test(r.key)
      );
    });
  }

  /**
   * Get records with schema interface (usable via SOAP)
   */
  getSchemaRecords(): RecordIndexEntry[] {
    const index = this.getIndex();
    return index.records.filter(r => r.interfaces.schema);
  }

  /**
   * Get records with script interface (usable via SuiteScript)
   */
  getScriptRecords(): RecordIndexEntry[] {
    const index = this.getIndex();
    return index.records.filter(r => r.interfaces.script);
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private extractRecords(content: string): Map<string, MenuDefsRecord> {
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

  private buildIndex(
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
      const domains = this.parseDomains(record.domains);

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
      version: this.detectVersion(sourcePath),
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

  private parseDomains(domainStr?: string): string[] {
    if (!domainStr) return [];

    const domains: string[] = [];
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
      // Domains in menudefs are concatenated without separators
      const normalized = d.replace(/_/g, '');
      if (domainStr.includes(normalized)) {
        domains.push(d);
      }
    }

    return domains;
  }

  private detectVersion(sourcePath: string): string {
    // Try to extract version from path (e.g., "2025_2" -> "2025.2")
    const match = sourcePath.match(/(\d{4})_(\d)/);
    if (match) {
      return `${match[1]}.${match[2]}`;
    }
    return 'unknown';
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Load or create index from menudefs.js
 */
export async function loadOrCreateIndex(
  docsPath: string,
  indexPath?: string
): Promise<RecordIndex> {
  const parser = new MenuDefsParser();

  // Try to load existing index first
  if (indexPath && fs.existsSync(indexPath)) {
    return parser.loadIndex(indexPath);
  }

  // Parse menudefs.js
  const menudefsPath = path.join(docsPath, 'menudefs.js');
  if (!fs.existsSync(menudefsPath)) {
    throw new Error(`menudefs.js not found at: ${menudefsPath}`);
  }

  return parser.parseMenuDefs(menudefsPath);
}

/**
 * Get HTML file path for a record
 */
export function getRecordHtmlPath(docsPath: string, record: RecordIndexEntry): string {
  const name = (record.schemaName || record.scriptName || '').toLowerCase();
  return path.join(docsPath, 'schema', 'record', `${name}.html`);
}

export default MenuDefsParser;
