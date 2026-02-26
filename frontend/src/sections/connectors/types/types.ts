// types/types.ts

export type AuthType =
  | 'OAUTH'
  | 'OAUTH_ADMIN_CONSENT'
  | 'API_KEY'
  | 'API_TOKEN'
  | 'BASIC_AUTH'
  | 'NONE';

export type ConnectorStatus = 'active' | 'configured' | 'not_configured';

export type SyncStrategy = 'WEBHOOK' | 'SCHEDULED' | 'MANUAL' | 'REALTIME';

export type DocType = 'setup' | 'api' | 'connector';

export interface Connector {
  _key: string;
  name: string;
  type: string;
  appGroup: string;
  appGroupId: string;
  authType: AuthType;
  appDescription: string;
  appCategories: string[];
  iconPath: string;
  isActive: boolean;
  isConfigured: boolean;
  isAuthenticated: boolean;
  supportsRealtime: boolean;
  createdAtTimestamp: number;
  updatedAtTimestamp: number;
}

// Documentation link for setup guides
export interface DocumentationLink {
  title: string;
  url: string;
  docType: DocType;
}

// OAuth URL configuration
export interface OAuthUrls {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
}

export interface ConnectorConfig {
  authConfig: Record<string, unknown>;
  syncConfig: SyncConfig;
  filterConfig: FilterConfig;
}

export interface SyncConfig {
  supportedStrategies: SyncStrategy[];
  selectedStrategy?: SyncStrategy;
  webhookConfig?: WebhookConfig;
  scheduledConfig?: ScheduledConfig;
}

export interface WebhookConfig {
  webhookUrl: string;
  events: string[];
  verificationToken?: string;
}

export interface ScheduledConfig {
  intervalMinutes?: number;
  cronExpression?: string;
  timezone: string;
}

export interface FilterConfig {
  channels?: string[];
  dateRange?: {
    start: string | null;
    end: string | null;
  };
}

export interface AuthField {
  name: string;
  displayName: string;
  fieldType: 'TEXT' | 'PASSWORD' | 'EMAIL' | 'URL' | 'SELECT' | 'TEXTAREA';
  isSecret: boolean;
  isRequired: boolean;
  placeholder?: string;
  helpText?: string;
  options?: { label: string; value: string }[];
}

export interface FilterField {
  name: string;
  displayName: string;
  fieldType: string;
  isRequired: boolean;
}

export interface ConnectorSchema {
  authFields: AuthField[];
  syncStrategies: SyncStrategy[];
  filterFields: FilterField[];
  documentationLinks?: DocumentationLink[];
  redirectUri?: string;
  oauthUrls?: OAuthUrls;
}

// Extended connector definition for static data
export interface ConnectorDefinition {
  name: string;
  type: string;
  appGroup: string;
  appGroupId: string;
  authType: AuthType;
  appDescription: string;
  appCategories: string[];
  iconPath: string;
  supportsRealtime: boolean;
  schema: ConnectorSchema;
}
