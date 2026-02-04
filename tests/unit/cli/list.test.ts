// Mock chalk to avoid ESM issues with Jest
jest.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    gray: (s: string) => s,
    cyan: (s: string) => s,
    white: (s: string) => s,
  },
  bold: (s: string) => s,
  green: Object.assign((s: string) => s, { bold: (s: string) => s }),
  red: (s: string) => s,
  yellow: Object.assign((s: string) => s, { bold: (s: string) => s }),
  gray: (s: string) => s,
  cyan: (s: string) => s,
  white: (s: string) => s,
}));

import { formatInstanceTable } from '../../../src/cli/utils/formatters';
import { MockServerInstance } from '../../../src/types';

describe('list command', () => {
  it('should format instances as a table', () => {
    const instances: Partial<MockServerInstance>[] = [
      {
        instanceId: 'netsuite_sharechat_331',
        connector: 'netsuite',
        orgId: 'sharechat',
        status: 'active',
        baseUrl: 'https://sharechat.suitetalk.api.netsuite.com',
        pgSchema: 'netsuite_sharechat_331',
      },
    ];

    const output = formatInstanceTable(instances as MockServerInstance[]);
    expect(output).toContain('netsuite_sharechat_331');
    expect(output).toContain('active');
  });

  it('should show message when no instances', () => {
    const output = formatInstanceTable([]);
    expect(output).toContain('No instances found');
  });
});
