/**
 * Tests for Record Selector
 */

import {
  RecordSelector,
  createSelector,
  selectCommonRecords,
} from '../../../../src/schema/parsers/large-docs-parser/record-selector';
import { RecordIndex, RecordIndexEntry } from '../../../../src/schema/parsers/large-docs-parser/types';

describe('RecordSelector', () => {
  // Create a mock index for testing
  const mockIndex: RecordIndex = {
    version: '2025.2',
    generatedAt: new Date().toISOString(),
    source: 'test',
    stats: {
      totalRecords: 10,
      withSchema: 6,
      withScript: 8,
      withOdbc: 5,
      byPackage: { lists: 5, transactions: 3, setup: 2 },
    },
    records: [
      {
        key: 'record__customer',
        schemaName: 'Customer',
        scriptName: 'customer',
        label: 'Customer',
        package: 'lists',
        namespace: null,
        xsdFile: null,
        odbcName: 'customers',
        interfaces: { schema: true, script: true, odbc: true, analytics: false },
        domains: [],
      },
      {
        key: 'record__invoice',
        schemaName: 'Invoice',
        scriptName: 'invoice',
        label: 'Invoice',
        package: 'transactions',
        namespace: null,
        xsdFile: null,
        odbcName: 'invoices',
        interfaces: { schema: true, script: true, odbc: true, analytics: false },
        domains: [],
      },
      {
        key: 'record__vendor',
        schemaName: 'Vendor',
        scriptName: 'vendor',
        label: 'Vendor',
        package: 'lists',
        namespace: null,
        xsdFile: null,
        odbcName: 'vendors',
        interfaces: { schema: true, script: true, odbc: true, analytics: false },
        domains: [],
      },
      {
        key: 'record__employee',
        schemaName: 'Employee',
        scriptName: 'employee',
        label: 'Employee',
        package: 'lists',
        namespace: null,
        xsdFile: null,
        odbcName: 'employees',
        interfaces: { schema: true, script: true, odbc: false, analytics: false },
        domains: [],
      },
      {
        key: 'record__salesorder',
        schemaName: 'SalesOrder',
        scriptName: 'salesOrder',
        label: 'Sales Order',
        package: 'transactions',
        namespace: null,
        xsdFile: null,
        odbcName: null,
        interfaces: { schema: true, script: true, odbc: false, analytics: false },
        domains: [],
      },
      {
        key: 'record__item',
        schemaName: 'Item',
        scriptName: 'item',
        label: 'Item',
        package: 'lists',
        namespace: null,
        xsdFile: null,
        odbcName: 'items',
        interfaces: { schema: true, script: true, odbc: true, analytics: false },
        domains: [],
      },
      {
        key: 'record__account',
        schemaName: 'Account',
        scriptName: 'account',
        label: 'Account',
        package: 'lists',
        namespace: null,
        xsdFile: null,
        odbcName: 'accounts',
        interfaces: { schema: false, script: true, odbc: true, analytics: false },
        domains: [],
      },
      {
        key: 'record__subsidiary',
        schemaName: null,
        scriptName: 'subsidiary',
        label: 'Subsidiary',
        package: 'setup',
        namespace: null,
        xsdFile: null,
        odbcName: null,
        interfaces: { schema: false, script: true, odbc: false, analytics: false },
        domains: [],
      },
      {
        key: 'record__purchaseorder',
        schemaName: 'PurchaseOrder',
        scriptName: 'purchaseOrder',
        label: 'Purchase Order',
        package: 'transactions',
        namespace: null,
        xsdFile: null,
        odbcName: null,
        interfaces: { schema: false, script: true, odbc: false, analytics: false },
        domains: [],
      },
      {
        key: 'record__role',
        schemaName: null,
        scriptName: 'role',
        label: 'Role',
        package: 'setup',
        namespace: null,
        xsdFile: null,
        odbcName: null,
        interfaces: { schema: false, script: true, odbc: false, analytics: false },
        domains: [],
      },
    ],
    bySchemaName: {
      customer: 'record__customer',
      invoice: 'record__invoice',
      vendor: 'record__vendor',
      employee: 'record__employee',
      salesorder: 'record__salesorder',
      item: 'record__item',
      account: 'record__account',
      purchaseorder: 'record__purchaseorder',
    },
    byScriptName: {
      customer: 'record__customer',
      invoice: 'record__invoice',
      vendor: 'record__vendor',
      employee: 'record__employee',
      salesorder: 'record__salesorder',
      item: 'record__item',
      account: 'record__account',
      subsidiary: 'record__subsidiary',
      purchaseorder: 'record__purchaseorder',
      role: 'record__role',
    },
    byPackage: {
      lists: [
        'record__customer',
        'record__vendor',
        'record__employee',
        'record__item',
        'record__account',
      ],
      transactions: [
        'record__invoice',
        'record__salesorder',
        'record__purchaseorder',
      ],
      setup: ['record__subsidiary', 'record__role'],
    },
  };

  let selector: RecordSelector;

  beforeEach(() => {
    selector = new RecordSelector(mockIndex);
  });

  describe('select', () => {
    it('should select all records when no criteria provided', () => {
      const result = selector.select({});
      expect(result.records.length).toBe(10);
      expect(result.totalMatches).toBe(10);
      expect(result.limited).toBe(false);
    });

    it('should filter by specific record names', () => {
      const result = selector.select({
        records: ['customer', 'invoice'],
      });
      expect(result.records.length).toBe(2);
      expect(result.records.map(r => r.schemaName)).toContain('Customer');
      expect(result.records.map(r => r.schemaName)).toContain('Invoice');
    });

    it('should filter by package', () => {
      const result = selector.select({
        packages: ['lists'],
      });
      expect(result.records.length).toBe(5);
      expect(result.records.every(r => r.package === 'lists')).toBe(true);
    });

    it('should filter by interface requirements', () => {
      const result = selector.select({
        interfaces: { schema: true },
      });
      expect(result.records.length).toBe(6);
      expect(result.records.every(r => r.interfaces.schema)).toBe(true);
    });

    it('should apply limit', () => {
      const result = selector.select({
        limit: 3,
      });
      expect(result.records.length).toBe(3);
      expect(result.totalMatches).toBe(10);
      expect(result.limited).toBe(true);
    });

    it('should search by pattern', () => {
      const result = selector.select({
        search: 'order',
      });
      expect(result.records.length).toBe(2);
      expect(
        result.records.every(
          r =>
            r.schemaName?.toLowerCase().includes('order') ||
            r.scriptName?.toLowerCase().includes('order') ||
            r.label?.toLowerCase().includes('order')
        )
      ).toBe(true);
    });

    it('should combine multiple criteria', () => {
      const result = selector.select({
        packages: ['transactions'],
        interfaces: { schema: true },
      });
      expect(result.records.length).toBe(2);
      expect(result.records.every(r => r.package === 'transactions')).toBe(true);
      expect(result.records.every(r => r.interfaces.schema)).toBe(true);
    });
  });

  describe('selectCommonRecords', () => {
    it('should select common business records', () => {
      const result = selector.selectCommonRecords();
      expect(result.records.length).toBeGreaterThan(0);
      expect(
        result.records.some(r => r.schemaName === 'Customer')
      ).toBe(true);
      expect(
        result.records.some(r => r.schemaName === 'Invoice')
      ).toBe(true);
    });

    it('should respect limit parameter', () => {
      const result = selector.selectCommonRecords(2);
      expect(result.records.length).toBeLessThanOrEqual(2);
    });
  });

  describe('selectByCategory', () => {
    it('should select records by category', () => {
      const result = selector.selectByCategory('transactions');
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.records.every(r => r.package === 'transactions')).toBe(true);
    });
  });

  describe('searchRecords', () => {
    it('should search records by keyword', () => {
      const result = selector.searchRecords('customer');
      expect(result.records.length).toBeGreaterThan(0);
    });
  });
});

describe('Helper Functions', () => {
  const mockIndex: RecordIndex = {
    version: '2025.2',
    generatedAt: new Date().toISOString(),
    source: 'test',
    stats: {
      totalRecords: 1,
      withSchema: 1,
      withScript: 1,
      withOdbc: 0,
      byPackage: {},
    },
    records: [
      {
        key: 'record__test',
        schemaName: 'Test',
        scriptName: 'test',
        label: 'Test',
        package: null,
        namespace: null,
        xsdFile: null,
        odbcName: null,
        interfaces: { schema: true, script: true, odbc: false, analytics: false },
        domains: [],
      },
    ],
    bySchemaName: { test: 'record__test' },
    byScriptName: { test: 'record__test' },
    byPackage: {},
  };

  describe('createSelector', () => {
    it('should create a selector from index', () => {
      const selector = createSelector(mockIndex);
      expect(selector).toBeInstanceOf(RecordSelector);
    });
  });

  describe('selectCommonRecords', () => {
    it('should select common records from index', () => {
      const result = selectCommonRecords(mockIndex);
      expect(result.records).toBeDefined();
    });
  });
});
