/**
 * Tests for Field Mapper
 */

import {
  FieldMapper,
  mapFieldType,
  getFakerHintForName,
} from '../../../../src/schema/parsers/large-docs-parser/field-mapper';
import { ParsedField } from '../../../../src/schema/parsers/large-docs-parser/types';

describe('FieldMapper', () => {
  const mapper = new FieldMapper();

  describe('mapType', () => {
    it('should map string type', () => {
      const result = mapper.mapType('string');
      expect(result.type).toBe('string');
      expect(result.isReference).toBe(false);
    });

    it('should map double to number', () => {
      const result = mapper.mapType('double');
      expect(result.type).toBe('number');
      expect(result.faker).toBe('number.float');
    });

    it('should map boolean type', () => {
      const result = mapper.mapType('boolean');
      expect(result.type).toBe('boolean');
    });

    it('should map date types', () => {
      const dateResult = mapper.mapType('date');
      expect(dateResult.type).toBe('date');

      const datetimeResult = mapper.mapType('dateTime');
      expect(datetimeResult.type).toBe('datetime');
    });

    it('should map RecordRef as reference', () => {
      const result = mapper.mapType('RecordRef');
      expect(result.type).toBe('uuid');
      expect(result.isReference).toBe(true);
    });

    it('should extract entity name from typed ref', () => {
      const result = mapper.mapType('CustomerRef');
      expect(result.type).toBe('uuid');
      expect(result.isReference).toBe(true);
      expect(result.referencedEntity).toBe('Customer');
    });

    it('should handle unknown types as string', () => {
      const result = mapper.mapType('unknownType123');
      expect(result.type).toBe('string');
    });
  });

  describe('mapField', () => {
    it('should map complete field with faker hint', () => {
      const field: ParsedField = {
        name: 'email',
        rawType: 'string',
        cardinality: '0..1',
        label: 'Email Address',
        required: false,
        helpText: 'Customer email',
      };

      const result = mapper.mapField(field);
      expect(result.type).toBe('string');
      expect(result.faker).toBe('internet.email');
      expect(result.isReference).toBe(false);
    });

    it('should detect foreign key reference', () => {
      const field: ParsedField = {
        name: 'customerId',
        rawType: 'RecordRef',
        cardinality: '0..1',
        label: 'Customer',
        required: false,
        helpText: 'Reference to customer',
        typeRef: '../../schema/other/recordref.html',
      };

      const result = mapper.mapField(field);
      expect(result.type).toBe('uuid');
      expect(result.isReference).toBe(true);
    });
  });

  describe('getFakerHint', () => {
    it('should return faker hint for known field names', () => {
      expect(mapper.getFakerHint('email', 'string', '')).toBe('internet.email');
      expect(mapper.getFakerHint('companyName', 'string', '')).toBe('company.name');
      expect(mapper.getFakerHint('firstName', 'string', '')).toBe('person.firstName');
      expect(mapper.getFakerHint('phone', 'string', '')).toBe('phone.number');
      expect(mapper.getFakerHint('city', 'string', '')).toBe('location.city');
    });

    it('should return undefined for unknown field names', () => {
      expect(mapper.getFakerHint('unknownField', 'string', '')).toBeUndefined();
    });

    it('should detect hints from partial matches', () => {
      expect(mapper.getFakerHint('customerEmail', 'string', '')).toBe('internet.email');
      expect(mapper.getFakerHint('billingCity', 'string', '')).toBe('location.city');
    });
  });

  describe('isPrimaryKey', () => {
    it('should identify id as primary key', () => {
      const field: ParsedField = {
        name: 'id',
        rawType: 'uuid',
        cardinality: '1',
        label: 'ID',
        required: true,
        helpText: '',
      };
      expect(mapper.isPrimaryKey(field)).toBe(true);
    });

    it('should identify internalId as primary key', () => {
      const field: ParsedField = {
        name: 'internalId',
        rawType: 'string',
        cardinality: '1',
        label: 'Internal ID',
        required: true,
        helpText: '',
      };
      expect(mapper.isPrimaryKey(field)).toBe(true);
    });
  });

  describe('isForeignKey', () => {
    it('should identify RecordRef as foreign key', () => {
      const field: ParsedField = {
        name: 'customerId',
        rawType: 'RecordRef',
        cardinality: '0..1',
        label: 'Customer',
        required: false,
        helpText: '',
      };
      expect(mapper.isForeignKey(field)).toBe(true);
    });

    it('should identify typed Ref as foreign key', () => {
      const field: ParsedField = {
        name: 'parent',
        rawType: 'CustomerRef',
        cardinality: '0..1',
        label: 'Parent',
        required: false,
        helpText: '',
      };
      expect(mapper.isForeignKey(field)).toBe(true);
    });

    it('should not identify regular string as foreign key', () => {
      const field: ParsedField = {
        name: 'name',
        rawType: 'string',
        cardinality: '0..1',
        label: 'Name',
        required: false,
        helpText: '',
      };
      expect(mapper.isForeignKey(field)).toBe(false);
    });
  });
});

describe('Helper Functions', () => {
  describe('mapFieldType', () => {
    it('should map field using convenience function', () => {
      const field: ParsedField = {
        name: 'balance',
        rawType: 'double',
        cardinality: '0..1',
        label: 'Balance',
        required: false,
        helpText: '',
      };

      const result = mapFieldType(field);
      expect(result.type).toBe('number');
      expect(result.faker).toBe('finance.amount');
    });
  });

  describe('getFakerHintForName', () => {
    it('should return faker hint for field name', () => {
      expect(getFakerHintForName('email')).toBe('internet.email');
      expect(getFakerHintForName('zipCode')).toBe('location.zipCode');
    });
  });
});
