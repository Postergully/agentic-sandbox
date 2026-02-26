/**
 * Large Documentation Parser
 *
 * Main entry point for parsing massive ERP documentation like NetSuite.
 * Implements a tiered loading strategy:
 *
 * Tier 1: Index Layer - Pre-parsed menudefs.js index (~50KB)
 * Tier 2: Subset Selection - Select relevant records (1-20 max)
 * Tier 3: Deep Dive - Parse HTML for selected records only
 *
 * @module large-docs-parser
 */

import * as fs from 'fs';
import * as path from 'path';
import { ConnectorSchema } from '../../connector-schema';
import {
  RecordIndex,
  RecordIndexEntry,
  LargeDocsParserOptions,
  LargeDocsParseResult,
  ParsedRecord,
} from './types';
import { loadOrCreateIndex } from './menudefs-parser';
import { HtmlFieldParser } from './html-field-parser';
import { RecordSelector } from './record-selector';
import { SchemaAssembler } from './schema-assembler';

// =============================================================================
// MAIN PARSER CLASS
// =============================================================================

export class LargeDocsParser {
  private options: LargeDocsParserOptions;
  private htmlParser: HtmlFieldParser;
  private selector: RecordSelector | null = null;
  private index: RecordIndex | null = null;

  constructor(options: LargeDocsParserOptions) {
    this.options = {
      useCache: true,
      cacheDir: '.cache/schemas',
      verbose: false,
      ...options,
    };
    this.htmlParser = new HtmlFieldParser(this.options.docsPath);
  }

  /**
   * Initialize parser by loading the index
   */
  async initialize(): Promise<void> {
    this.index = await loadOrCreateIndex(
      this.options.docsPath,
      this.options.indexPath
    );
    this.selector = new RecordSelector(this.index);

    if (this.options.verbose) {
      console.log(`Loaded index with ${this.index.stats.totalRecords} records`);
      console.log(`  With schema: ${this.index.stats.withSchema}`);
      console.log(`  With script: ${this.index.stats.withScript}`);
    }
  }

  /**
   * Parse specific records by name
   */
  async parseRecords(recordNames: string[]): Promise<LargeDocsParseResult> {
    const startTime = Date.now();

    if (!this.index || !this.selector) {
      await this.initialize();
    }

    // Select records from index
    const selection = this.selector!.select({
      records: recordNames,
      includeRelated: false,
    });

    if (selection.records.length === 0) {
      throw new Error(
        `No records found matching: ${recordNames.join(', ')}`
      );
    }

    // Parse HTML for selected records
    const parsedRecords = await this.parseSelectedRecords(selection.records);

    // Assemble schema
    const schema = this.assembleSchema(parsedRecords, selection.records);

    return this.createResult(schema, parsedRecords, startTime);
  }

  /**
   * Parse common business records
   */
  async parseCommonRecords(limit = 20): Promise<LargeDocsParseResult> {
    const startTime = Date.now();

    if (!this.index || !this.selector) {
      await this.initialize();
    }

    const selection = this.selector!.selectCommonRecords(limit);

    // Filter to only records with HTML documentation
    const recordsWithDocs = selection.records.filter(r =>
      this.htmlParser.hasDocumentation(r)
    );

    if (this.options.verbose) {
      console.log(`Selected ${selection.records.length} common records`);
      console.log(`  With documentation: ${recordsWithDocs.length}`);
    }

    const parsedRecords = await this.parseSelectedRecords(recordsWithDocs);
    const schema = this.assembleSchema(parsedRecords, recordsWithDocs);

    return this.createResult(schema, parsedRecords, startTime);
  }

  /**
   * Parse records by package/category
   */
  async parseByPackage(
    packageName: string,
    limit = 20
  ): Promise<LargeDocsParseResult> {
    const startTime = Date.now();

    if (!this.index || !this.selector) {
      await this.initialize();
    }

    const selection = this.selector!.selectByCategory(packageName, limit);

    // Filter to only records with HTML documentation
    const recordsWithDocs = selection.records.filter(r =>
      this.htmlParser.hasDocumentation(r)
    );

    if (this.options.verbose) {
      console.log(`Selected ${selection.records.length} records from package: ${packageName}`);
      console.log(`  With documentation: ${recordsWithDocs.length}`);
    }

    const parsedRecords = await this.parseSelectedRecords(recordsWithDocs);
    const schema = this.assembleSchema(parsedRecords, recordsWithDocs);

    return this.createResult(schema, parsedRecords, startTime);
  }

  /**
   * Search and parse records
   */
  async searchAndParse(
    query: string,
    limit = 20
  ): Promise<LargeDocsParseResult> {
    const startTime = Date.now();

    if (!this.index || !this.selector) {
      await this.initialize();
    }

    const selection = this.selector!.searchRecords(query, limit);

    // Filter to only records with HTML documentation
    const recordsWithDocs = selection.records.filter(r =>
      this.htmlParser.hasDocumentation(r)
    );

    if (this.options.verbose) {
      console.log(`Found ${selection.totalMatches} records matching: ${query}`);
      console.log(`  Limited to: ${selection.records.length}`);
      console.log(`  With documentation: ${recordsWithDocs.length}`);
    }

    const parsedRecords = await this.parseSelectedRecords(recordsWithDocs);
    const schema = this.assembleSchema(parsedRecords, recordsWithDocs);

    return this.createResult(schema, parsedRecords, startTime);
  }

  /**
   * Get available packages
   */
  async getPackages(): Promise<string[]> {
    if (!this.index) {
      await this.initialize();
    }
    return Object.keys(this.index!.stats.byPackage);
  }

  /**
   * Get index statistics
   */
  async getStats(): Promise<RecordIndex['stats']> {
    if (!this.index) {
      await this.initialize();
    }
    return this.index!.stats;
  }

  /**
   * Get the loaded index
   */
  getIndex(): RecordIndex | null {
    return this.index;
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private async parseSelectedRecords(
    records: RecordIndexEntry[]
  ): Promise<ParsedRecord[]> {
    const parsedRecords: ParsedRecord[] = [];

    for (const record of records) {
      try {
        const parsed = await this.htmlParser.parseRecord(record);
        parsedRecords.push(parsed);

        if (this.options.verbose) {
          console.log(`  Parsed ${parsed.name}: ${parsed.fields.length} fields`);
        }
      } catch (error) {
        if (this.options.verbose) {
          console.warn(`  Failed to parse ${record.schemaName || record.key}: ${error}`);
        }
      }
    }

    return parsedRecords;
  }

  private assembleSchema(
    parsedRecords: ParsedRecord[],
    indexEntries: RecordIndexEntry[]
  ): ConnectorSchema {
    const assembler = new SchemaAssembler({
      name: this.options.name || 'netsuite',
      version: this.index?.version,
      baseUrl: this.options.baseUrl || '/services/rest/record/v1',
      tablePrefix: this.options.tablePrefix || 'netsuite',
    });

    return assembler.assemble(parsedRecords, indexEntries);
  }

  private createResult(
    schema: ConnectorSchema,
    parsedRecords: ParsedRecord[],
    startTime: number
  ): LargeDocsParseResult {
    return {
      schema,
      inputType: 'large-docs',
      parserUsed: 'large-docs',
      confidence: 0.9, // High confidence from structured docs
      warnings: [],
      metadata: {
        docsVersion: this.index?.version || 'unknown',
        totalRecords: this.index?.stats.totalRecords || 0,
        parsedRecords: parsedRecords.length,
        parseTime: Date.now() - startTime,
      },
    };
  }
}

// =============================================================================
// DETECTION FUNCTIONS
// =============================================================================

/**
 * Detect if a path contains large documentation that needs this parser
 */
export function isLargeDocs(docsPath: string): boolean {
  // Check for menudefs.js (NetSuite indicator)
  const menudefsPath = path.join(docsPath, 'menudefs.js');
  if (fs.existsSync(menudefsPath)) {
    const stats = fs.statSync(menudefsPath);
    // menudefs.js is typically > 1MB for NetSuite
    if (stats.size > 500 * 1024) {
      return true;
    }
  }

  // Check for schema/record directory with many HTML files
  const recordDir = path.join(docsPath, 'schema', 'record');
  if (fs.existsSync(recordDir)) {
    const files = fs.readdirSync(recordDir);
    const htmlFiles = files.filter(f => f.endsWith('.html'));
    // NetSuite typically has 200+ record HTML files
    if (htmlFiles.length > 100) {
      return true;
    }
  }

  return false;
}

/**
 * Get documentation type for a path
 */
export function getDocsType(
  docsPath: string
): 'netsuite' | 'large-docs' | 'unknown' {
  if (!isLargeDocs(docsPath)) {
    return 'unknown';
  }

  // Check for NetSuite-specific indicators
  const menudefsPath = path.join(docsPath, 'menudefs.js');
  if (fs.existsSync(menudefsPath)) {
    const content = fs.readFileSync(menudefsPath, 'utf8').slice(0, 1000);
    if (content.includes('netsuite') || content.includes('webservices')) {
      return 'netsuite';
    }
  }

  return 'large-docs';
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Parse large documentation with default options
 */
export async function parseLargeDocs(
  docsPath: string,
  recordNames?: string[],
  options?: Partial<LargeDocsParserOptions>
): Promise<LargeDocsParseResult> {
  const parser = new LargeDocsParser({
    docsPath,
    ...options,
  });

  if (recordNames && recordNames.length > 0) {
    return parser.parseRecords(recordNames);
  }

  return parser.parseCommonRecords();
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  // Types
  RecordIndex,
  RecordIndexEntry,
  RecordSelectionCriteria,
  LargeDocsParserOptions,
  LargeDocsParseResult,
  ParsedRecord,
} from './types';

export { MenuDefsParser, loadOrCreateIndex, getRecordHtmlPath } from './menudefs-parser';
export { HtmlFieldParser, parseHtmlFile, getAvailableRecordFiles } from './html-field-parser';
export { RecordSelector, createSelector, selectCommonRecords } from './record-selector';
export { SchemaAssembler, assembleSchema } from './schema-assembler';
export { FieldMapper, mapFieldType, getFakerHintForName } from './field-mapper';

export default LargeDocsParser;
