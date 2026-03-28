/**
 * Vertical Entity Mappings
 *
 * Maps industry verticals to their connectors and key entities.
 * Used for connector-aware entity filtering and pre-population.
 *
 * @module schema/sources/verticals
 */

// =============================================================================
// VERTICAL → CONNECTOR MAPPINGS
// =============================================================================

export const VERTICAL_CONNECTORS: Record<string, string[]> = {
  finance: ['netsuite', 'quickbooks', 'xero', 'sage', 'zoho_books', 'freshbooks'],
  crm: ['hubspot', 'salesforce', 'zoho_crm', 'pipedrive'],
  hr: ['workday', 'bamboohr', 'gusto', 'rippling'],
  storage: ['google_drive', 'dropbox', 'box', 'sharepoint'],
  comms: ['slack', 'teams', 'gmail'],
  ecom: ['shopify', 'woocommerce', 'stripe'],
};

// =============================================================================
// KEY ENTITIES PER API CATEGORY
// =============================================================================

/** Entities that matter per API category — used for filtering irrelevant schemas */
export const CATEGORY_KEY_ENTITIES: Record<string, string[]> = {
  accounting: [
    'Bill', 'BillPayment', 'Invoice', 'InvoiceItem',
    'Supplier', 'Vendor', 'Customer',
    'LedgerAccount', 'Account',
    'JournalEntry', 'TaxRate', 'BankAccount',
    'CompanyInfo', 'Payment', 'CreditNote',
    'PurchaseOrder', 'SalesOrder',
  ],
  crm: [
    'Contact', 'Lead', 'Opportunity', 'Deal',
    'Company', 'Account', 'Activity', 'Note',
    'Pipeline', 'Stage', 'Task', 'Email',
  ],
  hris: [
    'Employee', 'Department', 'TimeOff', 'TimeOffRequest',
    'Payroll', 'PayrollRun', 'Benefit', 'Compensation',
    'Location', 'Team',
  ],
  'file-storage': [
    'File', 'Folder', 'SharedLink', 'Permission',
    'Drive', 'Upload',
  ],
  ecommerce: [
    'Product', 'Order', 'Customer', 'LineItem',
    'Variant', 'Collection', 'Inventory', 'Fulfillment',
    'Refund', 'Transaction',
  ],
};

// =============================================================================
// CONNECTOR → VERTICAL REVERSE LOOKUP
// =============================================================================

const _connectorToVertical = new Map<string, string>();
for (const [vertical, connectors] of Object.entries(VERTICAL_CONNECTORS)) {
  for (const connector of connectors) {
    _connectorToVertical.set(connector, vertical);
  }
}

/**
 * Get the vertical for a connector
 */
export function getVerticalForConnector(connector: string): string | null {
  return _connectorToVertical.get(connector) ?? null;
}

/**
 * Get connectors for a vertical
 */
export function getConnectorsForVertical(vertical: string): string[] {
  return VERTICAL_CONNECTORS[vertical] ?? [];
}

/**
 * Get key entities for a connector based on its Apideck API category
 */
export function getKeyEntitiesForCategory(apiCategory: string): string[] {
  return CATEGORY_KEY_ENTITIES[apiCategory] ?? [];
}

/**
 * Get all known verticals
 */
export function getAllVerticals(): string[] {
  return Object.keys(VERTICAL_CONNECTORS);
}

/**
 * Filter schemas to only include entities relevant to the API category.
 * Returns the full schemas dict if no key entities are defined for the category.
 */
export function filterRelevantSchemas(
  schemas: Record<string, unknown>,
  apiCategory: string
): Record<string, unknown> {
  const keyEntities = CATEGORY_KEY_ENTITIES[apiCategory];
  if (!keyEntities || keyEntities.length === 0) return schemas;

  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schemas)) {
    if (keyEntities.some((entity) => key.toLowerCase().includes(entity.toLowerCase()))) {
      filtered[key] = value;
    }
  }
  return filtered;
}

/**
 * Filter paths to only include those relevant to the API category.
 */
export function filterRelevantPaths(
  paths: Record<string, unknown>,
  apiCategory: string
): Record<string, unknown> {
  const keyEntities = CATEGORY_KEY_ENTITIES[apiCategory];
  if (!keyEntities || keyEntities.length === 0) return paths;

  const filtered: Record<string, unknown> = {};
  for (const [pathStr, value] of Object.entries(paths)) {
    if (keyEntities.some((entity) => pathStr.toLowerCase().includes(entity.toLowerCase()))) {
      filtered[pathStr] = value;
    }
  }
  return filtered;
}
