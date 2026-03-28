/**
 * Record Selector
 *
 * Intelligent selection of records from the index based on various criteria.
 * Supports semantic matching, category filtering, and dependency resolution.
 *
 * @module large-docs-parser/record-selector
 */

import {
  RecordIndex,
  RecordIndexEntry,
  RecordSelectionCriteria,
  RecordSelectionResult,
} from './types';

// =============================================================================
// SELECTOR CLASS
// =============================================================================

export class RecordSelector {
  private index: RecordIndex;

  constructor(index: RecordIndex) {
    this.index = index;
  }

  /**
   * Select records based on criteria
   */
  select(criteria: RecordSelectionCriteria): RecordSelectionResult {
    let records = [...this.index.records];

    // Filter by specific record names
    if (criteria.records && criteria.records.length > 0) {
      records = this.filterByNames(records, criteria.records);
    }

    // Filter by packages
    if (criteria.packages && criteria.packages.length > 0) {
      records = this.filterByPackages(records, criteria.packages);
    }

    // Filter by interface requirements
    if (criteria.interfaces) {
      records = this.filterByInterfaces(records, criteria.interfaces);
    }

    // Filter by search pattern
    if (criteria.search) {
      records = this.filterBySearch(records, criteria.search);
    }

    // Get total before limit
    const totalMatches = records.length;

    // Find related records if requested
    let relatedRecords: RecordIndexEntry[] | undefined;
    if (criteria.includeRelated) {
      relatedRecords = this.findRelatedRecords(records);
    }

    // Apply limit
    const limited = criteria.limit !== undefined && records.length > criteria.limit;
    if (criteria.limit !== undefined) {
      records = records.slice(0, criteria.limit);
    }

    return {
      records,
      totalMatches,
      limited,
      relatedRecords,
    };
  }

  /**
   * Select common business records (customers, invoices, vendors, etc.)
   */
  selectCommonRecords(limit = 20): RecordSelectionResult {
    const commonRecordNames = [
      'customer',
      'invoice',
      'vendor',
      'employee',
      'contact',
      'salesorder',
      'purchaseorder',
      'item',
      'account',
      'opportunity',
      'lead',
      'case',
      'task',
      'phonecall',
      'calendarevent',
      'estimate',
      'cashsale',
      'creditmemo',
      'vendorbill',
      'vendorpayment',
    ];

    return this.select({
      records: commonRecordNames,
      limit,
    });
  }

  /**
   * Select records by category (package)
   */
  selectByCategory(category: string, limit = 20): RecordSelectionResult {
    return this.select({
      packages: [category],
      interfaces: { schema: true }, // Prefer records with schema interface
      limit,
    });
  }

  /**
   * Search records by keyword
   */
  searchRecords(keyword: string, limit = 20): RecordSelectionResult {
    return this.select({
      search: keyword,
      limit,
    });
  }

  /**
   * Get records that are referenced by the given records
   */
  getReferencedRecords(recordNames: string[]): RecordIndexEntry[] {
    const matchedRecords = this.filterByNames(this.index.records, recordNames);
    return this.findRelatedRecords(matchedRecords);
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private filterByNames(
    records: RecordIndexEntry[],
    names: string[]
  ): RecordIndexEntry[] {
    const normalizedNames = names.map(n => n.toLowerCase());

    return records.filter(r => {
      const schemaMatch =
        r.schemaName && normalizedNames.includes(r.schemaName.toLowerCase());
      const scriptMatch =
        r.scriptName && normalizedNames.includes(r.scriptName.toLowerCase());
      const keyMatch = normalizedNames.some(n =>
        r.key.toLowerCase().includes(n)
      );

      return schemaMatch || scriptMatch || keyMatch;
    });
  }

  private filterByPackages(
    records: RecordIndexEntry[],
    packages: string[]
  ): RecordIndexEntry[] {
    const normalizedPackages = packages.map(p => p.toLowerCase());

    return records.filter(
      r => r.package && normalizedPackages.includes(r.package.toLowerCase())
    );
  }

  private filterByInterfaces(
    records: RecordIndexEntry[],
    interfaces: { schema?: boolean; script?: boolean; odbc?: boolean }
  ): RecordIndexEntry[] {
    return records.filter(r => {
      if (interfaces.schema !== undefined && r.interfaces.schema !== interfaces.schema) {
        return false;
      }
      if (interfaces.script !== undefined && r.interfaces.script !== interfaces.script) {
        return false;
      }
      if (interfaces.odbc !== undefined && r.interfaces.odbc !== interfaces.odbc) {
        return false;
      }
      return true;
    });
  }

  private filterBySearch(
    records: RecordIndexEntry[],
    pattern: string
  ): RecordIndexEntry[] {
    try {
      const regex = new RegExp(pattern, 'i');

      return records.filter(r => {
        return (
          (r.schemaName && regex.test(r.schemaName)) ||
          (r.scriptName && regex.test(r.scriptName)) ||
          (r.label && regex.test(r.label)) ||
          regex.test(r.key)
        );
      });
    } catch {
      // Invalid regex, fall back to simple string matching
      const normalizedPattern = pattern.toLowerCase();

      return records.filter(r => {
        return (
          (r.schemaName && r.schemaName.toLowerCase().includes(normalizedPattern)) ||
          (r.scriptName && r.scriptName.toLowerCase().includes(normalizedPattern)) ||
          (r.label && r.label.toLowerCase().includes(normalizedPattern)) ||
          r.key.toLowerCase().includes(normalizedPattern)
        );
      });
    }
  }

  private findRelatedRecords(records: RecordIndexEntry[]): RecordIndexEntry[] {
    const relatedKeys = new Set<string>();
    const currentKeys = new Set(records.map(r => r.key));

    // For each record, find related records based on naming patterns
    for (const record of records) {
      const baseName = (record.schemaName || record.scriptName || '')
        .toLowerCase()
        .replace(/s$/, ''); // Remove trailing 's' for plurals

      // Find records that might be related by name
      for (const candidate of this.index.records) {
        if (currentKeys.has(candidate.key)) continue;

        const candidateName = (candidate.schemaName || candidate.scriptName || '').toLowerCase();

        // Check if candidate name contains base name or vice versa
        if (
          candidateName.includes(baseName) ||
          baseName.includes(candidateName.replace(/s$/, ''))
        ) {
          relatedKeys.add(candidate.key);
        }

        // Check for common relationship patterns
        if (this.isRelatedByPattern(record, candidate)) {
          relatedKeys.add(candidate.key);
        }
      }
    }

    return this.index.records.filter(r => relatedKeys.has(r.key));
  }

  private isRelatedByPattern(
    record: RecordIndexEntry,
    candidate: RecordIndexEntry
  ): boolean {
    const recordName = (record.schemaName || record.scriptName || '').toLowerCase();
    const candidateName = (candidate.schemaName || candidate.scriptName || '').toLowerCase();

    // Common relationship patterns
    const patterns = [
      // Customer -> CustomerPayment, CustomerRefund, etc.
      { base: recordName, suffix: ['payment', 'refund', 'deposit', 'status'] },
      // Invoice -> InvoiceItem, InvoiceLine
      { base: recordName, suffix: ['item', 'line', 'detail'] },
      // Order relationships
      { base: 'salesorder', related: ['customer', 'item', 'shippingmethod'] },
      { base: 'purchaseorder', related: ['vendor', 'item', 'location'] },
      { base: 'invoice', related: ['customer', 'item', 'account'] },
    ];

    for (const pattern of patterns) {
      if (recordName === pattern.base) {
        if (pattern.suffix) {
          for (const suffix of pattern.suffix) {
            if (candidateName === `${pattern.base}${suffix}`) {
              return true;
            }
          }
        }
        if (pattern.related) {
          for (const related of pattern.related) {
            if (candidateName === related) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a selector from an index
 */
export function createSelector(index: RecordIndex): RecordSelector {
  return new RecordSelector(index);
}

/**
 * Select common records from an index
 */
export function selectCommonRecords(
  index: RecordIndex,
  limit = 20
): RecordSelectionResult {
  const selector = new RecordSelector(index);
  return selector.selectCommonRecords(limit);
}

export default RecordSelector;
