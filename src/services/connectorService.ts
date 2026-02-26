import { Connector } from '../types';

// Hardcoded connector data - NetSuite is the only implemented connector
const connectors: Connector[] = [
  {
    _key: 'netsuite',
    name: 'NetSuite',
    type: 'NETSUITE',
    appGroup: 'ERP',
    appGroupId: 'erp-001',
    authType: 'OAUTH',
    appDescription: 'Oracle NetSuite ERP system for financials, inventory, and order management',
    appCategories: ['ERP', 'Accounting', 'Finance'],
    iconPath: '/assets/icons/connectors/netsuite.svg',
    isActive: true,
    isConfigured: true,
    isAuthenticated: true,
    supportsRealtime: false,
    createdAtTimestamp: Date.now(),
    updatedAtTimestamp: Date.now(),
  },
  {
    _key: 'salesforce',
    name: 'Salesforce',
    type: 'SALESFORCE',
    appGroup: 'CRM',
    appGroupId: 'crm-001',
    authType: 'OAUTH',
    appDescription: 'Salesforce CRM for sales, service, and marketing automation',
    appCategories: ['CRM', 'Sales', 'Marketing'],
    iconPath: '/assets/icons/connectors/salesforce.svg',
    isActive: false,
    isConfigured: false,
    isAuthenticated: false,
    supportsRealtime: true,
    createdAtTimestamp: Date.now(),
    updatedAtTimestamp: Date.now(),
  },
  {
    _key: 'hubspot',
    name: 'HubSpot',
    type: 'HUBSPOT',
    appGroup: 'Marketing',
    appGroupId: 'mkt-001',
    authType: 'OAUTH',
    appDescription: 'HubSpot CRM and marketing automation platform',
    appCategories: ['CRM', 'Marketing', 'Sales'],
    iconPath: '/assets/icons/connectors/hubspot.svg',
    isActive: false,
    isConfigured: false,
    isAuthenticated: false,
    supportsRealtime: true,
    createdAtTimestamp: Date.now(),
    updatedAtTimestamp: Date.now(),
  },
  {
    _key: 'quickbooks',
    name: 'QuickBooks',
    type: 'QUICKBOOKS',
    appGroup: 'Accounting',
    appGroupId: 'acc-001',
    authType: 'OAUTH',
    appDescription: 'QuickBooks Online accounting and bookkeeping software',
    appCategories: ['Accounting', 'Finance', 'Bookkeeping'],
    iconPath: '/assets/icons/connectors/quickbooks.svg',
    isActive: false,
    isConfigured: false,
    isAuthenticated: false,
    supportsRealtime: false,
    createdAtTimestamp: Date.now(),
    updatedAtTimestamp: Date.now(),
  },
];

class ConnectorService {
  getAllConnectors(): Connector[] {
    return connectors;
  }

  getConnectorByName(name: string): Connector | undefined {
    return connectors.find(
      (c) => c._key.toLowerCase() === name.toLowerCase() || c.name.toLowerCase() === name.toLowerCase()
    );
  }

  getActiveConnectors(): Connector[] {
    return connectors.filter((c) => c.isActive);
  }

  getInactiveConnectors(): Connector[] {
    return connectors.filter((c) => !c.isActive);
  }
}

export default new ConnectorService();
