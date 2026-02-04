import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('CLI Integration', () => {
  const CLI = 'npx ts-node src/cli/index.ts';

  it('should show help', async () => {
    const { stdout } = await execAsync(`${CLI} --help`);
    expect(stdout).toContain('mock-factory');
    expect(stdout).toContain('create');
    expect(stdout).toContain('list');
    expect(stdout).toContain('info');
    expect(stdout).toContain('delete');
  }, 30000);

  it('should show version', async () => {
    const { stdout } = await execAsync(`${CLI} --version`);
    expect(stdout.trim()).toBe('1.0.0');
  }, 30000);

  it('should show create command help', async () => {
    const { stdout } = await execAsync(`${CLI} create --help`);
    expect(stdout).toContain('--connector');
    expect(stdout).toContain('--org');
    expect(stdout).toContain('--job');
    expect(stdout).toContain('--skip-ssl');
  }, 30000);

  it('should show list command help', async () => {
    const { stdout } = await execAsync(`${CLI} list --help`);
    expect(stdout).toContain('--connector');
    expect(stdout).toContain('--org');
    expect(stdout).toContain('--status');
    expect(stdout).toContain('--json');
  }, 30000);
});
