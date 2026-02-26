/**
 * Type definitions for Large Documentation Parser
 *
 * Handles massive ERP documentation like NetSuite (51MB, 582 records)
 * using a tiered loading strategy.
 *
 * @module large-docs-parser/types
 */

import { ConnectorSchema, FieldType } from '../../connector-schema';

// =============================================================================
// INDEX TYPES (Tier 1)
// =============================================================================

/**
 * Record entry in the pre-parsed index
 */
export interface RecordIndexEntry {
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
  /** Namespace for SOAP */
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

/**
 * Pre-parsed record index structure
 */
export interface RecordIndex {
  /** Documentation version (e.g., "2025.2") */
  version: string;
  /** Index generation timestamp */
  generatedAt: string;
  /** Source file path */
  source: string;
  /** Statistics */
  stats: {
    totalRecords: number;
    withSchema: number;
    withScript: number;
    withOdbc: number;
    byPackage: Record<string, number>;
  };
  /** All record entries */
  records: RecordIndexEntry[];
  /** Lookup: schemaName (lowercase) -> record key */
  bySchemaName: Record<string, string>;
  /** Lookup: scriptName (lowercase) -> record key */
  byScriptName: Record<string, string>;
  /** Lookup: package -> record keys */
  byPackage: Record<string, string[]>;
}

// =============================================================================
// FIELD TYPES (Tier 3)
// =============================================================================

/**
 * Raw field parsed from HTML documentation
 */
export interface ParsedField {
  /** Field name (e.g., "companyName") */
  name: string;
  /** Raw type string from docs (e.g., "string", "RecordRef") */
  rawType: string;
  /** Cardinality (e.g., "0..1", "1", "0..*") */
  cardinality: string;
  /** Human-readable label */
  label: string;
  /** Whether field is required */
  required: boolean;
  /** Help text/description */
  helpText: string;
  /** Reference to another type if applicable */
  typeRef?: string;
}

/**
 * Parsed record with all fields
 */
export interface ParsedRecord {
  /** Record name (e.g., "Customer") */
  name: string;
  /** Fields parsed from HTML */
  fields: ParsedField[];
  /** Parsing metadata */
  meta: {
    sourceFile: string;
    parseTime: number;
    fieldCount: number;
  };
}

// =============================================================================
// SELECTION TYPES (Tier 2)
// =============================================================================

/**
 * Selection criteria for records
 */
export interface RecordSelectionCriteria {
  /** Specific record names to include */
  records?: string[];
  /** Package/category filter */
  packages?: string[];
  /** Interface requirements */
  interfaces?: {
    schema?: boolean;
    script?: boolean;
    odbc?: boolean;
  };
  /** Include records that reference selected records */
  includeRelated?: boolean;
  /** Maximum records to return */
  limit?: number;
  /** Search pattern (regex-compatible) */
  search?: string;
}

/**
 * Selection result with matched records
 */
export interface RecordSelectionResult {
  /** Matched record entries */
  records: RecordIndexEntry[];
  /** Total matches before limit */
  totalMatches: number;
  /** Whether limit was applied */
  limited: boolean;
  /** Related records found (if includeRelated was true) */
  relatedRecords?: RecordIndexEntry[];
}

// =============================================================================
// PARSER OPTIONS
// =============================================================================

/**
 * Options for large docs parser
 */
export interface LargeDocsParserOptions {
  /** Path to documentation root directory */
  docsPath: string;
  /** Path to pre-parsed index (or will be generated) */
  indexPath?: string;
  /** Connector name */
  name?: string;
  /** Base URL for endpoints */
  baseUrl?: string;
  /** Table name prefix */
  tablePrefix?: string;
  /** Verbose logging */
  verbose?: boolean;
  /** Use cache for parsed records */
  useCache?: boolean;
  /** Cache directory */
  cacheDir?: string;
}

/**
 * Parse result from large docs parser
 */
export interface LargeDocsParseResult {
  /** Generated schema */
  schema: ConnectorSchema;
  /** Input type detection */
  inputType: 'large-docs';
  /** Parser used */
  parserUsed: 'large-docs';
  /** Confidence score */
  confidence: number;
  /** Warnings during parsing */
  warnings: string[];
  /** Metadata */
  metadata: {
    docsVersion: string;
    totalRecords: number;
    parsedRecords: number;
    parseTime: number;
    cacheHits?: number;
    cacheMisses?: number;
  };
}

// =============================================================================
// FIELD MAPPING
// =============================================================================

/**
 * Mapped field type with faker hint
 */
export interface MappedFieldType {
  /** ConnectorSchema field type */
  type: FieldType;
  /** Faker.js method for data generation */
  faker?: string;
  /** Whether this is a reference to another entity */
  isReference: boolean;
  /** Referenced entity name if isReference */
  referencedEntity?: string;
}

/**
 * Field type mapping rules
 */
export interface FieldTypeMapping {
  /** Raw type pattern (regex) */
  pattern: RegExp;
  /** Resulting ConnectorSchema type */
  type: FieldType;
  /** Faker method suggestion */
  faker?: string;
  /** Whether this indicates a reference */
  isReference?: boolean;
}

// =============================================================================
// CACHE TYPES
// =============================================================================

/**
 * Cache entry for parsed record
 */
export interface CacheEntry<T> {
  /** Cached data */
  data: T;
  /** Cache timestamp */
  timestamp: number;
  /** TTL in milliseconds */
  ttl: number;
  /** Cache key */
  key: string;
}

/**
 * Cache options
 */
export interface CacheOptions {
  /** Cache directory */
  cacheDir: string;
  /** Default TTL in milliseconds (default: 24 hours) */
  defaultTTL?: number;
  /** Whether to compress cached data */
  compress?: boolean;
}
