// data/connector-definitions.ts

import type { ConnectorDefinition } from '../types/types';

const BASE_REDIRECT_URI = 'http://localhost:3003/connectors/oauth/callback';

export const CONNECTOR_DEFINITIONS: ConnectorDefinition[] = [
  // Microsoft 365 Connectors
  {
    name: 'OneDrive',
    type: 'onedrive',
    appGroup: 'Microsoft 365',
    appGroupId: 'microsoft365',
    authType: 'OAUTH_ADMIN_CONSENT',
    appDescription: 'Sync files and folders from Microsoft OneDrive',
    appCategories: ['Storage', 'Productivity'],
    iconPath: '/assets/icons/connectors/onedrive.svg',
    supportsRealtime: true,
    schema: {
      redirectUri: `${BASE_REDIRECT_URI}/OneDrive`,
      documentationLinks: [
        {
          title: 'Azure AD App Registration Setup',
          url: 'https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app',
          docType: 'setup',
        },
        {
          title: 'OneDrive API Documentation',
          url: 'https://docs.microsoft.com/en-us/onedrive/developer/',
          docType: 'api',
        },
      ],
      authFields: [
        {
          name: 'clientId',
          displayName: 'Application (Client) ID',
          fieldType: 'TEXT',
          isSecret: false,
          isRequired: true,
          placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          helpText: 'The Application (Client) ID from Azure AD App Registration',
        },
        {
          name: 'clientSecret',
          displayName: 'Client Secret',
          fieldType: 'PASSWORD',
          isSecret: true,
          isRequired: true,
          placeholder: 'Enter your client secret',
          helpText: 'The Client Secret from Azure AD App Registration',
        },
        {
          name: 'tenantId',
          displayName: 'Directory (Tenant) ID',
          fieldType: 'TEXT',
          isSecret: false,
          isRequired: true,
          placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          helpText: 'The Directory (Tenant) ID from Azure AD',
        },
      ],
      syncStrategies: ['WEBHOOK', 'SCHEDULED'],
      filterFields: [],
      oauthUrls: {
        authorizeUrl: 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token',
        scopes: ['Files.Read.All', 'Sites.Read.All', 'offline_access'],
      },
    },
  },
  {
    name: 'SharePoint Online',
    type: 'sharepoint',
    appGroup: 'Microsoft 365',
    appGroupId: 'microsoft365',
    authType: 'OAUTH_ADMIN_CONSENT',
    appDescription: 'Connect to SharePoint Online sites and document libraries',
    appCategories: ['Storage', 'Collaboration'],
    iconPath: '/assets/icons/connectors/sharepoint.svg',
    supportsRealtime: true,
    schema: {
      redirectUri: `${BASE_REDIRECT_URI}/SharePoint`,
      documentationLinks: [
        {
          title: 'Azure AD App Registration Setup',
          url: 'https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app',
          docType: 'setup',
        },
        {
          title: 'SharePoint REST API Reference',
          url: 'https://docs.microsoft.com/en-us/sharepoint/dev/sp-add-ins/get-to-know-the-sharepoint-rest-service',
          docType: 'api',
        },
      ],
      authFields: [
        {
          name: 'clientId',
          displayName: 'Application (Client) ID',
          fieldType: 'TEXT',
          isSecret: false,
          isRequired: true,
          placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          helpText: 'The Application (Client) ID from Azure AD App Registration',
        },
        {
          name: 'clientSecret',
          displayName: 'Client Secret',
          fieldType: 'PASSWORD',
          isSecret: true,
          isRequired: true,
          placeholder: 'Enter your client secret',
          helpText: 'The Client Secret from Azure AD App Registration',
        },
        {
          name: 'tenantId',
          displayName: 'Directory (Tenant) ID',
          fieldType: 'TEXT',
          isSecret: false,
          isRequired: true,
          placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          helpText: 'The Directory (Tenant) ID from Azure AD',
        },
      ],
      syncStrategies: ['WEBHOOK', 'SCHEDULED'],
      filterFields: [],
      oauthUrls: {
        authorizeUrl: 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token',
        scopes: ['Sites.Read.All', 'Files.Read.All', 'offline_access'],
      },
    },
  },
  {
    name: 'Outlook',
    type: 'outlook',
    appGroup: 'Microsoft 365',
    appGroupId: 'microsoft365',
    authType: 'OAUTH_ADMIN_CONSENT',
    appDescription: 'Access emails, calendar, and contacts from Outlook',
    appCategories: ['Email', 'Calendar', 'Communication'],
    iconPath: '/assets/icons/connectors/outlook.svg',
    supportsRealtime: true,
    schema: {
      redirectUri: `${BASE_REDIRECT_URI}/Outlook`,
      documentationLinks: [
        {
          title: 'Azure AD App Registration Setup',
          url: 'https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app',
          docType: 'setup',
        },
        {
          title: 'Microsoft Graph Mail API',
          url: 'https://docs.microsoft.com/en-us/graph/api/resources/mail-api-overview',
          docType: 'api',
        },
      ],
      authFields: [
        {
          name: 'clientId',
          displayName: 'Application (Client) ID',
          fieldType: 'TEXT',
          isSecret: false,
          isRequired: true,
          placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          helpText: 'The Application (Client) ID from Azure AD App Registration',
        },
        {
          name: 'clientSecret',
          displayName: 'Client Secret',
          fieldType: 'PASSWORD',
          isSecret: true,
          isRequired: true,
          placeholder: 'Enter your client secret',
          helpText: 'The Client Secret from Azure AD App Registration',
        },
        {
          name: 'tenantId',
          displayName: 'Directory (Tenant) ID',
          fieldType: 'TEXT',
          isSecret: false,
          isRequired: true,
          placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          helpText: 'The Directory (Tenant) ID from Azure AD',
        },
      ],
      syncStrategies: ['WEBHOOK', 'SCHEDULED'],
      filterFields: [],
      oauthUrls: {
        authorizeUrl: 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token',
        scopes: ['Mail.Read', 'Calendars.Read', 'Contacts.Read', 'offline_access'],
      },
    },
  },

  // Atlassian Connectors
  {
    name: 'Confluence',
    type: 'confluence',
    appGroup: 'Atlassian',
    appGroupId: 'atlassian',
    authType: 'OAUTH',
    appDescription: 'Connect to Confluence Cloud spaces and pages',
    appCategories: ['Documentation', 'Collaboration'],
    iconPath: '/assets/icons/connectors/confluence.svg',
    supportsRealtime: false,
    schema: {
      redirectUri: `${BASE_REDIRECT_URI}/Confluence`,
      documentationLinks: [
        {
          title: 'Atlassian OAuth 2.0 Setup',
          url: 'https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/',
          docType: 'setup',
        },
        {
          title: 'Confluence REST API',
          url: 'https://developer.atlassian.com/cloud/confluence/rest/v2/intro/',
          docType: 'api',
        },
      ],
      authFields: [
        {
          name: 'clientId',
          displayName: 'Client ID',
          fieldType: 'TEXT',
          isSecret: false,
          isRequired: true,
          placeholder: 'Enter your Atlassian Client ID',
          helpText: 'The Client ID from your Atlassian Developer Console',
        },
        {
          name: 'clientSecret',
          displayName: 'Client Secret',
          fieldType: 'PASSWORD',
          isSecret: true,
          isRequired: true,
          placeholder: 'Enter your client secret',
          helpText: 'The Client Secret from your Atlassian Developer Console',
        },
      ],
      syncStrategies: ['SCHEDULED', 'MANUAL'],
      filterFields: [],
      oauthUrls: {
        authorizeUrl: 'https://auth.atlassian.com/authorize',
        tokenUrl: 'https://auth.atlassian.com/oauth/token',
        scopes: ['read:confluence-content.all', 'read:confluence-space.summary', 'offline_access'],
      },
    },
  },
  {
    name: 'Jira',
    type: 'jira',
    appGroup: 'Atlassian',
    appGroupId: 'atlassian',
    authType: 'OAUTH',
    appDescription: 'Connect to Jira Cloud projects, issues, and boards',
    appCategories: ['Project Management', 'Issue Tracking'],
    iconPath: '/assets/icons/connectors/jira.svg',
    supportsRealtime: false,
    schema: {
      redirectUri: `${BASE_REDIRECT_URI}/Jira`,
      documentationLinks: [
        {
          title: 'Atlassian OAuth 2.0 Setup',
          url: 'https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/',
          docType: 'setup',
        },
        {
          title: 'Jira REST API',
          url: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/',
          docType: 'api',
        },
      ],
      authFields: [
        {
          name: 'clientId',
          displayName: 'Client ID',
          fieldType: 'TEXT',
          isSecret: false,
          isRequired: true,
          placeholder: 'Enter your Atlassian Client ID',
          helpText: 'The Client ID from your Atlassian Developer Console',
        },
        {
          name: 'clientSecret',
          displayName: 'Client Secret',
          fieldType: 'PASSWORD',
          isSecret: true,
          isRequired: true,
          placeholder: 'Enter your client secret',
          helpText: 'The Client Secret from your Atlassian Developer Console',
        },
      ],
      syncStrategies: ['SCHEDULED', 'MANUAL'],
      filterFields: [],
      oauthUrls: {
        authorizeUrl: 'https://auth.atlassian.com/authorize',
        tokenUrl: 'https://auth.atlassian.com/oauth/token',
        scopes: ['read:jira-work', 'read:jira-user', 'offline_access'],
      },
    },
  },

  // Cloud Storage
  {
    name: 'Dropbox',
    type: 'dropbox',
    appGroup: 'Cloud Storage',
    appGroupId: 'cloudstorage',
    authType: 'OAUTH',
    appDescription: 'Sync files and folders from Dropbox',
    appCategories: ['Storage'],
    iconPath: '/assets/icons/connectors/dropbox.svg',
    supportsRealtime: true,
    schema: {
      redirectUri: `${BASE_REDIRECT_URI}/Dropbox`,
      documentationLinks: [
        {
          title: 'Dropbox App Console Setup',
          url: 'https://www.dropbox.com/developers/apps/create',
          docType: 'setup',
        },
        {
          title: 'Dropbox API Documentation',
          url: 'https://www.dropbox.com/developers/documentation/http/documentation',
          docType: 'api',
        },
      ],
      authFields: [
        {
          name: 'clientId',
          displayName: 'App Key',
          fieldType: 'TEXT',
          isSecret: false,
          isRequired: true,
          placeholder: 'Enter your Dropbox App Key',
          helpText: 'The App Key from your Dropbox App Console',
        },
        {
          name: 'clientSecret',
          displayName: 'App Secret',
          fieldType: 'PASSWORD',
          isSecret: true,
          isRequired: true,
          placeholder: 'Enter your app secret',
          helpText: 'The App Secret from your Dropbox App Console',
        },
      ],
      syncStrategies: ['WEBHOOK', 'SCHEDULED'],
      filterFields: [],
      oauthUrls: {
        authorizeUrl: 'https://www.dropbox.com/oauth2/authorize',
        tokenUrl: 'https://api.dropbox.com/oauth2/token',
        scopes: ['files.content.read', 'files.metadata.read'],
      },
    },
  },

  // ServiceNow
  {
    name: 'ServiceNow',
    type: 'servicenow',
    appGroup: 'ServiceNow',
    appGroupId: 'servicenow',
    authType: 'OAUTH',
    appDescription: 'Connect to ServiceNow instances for ITSM data',
    appCategories: ['ITSM', 'Enterprise'],
    iconPath: '/assets/icons/connectors/servicenow.svg',
    supportsRealtime: false,
    schema: {
      redirectUri: `${BASE_REDIRECT_URI}/ServiceNow`,
      documentationLinks: [
        {
          title: 'ServiceNow OAuth Setup',
          url: 'https://docs.servicenow.com/bundle/utah-platform-administration/page/administer/security/concept/c_OAuthApplications.html',
          docType: 'setup',
        },
        {
          title: 'ServiceNow REST API',
          url: 'https://developer.servicenow.com/dev.do#!/reference/api/utah/rest/',
          docType: 'api',
        },
      ],
      authFields: [
        {
          name: 'instanceUrl',
          displayName: 'Instance URL',
          fieldType: 'URL',
          isSecret: false,
          isRequired: true,
          placeholder: 'https://your-instance.service-now.com',
          helpText: 'Your ServiceNow instance URL',
        },
        {
          name: 'clientId',
          displayName: 'Client ID',
          fieldType: 'TEXT',
          isSecret: false,
          isRequired: true,
          placeholder: 'Enter your Client ID',
          helpText: 'The Client ID from your ServiceNow OAuth Application',
        },
        {
          name: 'clientSecret',
          displayName: 'Client Secret',
          fieldType: 'PASSWORD',
          isSecret: true,
          isRequired: true,
          placeholder: 'Enter your client secret',
          helpText: 'The Client Secret from your ServiceNow OAuth Application',
        },
      ],
      syncStrategies: ['SCHEDULED', 'MANUAL'],
      filterFields: [],
      oauthUrls: {
        authorizeUrl: '{instanceUrl}/oauth_auth.do',
        tokenUrl: '{instanceUrl}/oauth_token.do',
        scopes: ['useraccount'],
      },
    },
  },

  // Web Connector
  {
    name: 'Web',
    type: 'web',
    appGroup: 'Web',
    appGroupId: 'web',
    authType: 'NONE',
    appDescription: 'Crawl and index web pages and sitemaps',
    appCategories: ['Web'],
    iconPath: '/assets/icons/connectors/web.svg',
    supportsRealtime: false,
    schema: {
      documentationLinks: [
        {
          title: 'Web Connector Configuration',
          url: '#',
          docType: 'connector',
        },
      ],
      authFields: [
        {
          name: 'seedUrls',
          displayName: 'Seed URLs',
          fieldType: 'TEXTAREA',
          isSecret: false,
          isRequired: true,
          placeholder: 'https://example.com\nhttps://example.com/docs',
          helpText: 'Enter one URL per line to start crawling from',
        },
        {
          name: 'maxDepth',
          displayName: 'Max Crawl Depth',
          fieldType: 'TEXT',
          isSecret: false,
          isRequired: false,
          placeholder: '3',
          helpText: 'Maximum number of links to follow from seed URLs',
        },
      ],
      syncStrategies: ['SCHEDULED', 'MANUAL'],
      filterFields: [],
    },
  },

  // Google
  {
    name: 'Google Drive',
    type: 'googledrive',
    appGroup: 'Google',
    appGroupId: 'google',
    authType: 'OAUTH',
    appDescription: 'Sync files and folders from Google Drive',
    appCategories: ['Storage', 'Productivity'],
    iconPath: '/assets/icons/connectors/google-drive.svg',
    supportsRealtime: true,
    schema: {
      redirectUri: `${BASE_REDIRECT_URI}/GoogleDrive`,
      documentationLinks: [
        {
          title: 'Google Cloud Console Setup',
          url: 'https://console.cloud.google.com/apis/credentials',
          docType: 'setup',
        },
        {
          title: 'Google Drive API',
          url: 'https://developers.google.com/drive/api/guides/about-sdk',
          docType: 'api',
        },
      ],
      authFields: [
        {
          name: 'clientId',
          displayName: 'Client ID',
          fieldType: 'TEXT',
          isSecret: false,
          isRequired: true,
          placeholder: 'xxxxx.apps.googleusercontent.com',
          helpText: 'The Client ID from Google Cloud Console',
        },
        {
          name: 'clientSecret',
          displayName: 'Client Secret',
          fieldType: 'PASSWORD',
          isSecret: true,
          isRequired: true,
          placeholder: 'Enter your client secret',
          helpText: 'The Client Secret from Google Cloud Console',
        },
      ],
      syncStrategies: ['WEBHOOK', 'SCHEDULED'],
      filterFields: [],
      oauthUrls: {
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      },
    },
  },

  // Communication
  {
    name: 'Slack',
    type: 'slack',
    appGroup: 'Communication',
    appGroupId: 'communication',
    authType: 'OAUTH',
    appDescription: 'Connect to Slack workspaces, channels, and messages',
    appCategories: ['Communication', 'Collaboration'],
    iconPath: '/assets/icons/connectors/slack.svg',
    supportsRealtime: true,
    schema: {
      redirectUri: `${BASE_REDIRECT_URI}/Slack`,
      documentationLinks: [
        {
          title: 'Slack App Creation',
          url: 'https://api.slack.com/apps',
          docType: 'setup',
        },
        {
          title: 'Slack Web API',
          url: 'https://api.slack.com/web',
          docType: 'api',
        },
      ],
      authFields: [
        {
          name: 'clientId',
          displayName: 'Client ID',
          fieldType: 'TEXT',
          isSecret: false,
          isRequired: true,
          placeholder: 'Enter your Slack Client ID',
          helpText: 'The Client ID from your Slack App',
        },
        {
          name: 'clientSecret',
          displayName: 'Client Secret',
          fieldType: 'PASSWORD',
          isSecret: true,
          isRequired: true,
          placeholder: 'Enter your client secret',
          helpText: 'The Client Secret from your Slack App',
        },
      ],
      syncStrategies: ['REALTIME', 'SCHEDULED'],
      filterFields: [],
      oauthUrls: {
        authorizeUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        scopes: ['channels:read', 'channels:history', 'users:read'],
      },
    },
  },

  // CRM
  {
    name: 'Salesforce',
    type: 'salesforce',
    appGroup: 'CRM',
    appGroupId: 'crm',
    authType: 'OAUTH',
    appDescription: 'Connect to Salesforce CRM for accounts, contacts, and opportunities',
    appCategories: ['CRM', 'Sales'],
    iconPath: '/assets/icons/connectors/salesforce.svg',
    supportsRealtime: false,
    schema: {
      redirectUri: `${BASE_REDIRECT_URI}/Salesforce`,
      documentationLinks: [
        {
          title: 'Salesforce Connected App Setup',
          url: 'https://help.salesforce.com/s/articleView?id=sf.connected_app_create.htm',
          docType: 'setup',
        },
        {
          title: 'Salesforce REST API',
          url: 'https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/',
          docType: 'api',
        },
      ],
      authFields: [
        {
          name: 'clientId',
          displayName: 'Consumer Key',
          fieldType: 'TEXT',
          isSecret: false,
          isRequired: true,
          placeholder: 'Enter your Consumer Key',
          helpText: 'The Consumer Key from your Salesforce Connected App',
        },
        {
          name: 'clientSecret',
          displayName: 'Consumer Secret',
          fieldType: 'PASSWORD',
          isSecret: true,
          isRequired: true,
          placeholder: 'Enter your consumer secret',
          helpText: 'The Consumer Secret from your Salesforce Connected App',
        },
        {
          name: 'instanceUrl',
          displayName: 'Instance URL',
          fieldType: 'URL',
          isSecret: false,
          isRequired: false,
          placeholder: 'https://yourorg.my.salesforce.com',
          helpText: 'Your Salesforce instance URL (optional, will be determined during OAuth)',
        },
      ],
      syncStrategies: ['SCHEDULED', 'MANUAL'],
      filterFields: [],
      oauthUrls: {
        authorizeUrl: 'https://login.salesforce.com/services/oauth2/authorize',
        tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
        scopes: ['api', 'refresh_token', 'offline_access'],
      },
    },
  },
];

// Helper function to get connector definition by name
export function getConnectorDefinition(name: string): ConnectorDefinition | undefined {
  return CONNECTOR_DEFINITIONS.find(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  );
}

// Helper function to get connectors by app group
export function getConnectorsByAppGroup(appGroup: string): ConnectorDefinition[] {
  return CONNECTOR_DEFINITIONS.filter(
    (c) => c.appGroup.toLowerCase() === appGroup.toLowerCase()
  );
}

// Helper function to get all app groups
export function getAppGroups(): string[] {
  return [...new Set(CONNECTOR_DEFINITIONS.map((c) => c.appGroup))];
}
