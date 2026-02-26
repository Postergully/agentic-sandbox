import * as readline from 'readline';

// Mock ESM-only dependencies that Jest can't handle
jest.mock('chalk', () => ({
  __esModule: true,
  default: Object.assign((s: string) => s, {
    red: (s: string) => s,
    green: (s: string) => s,
    cyan: Object.assign((s: string) => s, { bold: (s: string) => s }),
    gray: (s: string) => s,
    white: (s: string) => s,
    yellow: (s: string) => s,
  }),
}));

jest.mock('ora', () => ({
  __esModule: true,
  default: () => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    text: '',
  }),
}));

jest.mock('../../../src/services/registryService', () => ({
  registryService: { get: jest.fn() },
}));

jest.mock('../../../src/services/factoryPipelineService', () => ({
  factoryPipelineService: { execute: jest.fn() },
}));

import { shouldPrompt, askQuestion, promptForMissingOptions } from '../../../src/cli/commands/create';

describe('create command', () => {
  it('should generate valid instance ID', () => {
    const generateInstanceId = (connector: string, orgId: string, jobId?: string): string => {
      const safeConnector = connector.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const safeOrgId = orgId.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const safeJobId = jobId || Math.random().toString(36).substring(2, 10);
      return `${safeConnector}_${safeOrgId}_${safeJobId}`;
    };

    const id = generateInstanceId('netsuite', 'sharechat', '331');
    expect(id).toBe('netsuite_sharechat_331');
  });

  it('should sanitize special characters in instance ID', () => {
    const generateInstanceId = (connector: string, orgId: string, jobId?: string): string => {
      const safeConnector = connector.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const safeOrgId = orgId.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const safeJobId = jobId ? jobId.replace(/[^a-z0-9]/g, '_') : 'auto';
      return `${safeConnector}_${safeOrgId}_${safeJobId}`;
    };

    const id = generateInstanceId('Net-Suite', 'Share Chat!', 'job-123');
    expect(id).toBe('net_suite_share_chat__job_123');
  });
});

describe('shouldPrompt', () => {
  const originalIsTTY = process.stdin.isTTY;

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, writable: true });
  });

  it('should return true when TTY and no --json flag', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
    expect(shouldPrompt({ json: false })).toBe(true);
    expect(shouldPrompt({})).toBe(true);
  });

  it('should return false when --json flag is set', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
    expect(shouldPrompt({ json: true })).toBe(false);
  });

  it('should return false when not a TTY', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, writable: true });
    expect(shouldPrompt({})).toBe(false);
  });
});

describe('askQuestion', () => {
  it('should return user input', async () => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    jest.spyOn(rl, 'question').mockImplementation((_q: string, cb: any) => {
      cb('custom_value');
      return rl;
    });
    const result = await askQuestion(rl, 'Test?', 'default');
    expect(result).toBe('custom_value');
    rl.close();
  });

  it('should return default when user presses enter', async () => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    jest.spyOn(rl, 'question').mockImplementation((_q: string, cb: any) => {
      cb('');
      return rl;
    });
    const result = await askQuestion(rl, 'Test?', 'default');
    expect(result).toBe('default');
    rl.close();
  });
});
