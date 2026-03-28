/**
 * HTML Field Parser
 *
 * Parses NetSuite HTML documentation to extract field definitions.
 * Uses Cheerio for fast, jQuery-like HTML parsing.
 *
 * @module large-docs-parser/html-field-parser
 */

import * as fs from 'fs';
import * as cheerio from 'cheerio';
import { ParsedField, ParsedRecord, RecordIndexEntry } from './types';
import { getRecordHtmlPath } from './menudefs-parser';

// =============================================================================
// PARSER CLASS
// =============================================================================

export class HtmlFieldParser {
  private docsPath: string;

  constructor(docsPath: string) {
    this.docsPath = docsPath;
  }

  /**
   * Parse a record's HTML documentation to extract fields
   */
  async parseRecord(record: RecordIndexEntry): Promise<ParsedRecord> {
    const startTime = Date.now();
    const htmlPath = getRecordHtmlPath(this.docsPath, record);

    if (!fs.existsSync(htmlPath)) {
      throw new Error(`HTML documentation not found: ${htmlPath}`);
    }

    const html = fs.readFileSync(htmlPath, 'utf8');
    const fields = this.extractFields(html);

    return {
      name: record.schemaName || record.scriptName || record.key,
      fields,
      meta: {
        sourceFile: htmlPath,
        parseTime: Date.now() - startTime,
        fieldCount: fields.length,
      },
    };
  }

  /**
   * Parse multiple records in parallel
   */
  async parseRecords(records: RecordIndexEntry[]): Promise<ParsedRecord[]> {
    return Promise.all(records.map(r => this.parseRecord(r)));
  }

  /**
   * Check if HTML documentation exists for a record
   */
  hasDocumentation(record: RecordIndexEntry): boolean {
    const htmlPath = getRecordHtmlPath(this.docsPath, record);
    return fs.existsSync(htmlPath);
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private extractFields(html: string): ParsedField[] {
    const $ = cheerio.load(html);
    const fields: ParsedField[] = [];

    // Find the main table with class "jtable"
    const table = $('table.jtable');
    if (!table.length) {
      return fields;
    }

    // Process each row (skip header)
    table.find('tr').each((index, row) => {
      if (index === 0) return; // Skip header row

      const $row = $(row);
      const cells = $row.find('td');

      if (cells.length < 5) return; // Incomplete row

      // Extract field data from cells
      const name = $(cells[0]).text().trim();
      const rawType = this.extractType($, cells[1]);
      const cardinality = $(cells[2]).text().trim();
      const label = $(cells[3]).text().trim();
      const requiredStr = $(cells[4]).text().trim();
      const helpText = cells.length > 5 ? $(cells[5]).text().trim() : '';

      if (!name) return; // Skip empty rows

      // Determine if required
      const required = requiredStr === 'T' || requiredStr === 'true';

      // Extract type reference if it's a link
      const typeLink = $(cells[1]).find('a');
      const typeRef = typeLink.length ? typeLink.attr('href') : undefined;

      fields.push({
        name,
        rawType,
        cardinality,
        label,
        required,
        helpText,
        typeRef,
      });
    });

    return fields;
  }

  private extractType($: cheerio.CheerioAPI, cell: Parameters<typeof $>[0]): string {
    const $cell = $(cell);

    // Check if there's a link (indicates a complex type)
    const link = $cell.find('a');
    if (link.length) {
      return link.text().trim();
    }

    // Plain text type
    return $cell.text().trim();
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Parse a single HTML file directly
 */
export async function parseHtmlFile(htmlPath: string): Promise<ParsedField[]> {
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`HTML file not found: ${htmlPath}`);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  const $ = cheerio.load(html);
  const fields: ParsedField[] = [];

  // Find the main table with class "jtable"
  const table = $('table.jtable');
  if (!table.length) {
    return fields;
  }

  // Process each row (skip header)
  table.find('tr').each((index, row) => {
    if (index === 0) return; // Skip header row

    const $row = $(row);
    const cells = $row.find('td');

    if (cells.length < 5) return; // Incomplete row

    const name = $(cells[0]).text().trim();
    const rawType = $(cells[1]).text().trim();
    const cardinality = $(cells[2]).text().trim();
    const label = $(cells[3]).text().trim();
    const requiredStr = $(cells[4]).text().trim();
    const helpText = cells.length > 5 ? $(cells[5]).text().trim() : '';

    if (!name) return;

    const required = requiredStr === 'T' || requiredStr === 'true';

    const typeLink = $(cells[1]).find('a');
    const typeRef = typeLink.length ? typeLink.attr('href') : undefined;

    fields.push({
      name,
      rawType,
      cardinality,
      label,
      required,
      helpText,
      typeRef,
    });
  });

  return fields;
}

/**
 * Get available record HTML files
 */
export function getAvailableRecordFiles(docsPath: string): string[] {
  const recordDir = `${docsPath}/schema/record`;

  if (!fs.existsSync(recordDir)) {
    return [];
  }

  return fs
    .readdirSync(recordDir)
    .filter(f => f.endsWith('.html'))
    .map(f => f.replace('.html', ''));
}

export default HtmlFieldParser;
