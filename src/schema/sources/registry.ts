/**
 * Source Registry
 *
 * Maps connectors to their known public API schema sources.
 * Ported from Python harvester's apideck_harvester.py, apisguru_harvester.py,
 * github_harvester.py, and postman_harvester.py.
 *
 * @module schema/sources/registry
 */

// =============================================================================
// APIDECK MAPPINGS
// =============================================================================

/** Apideck unified API category per connector */
export const CONNECTOR_TO_APIDECK_API: Record<string, string | null> = {
  // Finance / Accounting
  netsuite: 'accounting',
  quickbooks: 'accounting',
  xero: 'accounting',
  sage: 'accounting',
  zoho_books: 'accounting',
  freshbooks: 'accounting',
  // CRM
  hubspot: 'crm',
  salesforce: 'crm',
  zoho_crm: 'crm',
  pipedrive: 'crm',
  // HR
  workday: 'hris',
  bamboohr: 'hris',
  gusto: 'hris',
  rippling: 'hris',
  // Storage
  google_drive: 'file-storage',
  dropbox: 'file-storage',
  box: 'file-storage',
  sharepoint: 'file-storage',
  // Comms — not available in Apideck
  slack: null,
  teams: null,
  gmail: null,
};

/** Apideck public OpenAPI spec URLs per unified API (via GitHub raw) */
export const APIDECK_SPEC_URLS: Record<string, string> = {
  accounting: 'https://raw.githubusercontent.com/apideck-libraries/openapi-specs/master/accounting.yml',
  crm: 'https://raw.githubusercontent.com/apideck-libraries/openapi-specs/master/crm.yml',
  hris: 'https://raw.githubusercontent.com/apideck-libraries/openapi-specs/master/hris.yml',
  'file-storage': 'https://raw.githubusercontent.com/apideck-libraries/openapi-specs/master/file-storage.yml',
  ats: 'https://raw.githubusercontent.com/apideck-libraries/openapi-specs/master/ats.yml',
  ecommerce: 'https://raw.githubusercontent.com/apideck-libraries/openapi-specs/master/ecommerce.yml',
};

// =============================================================================
// APIs.GURU MAPPINGS
// =============================================================================

export const APIS_GURU_INDEX_URL = 'https://api.apis.guru/v2/list.json';

/** APIs.guru provider slug per connector */
export const CONNECTOR_TO_PROVIDER: Record<string, string> = {
  hubspot: 'hubspot.com',
  slack: 'slack.com',
  xero: 'xero.com',
  quickbooks: 'intuit.com',
  shopify: 'shopify.dev',
  stripe: 'stripe.com',
  pipedrive: 'pipedrive.com',
  google_drive: 'googleapis.com:drive',
  gmail: 'googleapis.com:gmail',
  dropbox: 'dropbox.com',
  freshbooks: 'freshbooks.com',
  zoho_crm: 'zoho.com',
  zoho_books: 'zoho.com',
  bamboohr: 'bamboohr.com',
};

// =============================================================================
// GITHUB KNOWN REPOS
// =============================================================================

/** Known community/official OpenAPI spec repos per connector */
export const KNOWN_REPOS: Record<string, string[]> = {
  netsuite: [
    'https://raw.githubusercontent.com/oracle/netsuite-suitecloud-sdk/master/packages/node-cli/openapi.yaml',
  ],
  hubspot: [
    'https://raw.githubusercontent.com/HubSpot/HubSpot-public-api-spec-collection/main/PublicApiSpecs/CRM/Contacts/Rollouts/424/v3/contacts.json',
  ],
  slack: [
    'https://raw.githubusercontent.com/slackapi/slack-api-specs/master/web-api/slack_web_openapi_v2.json',
  ],
  stripe: [
    'https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json',
  ],
  google_drive: [
    'https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/googleapis.com/drive/v3/openapi.yaml',
  ],
  xero: [
    'https://raw.githubusercontent.com/XeroAPI/Xero-OpenAPI/master/xero_accounting.yaml',
  ],
  gmail: [
    'https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/googleapis.com/gmail/v1/openapi.yaml',
  ],
};

/** GitHub code search URL template */
export const GITHUB_SEARCH_URL =
  'https://api.github.com/search/code?q={connector}+openapi+spec+filename:openapi.yaml+filename:openapi.json&per_page=3';

// =============================================================================
// POSTMAN COLLECTIONS
// =============================================================================

/** Known public Postman collection URLs per connector (raw JSON only, no postman.com web URLs) */
export const POSTMAN_COLLECTIONS: Record<string, string> = {
  hubspot:
    'https://raw.githubusercontent.com/HubSpot/HubSpot-public-api-spec-collection/main/PostmanCollections/CRM.json',
};

// =============================================================================
// SOURCE CONFIG TYPE
// =============================================================================

export interface SourceConfig {
  apideck: { category: string | null; specUrl: string | null };
  apisGuru: { provider: string | null };
  github: { repos: string[] };
  postman: { collectionUrl: string | null };
}

/**
 * Get all source configurations for a connector
 */
export function getSourceConfig(connector: string): SourceConfig {
  const apideckCategory = CONNECTOR_TO_APIDECK_API[connector] ?? null;
  return {
    apideck: {
      category: apideckCategory,
      specUrl: apideckCategory ? APIDECK_SPEC_URLS[apideckCategory] ?? null : null,
    },
    apisGuru: {
      provider: CONNECTOR_TO_PROVIDER[connector] ?? null,
    },
    github: {
      repos: KNOWN_REPOS[connector] ?? [],
    },
    postman: {
      collectionUrl: POSTMAN_COLLECTIONS[connector] ?? null,
    },
  };
}

/**
 * Get all known connector names across all registries
 */
export function getAllKnownConnectors(): string[] {
  const connectors = new Set<string>();
  for (const key of Object.keys(CONNECTOR_TO_APIDECK_API)) connectors.add(key);
  for (const key of Object.keys(CONNECTOR_TO_PROVIDER)) connectors.add(key);
  for (const key of Object.keys(KNOWN_REPOS)) connectors.add(key);
  for (const key of Object.keys(POSTMAN_COLLECTIONS)) connectors.add(key);
  return [...connectors].sort();
}
