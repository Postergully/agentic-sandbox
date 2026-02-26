/**
 * Field Type Mapper
 *
 * Maps NetSuite documentation types to ConnectorSchema field types
 * with appropriate faker hints for synthetic data generation.
 *
 * @module large-docs-parser/field-mapper
 */

import { ParsedField, MappedFieldType, FieldTypeMapping } from './types';

// =============================================================================
// TYPE MAPPINGS
// =============================================================================

/**
 * Type mapping rules ordered by specificity (most specific first)
 */
const TYPE_MAPPINGS: FieldTypeMapping[] = [
  // Date/Time types
  { pattern: /^dateTime$/i, type: 'datetime', faker: 'date.recent' },
  { pattern: /^date$/i, type: 'date', faker: 'date.recent' },

  // Numeric types
  { pattern: /^double$/i, type: 'number', faker: 'number.float' },
  { pattern: /^float$/i, type: 'number', faker: 'number.float' },
  { pattern: /^long$/i, type: 'number', faker: 'number.int' },
  { pattern: /^int$/i, type: 'number', faker: 'number.int' },
  { pattern: /^integer$/i, type: 'number', faker: 'number.int' },

  // Boolean
  { pattern: /^boolean$/i, type: 'boolean' },
  { pattern: /^bool$/i, type: 'boolean' },

  // Reference types (RecordRef, etc.)
  { pattern: /^RecordRef$/i, type: 'uuid', isReference: true },
  { pattern: /Ref$/i, type: 'uuid', isReference: true },
  { pattern: /List$/i, type: 'json', isReference: true },

  // Enum types
  { pattern: /Type$/i, type: 'string' },
  { pattern: /Status$/i, type: 'string' },

  // Default string
  { pattern: /^string$/i, type: 'string' },
];

/**
 * Field name to faker method hints
 */
const FAKER_HINTS: Record<string, string> = {
  // Identity
  id: 'string.uuid',
  internalId: 'string.uuid',
  externalId: 'string.alphanumeric',

  // Contact info
  email: 'internet.email',
  altEmail: 'internet.email',
  phone: 'phone.number',
  altPhone: 'phone.number',
  fax: 'phone.number',
  mobilePhone: 'phone.number',
  homePhone: 'phone.number',
  officePhone: 'phone.number',

  // Address
  address1: 'location.streetAddress',
  address2: 'location.secondaryAddress',
  addr1: 'location.streetAddress',
  addr2: 'location.secondaryAddress',
  city: 'location.city',
  state: 'location.state',
  zip: 'location.zipCode',
  zipCode: 'location.zipCode',
  postalCode: 'location.zipCode',
  country: 'location.country',

  // Company
  companyName: 'company.name',
  company: 'company.name',
  entityId: 'string.alphanumeric',
  accountNumber: 'finance.accountNumber',

  // Person
  firstName: 'person.firstName',
  lastName: 'person.lastName',
  middleName: 'person.middleName',
  fullName: 'person.fullName',
  salutation: 'person.prefix',
  title: 'person.jobTitle',
  jobTitle: 'person.jobTitle',

  // Financial
  balance: 'finance.amount',
  creditLimit: 'finance.amount',
  amount: 'finance.amount',
  total: 'finance.amount',
  subtotal: 'finance.amount',
  tax: 'finance.amount',
  taxTotal: 'finance.amount',
  discount: 'finance.amount',
  price: 'commerce.price',
  cost: 'commerce.price',
  rate: 'number.float',
  quantity: 'number.int',
  qty: 'number.int',

  // Transaction
  tranId: 'string.alphanumeric',
  tranDate: 'date.recent',
  orderNumber: 'string.alphanumeric',
  poNumber: 'string.alphanumeric',
  memo: 'lorem.sentence',
  description: 'lorem.paragraph',

  // Dates
  createdDate: 'date.past',
  lastModifiedDate: 'date.recent',
  dateCreated: 'date.past',
  lastModified: 'date.recent',
  startDate: 'date.soon',
  endDate: 'date.future',
  dueDate: 'date.soon',

  // URLs
  url: 'internet.url',
  website: 'internet.url',
  webAddress: 'internet.url',

  // Misc
  comments: 'lorem.paragraph',
  notes: 'lorem.paragraph',
  image: 'image.url',
  currency: 'finance.currencyCode',
  currencyName: 'finance.currencyName',
};

// =============================================================================
// MAPPER CLASS
// =============================================================================

export class FieldMapper {
  /**
   * Map a parsed field to a ConnectorSchema field type
   */
  mapField(field: ParsedField): MappedFieldType {
    // First try type mapping
    const typeResult = this.mapType(field.rawType);

    // Then enhance with faker hint from field name
    const fakerHint = this.getFakerHint(field.name, field.rawType, field.label);

    return {
      type: typeResult.type,
      faker: fakerHint || typeResult.faker,
      isReference: typeResult.isReference,
      referencedEntity: typeResult.referencedEntity,
    };
  }

  /**
   * Map raw type string to ConnectorSchema type
   */
  mapType(rawType: string): MappedFieldType {
    // Check each mapping pattern
    for (const mapping of TYPE_MAPPINGS) {
      if (mapping.pattern.test(rawType)) {
        let referencedEntity: string | undefined;

        // Extract referenced entity from RecordRef type
        if (mapping.isReference && rawType !== 'RecordRef') {
          // Try to extract entity name from type like "CustomerRef" -> "Customer"
          const match = rawType.match(/^([A-Z][a-z]+)(?:Ref|List)$/);
          if (match) {
            referencedEntity = match[1];
          }
        }

        return {
          type: mapping.type,
          faker: mapping.faker,
          isReference: mapping.isReference ?? false,
          referencedEntity,
        };
      }
    }

    // Default to string for unknown types
    return {
      type: 'string',
      isReference: false,
    };
  }

  /**
   * Get faker hint based on field name and type
   */
  getFakerHint(name: string, _rawType: string, label: string): string | undefined {
    // Check direct name match
    const normalizedName = name.toLowerCase();
    for (const [key, faker] of Object.entries(FAKER_HINTS)) {
      if (normalizedName === key.toLowerCase()) {
        return faker;
      }
    }

    // Check if name contains common patterns
    for (const [key, faker] of Object.entries(FAKER_HINTS)) {
      if (normalizedName.includes(key.toLowerCase())) {
        return faker;
      }
    }

    // Check label for hints
    const normalizedLabel = label.toLowerCase();
    for (const [key, faker] of Object.entries(FAKER_HINTS)) {
      if (normalizedLabel.includes(key.toLowerCase())) {
        return faker;
      }
    }

    // Return undefined if no hint found
    return undefined;
  }

  /**
   * Determine if a field is likely a primary key
   */
  isPrimaryKey(field: ParsedField): boolean {
    const name = field.name.toLowerCase();
    return (
      name === 'id' ||
      name === 'internalid' ||
      name === 'externalid' ||
      (name.endsWith('id') && field.required && field.cardinality === '1')
    );
  }

  /**
   * Determine if a field is likely a foreign key
   */
  isForeignKey(field: ParsedField): boolean {
    return (
      field.rawType === 'RecordRef' ||
      field.rawType.endsWith('Ref') ||
      (field.typeRef?.includes('recordref') ?? false)
    );
  }

  /**
   * Extract referenced entity name from a foreign key field
   */
  getReferencedEntity(field: ParsedField): string | undefined {
    if (!this.isForeignKey(field)) {
      return undefined;
    }

    // Try to extract from typeRef URL
    if (field.typeRef) {
      const match = field.typeRef.match(/\/([a-z]+)\.html/i);
      if (match) {
        return match[1].charAt(0).toUpperCase() + match[1].slice(1);
      }
    }

    // Try to extract from field name (e.g., "customerId" -> "Customer")
    const name = field.name;
    if (name.endsWith('Id') || name.endsWith('ID')) {
      const baseName = name.replace(/Id$/i, '');
      return baseName.charAt(0).toUpperCase() + baseName.slice(1);
    }

    return undefined;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Map a single field (convenience function)
 */
export function mapFieldType(field: ParsedField): MappedFieldType {
  const mapper = new FieldMapper();
  return mapper.mapField(field);
}

/**
 * Get faker hint for a field name
 */
export function getFakerHintForName(name: string): string | undefined {
  const mapper = new FieldMapper();
  return mapper.getFakerHint(name, 'string', '');
}

export default FieldMapper;
