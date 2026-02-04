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
  const tokenUrl = `${instance.baseUrl}/oauth/token`;

  const box = `
${chalk.green.bold('✅ Mock Server Ready!')}

${chalk.cyan('┌' + '─'.repeat(65) + '┐')}
${chalk.cyan('│')} ${chalk.bold('COPY THESE CREDENTIALS INTO CLAUDE COWORK / PIPESHUB')}${' '.repeat(10)}${chalk.cyan('│')}
${chalk.cyan('├' + '─'.repeat(65) + '┤')}
${chalk.cyan('│')} URL:           ${chalk.yellow((instance.baseUrl || 'N/A').padEnd(47))}${chalk.cyan('│')}
${chalk.cyan('│')} Auth Type:     ${chalk.white('OAuth 2.0'.padEnd(47))}${chalk.cyan('│')}
${chalk.cyan('│')} Client ID:     ${chalk.white(clientId.padEnd(47))}${chalk.cyan('│')}
${chalk.cyan('│')} Client Secret: ${chalk.white(clientSecret.padEnd(47))}${chalk.cyan('│')}
${chalk.cyan('│')} Token URL:     ${chalk.white(tokenUrl.substring(0, 47).padEnd(47))}${chalk.cyan('│')}
${chalk.cyan('└' + '─'.repeat(65) + '┘')}
`;

  return box;
}

export function formatSSLInstructions(domain: string): string {
  return `
${chalk.yellow.bold('⚠️  SSL Setup Required (run once):')}
    ${chalk.gray('sudo sh -c \'echo "127.0.0.1  ' + domain + '" >> /etc/hosts\'')}

${chalk.gray('Then verify with:')}
    ${chalk.gray('ping ' + domain)}
`;
}
