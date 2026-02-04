import { Command } from 'commander';

describe('CLI', () => {
  it('should have mock-factory as program name', () => {
    const program = new Command();
    program.name('mock-factory');
    expect(program.name()).toBe('mock-factory');
  });
});
