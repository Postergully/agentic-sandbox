import chalk from 'chalk';
import { MockServerInstance } from '../../types';

export function formatInstanceTable(instances: MockServerInstance[]): string {
  if (instances.length === 0) {
    return chalk.yellow('No instances found.');
  }

  const header = [
    chalk.bold('ID'.padEnd(30)),
    chalk.bold('Connector'.padEnd(12)),
    chalk.bold('Org'.padEnd(15)),
    chalk.bold('Status'.padEnd(10)),
    chalk.bold('URL'),
  ].join(' | ');

  const separator = '-'.repeat(100);

  const rows = instances.map((inst) => {
    const statusColor =
      inst.status === 'active' ? chalk.green :
      inst.status === 'error' ? chalk.red :
      inst.status === 'creating' ? chalk.yellow :
      chalk.gray;

    return [
      inst.instanceId.padEnd(30),
      inst.connector.padEnd(12),
      inst.orgId.padEnd(15),
      statusColor(inst.status.padEnd(10)),
      inst.baseUrl || chalk.gray('(not configured)'),
    ].join(' | ');
  });

  return [header, separator, ...rows].join('\n');
}

export function formatCredentialsBox(instance: MockServerInstance): string {
  const mockCreds = instance.mockCredentials as {
    clientId?: string;
    clientSecret?: string;
  } | undefined;

  const clientId = mockCreds?.clientId || `mock-client-${instance.orgId}-${instance.connector}`;
  const clientSecret = mockCreds?.clientSecret || `mock-secret-${Date.now().toString(36)}`;
  const baseUrl = instance.baseUrl || 'https://localhost';
  const tokenUrl = `${baseUrl}/oauth/token`;
  const mcpUrl = `${baseUrl}/mcp`;

  const box = `
${chalk.green.bold('✅ Mock Server Instance Created!')}

${chalk.cyan('┌' + '─'.repeat(70) + '┐')}
${chalk.cyan('│')} ${chalk.bold.yellow('OPTION 1: REST API')} ${chalk.gray('(Direct API access)')}${' '.repeat(35)}${chalk.cyan('│')}
${chalk.cyan('├' + '─'.repeat(70) + '┤')}
${chalk.cyan('│')} Base URL:      ${chalk.white(baseUrl.padEnd(52))}${chalk.cyan('│')}
${chalk.cyan('│')} Auth Type:     ${chalk.white('OAuth 2.0'.padEnd(52))}${chalk.cyan('│')}
${chalk.cyan('│')} Client ID:     ${chalk.white(clientId.padEnd(52))}${chalk.cyan('│')}
${chalk.cyan('│')} Client Secret: ${chalk.white(clientSecret.padEnd(52))}${chalk.cyan('│')}
${chalk.cyan('│')} Token URL:     ${chalk.white(tokenUrl.substring(0, 52).padEnd(52))}${chalk.cyan('│')}
${chalk.cyan('├' + '─'.repeat(70) + '┤')}
${chalk.cyan('│')} ${chalk.bold.yellow('OPTION 2: MCP Server')} ${chalk.gray('(Claude Cowork / Claude Desktop)')}${' '.repeat(17)}${chalk.cyan('│')}
${chalk.cyan('├' + '─'.repeat(70) + '┤')}
${chalk.cyan('│')} MCP URL:       ${chalk.white(mcpUrl.padEnd(52))}${chalk.cyan('│')}
${chalk.cyan('│')} Type:          ${chalk.white('http'.padEnd(52))}${chalk.cyan('│')}
${chalk.cyan('└' + '─'.repeat(70) + '┘')}
`;

  return box;
}

export function formatSSLInstructions(domain: string): string {
  return `
${chalk.yellow.bold('━━━ SETUP INSTRUCTIONS ━━━')}

${chalk.bold('1. Add to /etc/hosts')} ${chalk.gray('(one-time, if not already done):')}
   ${chalk.cyan('sudo sh -c \'echo "127.0.0.1  ' + domain + '" >> /etc/hosts\'')}

${chalk.bold('2. Start HTTPS Server')} ${chalk.gray('(requires sudo for port 443):')}
   ${chalk.cyan('sudo PORT=3002 HTTPS_PORT=443 npx ts-node src/index.ts')}

${chalk.bold('3. Verify connection:')}
   ${chalk.cyan('curl -k https://' + domain + '/health')}

${chalk.gray('For MCP (Claude Cowork), also verify:')}
   ${chalk.cyan('curl -k https://' + domain + '/mcp')}
`;
}

export function formatQuickStart(domain: string): string {
  return `
${chalk.bold.green('Quick Start Commands:')}
${chalk.gray('─'.repeat(50))}
${chalk.white('# Start server (copy & run):')}
${chalk.cyan(`sudo PORT=3002 HTTPS_PORT=443 npx ts-node src/index.ts`)}

${chalk.white('# Test connection:')}
${chalk.cyan(`curl -k https://${domain}/health`)}
`;
}
