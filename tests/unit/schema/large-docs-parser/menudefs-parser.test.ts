/**
 * Tests for MenuDefs Parser
 */

import * as path from 'path';
import * as fs from 'fs';
import { MenuDefsParser } from '../../../../src/schema/parsers/large-docs-parser/menudefs-parser';

describe('MenuDefsParser', () => {
  const indexPath = path.resolve(
    __dirname,
    '../../../../src/schema/indexes/netsuite-2025_2.json'
  );

  describe('loadIndex', () => {
    it('should load pre-parsed index successfully', async () => {
      if (!fs.existsSync(indexPath)) {
        console.log('Skipping test - index file not found');
        return;
      }

      const parser = new MenuDefsParser();
      const index = await parser.loadIndex(indexPath);

      expect(index).toBeDefined();
      expect(index.version).toBe('2025.2');
      expect(index.stats.totalRecords).toBeGreaterThan(500);
      expect(index.records).toBeInstanceOf(Array);
    });

    it('should throw error for non-existent file', async () => {
      const parser = new MenuDefsParser();
      await expect(parser.loadIndex('/nonexistent/path.json')).rejects.toThrow(
        'Index file not found'
      );
    });
  });

  describe('findRecord', () => {
    let parser: MenuDefsParser;

    beforeAll(async () => {
      if (!fs.existsSync(indexPath)) {
        return;
      }
      parser = new MenuDefsParser();
      await parser.loadIndex(indexPath);
    });

    it('should find record by schema name', () => {
      if (!parser) return;

      const record = parser.findRecord('Customer');
      expect(record).toBeDefined();
      expect(record?.schemaName).toBe('Customer');
    });

    it('should find record by script name', () => {
      if (!parser) return;

      const record = parser.findRecord('customer');
      expect(record).toBeDefined();
    });

    it('should return undefined for non-existent record', () => {
      if (!parser) return;

      const record = parser.findRecord('NonExistentRecord123');
      expect(record).toBeUndefined();
    });

    it('should be case-insensitive', () => {
      if (!parser) return;

      const record1 = parser.findRecord('CUSTOMER');
      const record2 = parser.findRecord('customer');
      expect(record1).toEqual(record2);
    });
  });

  describe('getRecordsByPackage', () => {
    let parser: MenuDefsParser;

    beforeAll(async () => {
      if (!fs.existsSync(indexPath)) {
        return;
      }
      parser = new MenuDefsParser();
      await parser.loadIndex(indexPath);
    });

    it('should return records for valid package', () => {
      if (!parser) return;

      const records = parser.getRecordsByPackage('lists');
      expect(records.length).toBeGreaterThan(0);
      expect(records.every(r => r.package === 'lists')).toBe(true);
    });

    it('should return empty array for non-existent package', () => {
      if (!parser) return;

      const records = parser.getRecordsByPackage('nonexistent');
      expect(records).toEqual([]);
    });
  });

  describe('searchRecords', () => {
    let parser: MenuDefsParser;

    beforeAll(async () => {
      if (!fs.existsSync(indexPath)) {
        return;
      }
      parser = new MenuDefsParser();
      await parser.loadIndex(indexPath);
    });

    it('should find records matching pattern', () => {
      if (!parser) return;

      const records = parser.searchRecords('customer');
      expect(records.length).toBeGreaterThan(0);
      expect(
        records.some(
          r =>
            r.schemaName?.toLowerCase().includes('customer') ||
            r.scriptName?.toLowerCase().includes('customer')
        )
      ).toBe(true);
    });

    it('should support regex patterns', () => {
      if (!parser) return;

      const records = parser.searchRecords('^Invoice$');
      expect(records.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getSchemaRecords', () => {
    let parser: MenuDefsParser;

    beforeAll(async () => {
      if (!fs.existsSync(indexPath)) {
        return;
      }
      parser = new MenuDefsParser();
      await parser.loadIndex(indexPath);
    });

    it('should return only records with schema interface', () => {
      if (!parser) return;

      const records = parser.getSchemaRecords();
      expect(records.length).toBeGreaterThan(0);
      expect(records.every(r => r.interfaces.schema)).toBe(true);
    });
  });

  describe('getPackages', () => {
    let parser: MenuDefsParser;

    beforeAll(async () => {
      if (!fs.existsSync(indexPath)) {
        return;
      }
      parser = new MenuDefsParser();
      await parser.loadIndex(indexPath);
    });

    it('should return list of available packages', () => {
      if (!parser) return;

      const packages = parser.getPackages();
      expect(packages).toContain('lists');
      expect(packages).toContain('transactions');
    });
  });
});
