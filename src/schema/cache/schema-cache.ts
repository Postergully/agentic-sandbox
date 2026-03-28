/**
 * Schema Cache
 *
 * File-based cache for parsed schema data with TTL invalidation.
 * Supports compression and efficient lookup by cache key.
 *
 * @module schema/cache
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { CacheEntry, CacheOptions, ParsedRecord } from '../parsers/large-docs-parser/types';

// =============================================================================
// DEFAULT OPTIONS
// =============================================================================

const DEFAULT_OPTIONS: Required<CacheOptions> = {
  cacheDir: '.cache/schemas',
  defaultTTL: 24 * 60 * 60 * 1000, // 24 hours
  compress: false,
};

// =============================================================================
// CACHE CLASS
// =============================================================================

export class SchemaCache {
  private options: Required<CacheOptions>;
  private memoryCache: Map<string, CacheEntry<unknown>> = new Map();

  constructor(options: Partial<CacheOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.ensureCacheDir();
  }

  /**
   * Get cached data by key
   */
  async get<T>(key: string): Promise<T | null> {
    // Check memory cache first
    const memEntry = this.memoryCache.get(key);
    if (memEntry && !this.isExpired(memEntry)) {
      return memEntry.data as T;
    }

    // Check file cache
    const filePath = this.getFilePath(key);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const entry = await this.readFile<T>(filePath);
      if (this.isExpired(entry)) {
        await this.delete(key);
        return null;
      }

      // Update memory cache
      this.memoryCache.set(key, entry as CacheEntry<unknown>);
      return entry.data;
    } catch {
      return null;
    }
  }

  /**
   * Set cached data with optional TTL
   */
  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.options.defaultTTL,
      key,
    };

    // Update memory cache
    this.memoryCache.set(key, entry as CacheEntry<unknown>);

    // Write to file
    const filePath = this.getFilePath(key);
    await this.writeFile(filePath, entry);
  }

  /**
   * Check if key exists and is valid
   */
  async has(key: string): Promise<boolean> {
    const data = await this.get(key);
    return data !== null;
  }

  /**
   * Delete cached data
   */
  async delete(key: string): Promise<void> {
    this.memoryCache.delete(key);

    const filePath = this.getFilePath(key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();

    if (fs.existsSync(this.options.cacheDir)) {
      const files = fs.readdirSync(this.options.cacheDir);
      for (const file of files) {
        const filePath = path.join(this.options.cacheDir, file);
        fs.unlinkSync(filePath);
      }
    }
  }

  /**
   * Clear expired entries
   */
  async clearExpired(): Promise<number> {
    let cleared = 0;

    // Clear expired memory entries
    for (const [key, entry] of this.memoryCache.entries()) {
      if (this.isExpired(entry)) {
        this.memoryCache.delete(key);
        cleared++;
      }
    }

    // Clear expired file entries
    if (fs.existsSync(this.options.cacheDir)) {
      const files = fs.readdirSync(this.options.cacheDir);
      for (const file of files) {
        const filePath = path.join(this.options.cacheDir, file);
        try {
          const entry = await this.readFile(filePath);
          if (this.isExpired(entry)) {
            fs.unlinkSync(filePath);
            cleared++;
          }
        } catch {
          // Remove corrupted files
          fs.unlinkSync(filePath);
          cleared++;
        }
      }
    }

    return cleared;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    memoryEntries: number;
    fileEntries: number;
    cacheDir: string;
  } {
    let fileEntries = 0;
    if (fs.existsSync(this.options.cacheDir)) {
      fileEntries = fs.readdirSync(this.options.cacheDir).length;
    }

    return {
      memoryEntries: this.memoryCache.size,
      fileEntries,
      cacheDir: this.options.cacheDir,
    };
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  /**
   * Generate cache key for a record
   */
  static createRecordKey(
    connector: string,
    version: string,
    recordId: string
  ): string {
    return `${connector}_${version}_${recordId}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  }

  /**
   * Generate cache key for a schema
   */
  static createSchemaKey(
    connector: string,
    version: string,
    records: string[]
  ): string {
    const recordsHash = records.sort().join('_');
    return `schema_${connector}_${version}_${recordsHash}`
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.options.cacheDir)) {
      fs.mkdirSync(this.options.cacheDir, { recursive: true });
    }
  }

  private getFilePath(key: string): string {
    const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = this.options.compress ? '.json.gz' : '.json';
    return path.join(this.options.cacheDir, `${sanitizedKey}${ext}`);
  }

  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() > entry.timestamp + entry.ttl;
  }

  private async writeFile<T>(filePath: string, entry: CacheEntry<T>): Promise<void> {
    const json = JSON.stringify(entry);

    if (this.options.compress) {
      const compressed = zlib.gzipSync(json);
      fs.writeFileSync(filePath, compressed);
    } else {
      fs.writeFileSync(filePath, json, 'utf8');
    }
  }

  private async readFile<T>(filePath: string): Promise<CacheEntry<T>> {
    let content: string;

    if (this.options.compress || filePath.endsWith('.gz')) {
      const compressed = fs.readFileSync(filePath);
      content = zlib.gunzipSync(compressed).toString('utf8');
    } else {
      content = fs.readFileSync(filePath, 'utf8');
    }

    return JSON.parse(content) as CacheEntry<T>;
  }
}

// =============================================================================
// PARSED RECORD CACHE
// =============================================================================

/**
 * Specialized cache for parsed records
 */
export class ParsedRecordCache extends SchemaCache {
  private connector: string;
  private version: string;

  constructor(
    connector: string,
    version: string,
    options: Partial<CacheOptions> = {}
  ) {
    super(options);
    this.connector = connector;
    this.version = version;
  }

  /**
   * Get cached parsed record
   */
  async getRecord(recordName: string): Promise<ParsedRecord | null> {
    const key = SchemaCache.createRecordKey(
      this.connector,
      this.version,
      recordName
    );
    return this.get<ParsedRecord>(key);
  }

  /**
   * Set cached parsed record
   */
  async setRecord(record: ParsedRecord, ttl?: number): Promise<void> {
    const key = SchemaCache.createRecordKey(
      this.connector,
      this.version,
      record.name
    );
    return this.set(key, record, ttl);
  }

  /**
   * Get multiple cached records
   */
  async getRecords(recordNames: string[]): Promise<{
    found: ParsedRecord[];
    missing: string[];
  }> {
    const found: ParsedRecord[] = [];
    const missing: string[] = [];

    for (const name of recordNames) {
      const record = await this.getRecord(name);
      if (record) {
        found.push(record);
      } else {
        missing.push(name);
      }
    }

    return { found, missing };
  }

  /**
   * Set multiple cached records
   */
  async setRecords(records: ParsedRecord[], ttl?: number): Promise<void> {
    for (const record of records) {
      await this.setRecord(record, ttl);
    }
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a schema cache with default options
 */
export function createSchemaCache(
  options?: Partial<CacheOptions>
): SchemaCache {
  return new SchemaCache(options);
}

/**
 * Create a record cache for a specific connector
 */
export function createRecordCache(
  connector: string,
  version: string,
  options?: Partial<CacheOptions>
): ParsedRecordCache {
  return new ParsedRecordCache(connector, version, options);
}

export default SchemaCache;
