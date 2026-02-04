/**
 * SSL/DNS Configuration Service
 *
 * Service for auto-configuring SSL certificates and DNS entries (Module 6 in task-progress.md).
 * Enables real AI agents (Claude Cowork, PipesHub) to connect to mock servers
 * by generating valid-looking URLs that resolve to localhost.
 *
 * Problem Solved:
 *   Real AI agents validate connector URLs:
 *   - Snowflake expects: https://orgname-accountname.snowflakecomputing.com
 *   - NetSuite expects: https://accountid.suitetalk.api.netsuite.com
 *
 * Auto-Setup Steps:
 *   1. Generate mock domain based on connector URL format
 *   2. Add /etc/hosts entry (requires sudo prompt)
 *   3. Generate self-signed certificate using mkcert
 *   4. Configure Express HTTPS server
 *   5. Store SSL config in registry
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface SSLConfig {
  /** Generated mock domain (e.g., mockorg-mockaccount.snowflakecomputing.com) */
  domain: string;
  /** Local IP to resolve to */
  localIp: string;
  /** HTTPS port */
  port: number;
  /** Path to SSL certificate */
  certPath: string;
  /** Path to private key */
  keyPath: string;
  /** Whether /etc/hosts entry was added */
  hostsEntryAdded: boolean;
  /** Full mock URL for AI agents */
  mockUrl: string;
  /** Whether certificates were generated */
  certsGenerated: boolean;
}

export interface DomainGeneratorOptions {
  /** Connector type (snowflake, netsuite, etc.) */
  connector: string;
  /** Organization ID */
  orgId: string;
  /** Account ID (optional, auto-generated if not provided) */
  accountId?: string;
}

export interface SSLSetupOptions {
  /** Instance ID */
  instanceId: string;
  /** Connector type */
  connector: string;
  /** Organization ID */
  orgId: string;
  /** Custom domain (overrides auto-generation) */
  customDomain?: string;
  /** Port for HTTPS (default: 443) */
  port?: number;
  /** Directory to store certificates */
  certsDir?: string;
  /** Skip /etc/hosts modification */
  skipHosts?: boolean;
  /** Skip certificate generation */
  skipCerts?: boolean;
}

export interface SSLSetupResult {
  success: boolean;
  config?: SSLConfig;
  error?: string;
  warnings: string[];
}

// ============================================================================
// Domain URL Patterns per Connector
// ============================================================================

const CONNECTOR_URL_PATTERNS: Record<string, (orgId: string, accountId: string) => string> = {
  snowflake: (orgId, accountId) => `${orgId}-${accountId}.snowflakecomputing.com`,
  netsuite: (orgId, _accountId) => `${orgId}.suitetalk.api.netsuite.com`,
  salesforce: (orgId, _accountId) => `${orgId}.my.salesforce.com`,
  hubspot: (_orgId, _accountId) => `api.hubapi.com`,
  google_workspace: (_orgId, _accountId) => `www.googleapis.com`,
  slack: (_orgId, _accountId) => `slack.com`,
  databricks: (orgId, _accountId) => `${orgId}.cloud.databricks.com`,
  bigquery: (_orgId, _accountId) => `bigquery.googleapis.com`,
};

// ============================================================================
// Service Class
// ============================================================================

class SSLDnsService {
  private defaultCertsDir: string;

  constructor() {
    this.defaultCertsDir = path.join(process.cwd(), 'certs');
  }

  /**
   * Generate mock domain for a connector
   */
  generateDomain(options: DomainGeneratorOptions): string {
    const { connector, orgId, accountId } = options;
    const safeOrgId = orgId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const safeAccountId = (accountId || 'mockaccount').toLowerCase().replace(/[^a-z0-9]/g, '');

    const pattern = CONNECTOR_URL_PATTERNS[connector.toLowerCase()];
    if (pattern) {
      return pattern(safeOrgId, safeAccountId);
    }

    // Default pattern for unknown connectors
    return `${safeOrgId}.mock.${connector.toLowerCase()}.local`;
  }

  /**
   * Full SSL/DNS setup for an instance
   */
  async setupSSL(options: SSLSetupOptions): Promise<SSLSetupResult> {
    const warnings: string[] = [];

    try {
      const {
        instanceId,
        connector,
        orgId,
        customDomain,
        port = 443,
        certsDir = this.defaultCertsDir,
        skipHosts = false,
        skipCerts = false,
      } = options;

      logger.info(`SSLDns: Setting up SSL for instance ${instanceId}`);

      // Step 1: Generate or use custom domain
      const domain = customDomain || this.generateDomain({ connector, orgId });
      logger.info(`SSLDns: Using domain ${domain}`);

      // Step 2: Ensure certs directory exists
      if (!fs.existsSync(certsDir)) {
        fs.mkdirSync(certsDir, { recursive: true });
      }

      const certPath = path.join(certsDir, `${instanceId}.pem`);
      const keyPath = path.join(certsDir, `${instanceId}-key.pem`);

      let hostsEntryAdded = false;
      let certsGenerated = false;

      // Step 3: Add /etc/hosts entry
      if (!skipHosts) {
        const hostsResult = await this.addHostsEntry(domain);
        hostsEntryAdded = hostsResult.success;
        if (!hostsResult.success) {
          warnings.push(`Failed to add hosts entry: ${hostsResult.error}. Manual setup required.`);
        }
      } else {
        warnings.push('Skipped /etc/hosts modification');
      }

      // Step 4: Generate SSL certificates
      if (!skipCerts) {
        const certsResult = await this.generateCertificates(domain, certPath, keyPath);
        certsGenerated = certsResult.success;
        if (!certsResult.success) {
          warnings.push(`Failed to generate certificates: ${certsResult.error}. Manual setup required.`);
        }
      } else {
        warnings.push('Skipped certificate generation');
      }

      const mockUrl = `https://${domain}${port !== 443 ? ':' + port : ''}`;

      const config: SSLConfig = {
        domain,
        localIp: '127.0.0.1',
        port,
        certPath,
        keyPath,
        hostsEntryAdded,
        mockUrl,
        certsGenerated,
      };

      logger.info(`SSLDns: Setup complete for ${instanceId}. Mock URL: ${mockUrl}`);

      return {
        success: true,
        config,
        warnings,
      };
    } catch (error) {
      logger.error('SSLDns: Setup failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        warnings,
      };
    }
  }

  /**
   * Add entry to /etc/hosts file
   *
   * NOTE: Requires sudo privileges. In production, this would prompt user
   * or use a privileged helper process.
   */
  async addHostsEntry(
    domain: string,
    ip: string = '127.0.0.1'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if entry already exists
      const hostsContent = fs.readFileSync('/etc/hosts', 'utf8');
      if (hostsContent.includes(domain)) {
        logger.info(`SSLDns: Hosts entry for ${domain} already exists`);
        return { success: true };
      }

      // In a real implementation, this would use sudo or a privileged helper
      // For now, we'll log instructions and return a warning
      logger.warn(
        `SSLDns: Manual hosts entry required. Add to /etc/hosts:\n${ip}\t${domain}`
      );

      // Attempt to add (will fail without sudo in most cases)
      // This is intentionally non-destructive - it will fail gracefully
      try {
        const entry = `\n${ip}\t${domain}\t# Mock server for Agentic Sandbox`;
        await execAsync(`echo '${entry}' | sudo tee -a /etc/hosts`);
        logger.info(`SSLDns: Added hosts entry for ${domain}`);
        return { success: true };
      } catch {
        return {
          success: false,
          error: `Manual setup required. Add to /etc/hosts: ${ip}\t${domain}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read /etc/hosts',
      };
    }
  }

  /**
   * Remove entry from /etc/hosts file
   */
  async removeHostsEntry(domain: string): Promise<{ success: boolean; error?: string }> {
    try {
      logger.warn(
        `SSLDns: Manual hosts entry removal required. Remove line containing: ${domain}`
      );

      // In production, this would use sudo or privileged helper
      return {
        success: false,
        error: `Manual removal required. Remove line containing ${domain} from /etc/hosts`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate self-signed SSL certificates using mkcert
   *
   * Requires mkcert to be installed: https://github.com/FiloSottile/mkcert
   * Install with: brew install mkcert && mkcert -install
   */
  async generateCertificates(
    domain: string,
    certPath: string,
    keyPath: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if mkcert is available
      try {
        await execAsync('which mkcert');
      } catch {
        return {
          success: false,
          error: 'mkcert not found. Install with: brew install mkcert && mkcert -install',
        };
      }

      // Check if certificates already exist
      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        logger.info(`SSLDns: Certificates already exist for ${domain}`);
        return { success: true };
      }

      // Ensure directory exists
      const certDir = path.dirname(certPath);
      if (!fs.existsSync(certDir)) {
        fs.mkdirSync(certDir, { recursive: true });
      }

      // Generate certificates (JAVA_HOME="" avoids Java keystore issues)
      const { stdout, stderr } = await execAsync(
        `JAVA_HOME="" mkcert -cert-file "${certPath}" -key-file "${keyPath}" "${domain}" localhost 127.0.0.1`
      );

      if (stderr && !stderr.includes('Created')) {
        logger.warn(`SSLDns: mkcert warnings: ${stderr}`);
      }

      logger.info(`SSLDns: Generated certificates for ${domain}`);
      logger.debug(`SSLDns: mkcert output: ${stdout}`);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Certificate generation failed',
      };
    }
  }

  /**
   * Remove SSL certificates
   */
  async removeCertificates(certPath: string, keyPath: string): Promise<void> {
    try {
      if (fs.existsSync(certPath)) {
        fs.unlinkSync(certPath);
        logger.info(`SSLDns: Removed certificate ${certPath}`);
      }
      if (fs.existsSync(keyPath)) {
        fs.unlinkSync(keyPath);
        logger.info(`SSLDns: Removed key ${keyPath}`);
      }
    } catch (error) {
      logger.error('SSLDns: Failed to remove certificates', error);
    }
  }

  /**
   * Check if mkcert is installed and configured
   */
  async checkMkcertInstalled(): Promise<{
    installed: boolean;
    caInstalled: boolean;
    error?: string;
  }> {
    try {
      await execAsync('which mkcert');

      // Check if CA is installed
      const { stdout } = await execAsync('mkcert -CAROOT');
      const caRoot = stdout.trim();
      const caInstalled = fs.existsSync(path.join(caRoot, 'rootCA.pem'));

      return { installed: true, caInstalled };
    } catch {
      return {
        installed: false,
        caInstalled: false,
        error: 'mkcert not found. Install with: brew install mkcert && mkcert -install',
      };
    }
  }

  /**
   * Get setup instructions for manual SSL configuration
   */
  getManualSetupInstructions(domain: string, port: number = 443): string {
    return `
# Manual SSL Setup Instructions for ${domain}

## 1. Install mkcert (if not installed)
brew install mkcert
mkcert -install

## 2. Generate certificates
mkdir -p ./certs
mkcert -cert-file ./certs/${domain}.pem -key-file ./certs/${domain}-key.pem ${domain} localhost 127.0.0.1

## 3. Add hosts entry (requires sudo)
sudo sh -c 'echo "127.0.0.1\\t${domain}" >> /etc/hosts'

## 4. Verify setup
ping ${domain}  # Should resolve to 127.0.0.1
curl -k https://${domain}:${port}/health  # Should connect to mock server

## Mock URL for AI Agents
https://${domain}${port !== 443 ? ':' + port : ''}
`.trim();
  }

  /**
   * Teardown SSL/DNS configuration for an instance
   */
  async teardownSSL(config: SSLConfig): Promise<void> {
    logger.info(`SSLDns: Tearing down SSL for ${config.domain}`);

    // Remove certificates
    await this.removeCertificates(config.certPath, config.keyPath);

    // Note: We don't automatically remove hosts entries for safety
    if (config.hostsEntryAdded) {
      logger.warn(
        `SSLDns: Manual cleanup required. Remove from /etc/hosts: ${config.domain}`
      );
    }
  }

  /**
   * Get SSL configuration for Express HTTPS server
   */
  getExpressSSLOptions(config: SSLConfig): { key: Buffer; cert: Buffer } | null {
    try {
      if (!fs.existsSync(config.certPath) || !fs.existsSync(config.keyPath)) {
        logger.warn('SSLDns: Certificate files not found');
        return null;
      }

      return {
        key: fs.readFileSync(config.keyPath),
        cert: fs.readFileSync(config.certPath),
      };
    } catch (error) {
      logger.error('SSLDns: Failed to read SSL files', error);
      return null;
    }
  }
}

// Export singleton instance
export const sslDnsService = new SSLDnsService();
export default sslDnsService;
