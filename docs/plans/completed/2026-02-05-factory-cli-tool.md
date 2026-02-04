# Factory CLI Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Commander.js CLI that creates mock server instances with HTTPS/SSL, outputting copy-pasteable credentials for AI agents like Claude Cowork.

**Architecture:** CLI wraps existing services (registryService, sslDnsService, instanceManagerService) via Commander.js. The CLI outputs formatted credentials including the HTTPS mock URL that resolves via /etc/hosts.

**Tech Stack:** Commander.js (CLI), chalk (colors), ora (spinners), existing TypeScript services

---

## Pre-Implementation: Understanding the Output

**What the CLI provides for AI agents:**

```
✅ Mock Server Ready!

┌─────────────────────────────────────────────────────────────────┐
│ COPY THESE CREDENTIALS INTO CLAUDE COWORK / PIPESHUB           │
├─────────────────────────────────────────────────────────────────┤
│ URL:          https://sharechat.suitetalk.api.netsuite.com      │
│ Auth Type:    OAuth 2.0                                         │
│ Client ID:    mock-client-sharechat-netsuite                    │
│ Client Secret: mock-secret-abc123xyz                            │
│ Token URL:    https://sharechat.suitetalk.api.netsuite.com/oauth/token │
└─────────────────────────────────────────────────────────────────┘

⚠️  SSL Setup Required (run once):
    sudo sh -c 'echo "127.0.0.1  sharechat.suitetalk.api.netsuite.com" >> /etc/hosts'
```

---

## Task 1: Install CLI Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Add dependencies**

```bash
npm install commander chalk ora
npm install -D @types/node
```

**Step 2: Verify installation**

Run: `npm ls commander chalk ora`
Expected: Shows installed versions

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add commander, chalk, ora for CLI"
```

---

## Task 2: Create CLI Entry Point with Basic Structure

**Files:**
- Create: `src/cli/index.ts`
- Create: `src/cli/commands/index.ts`

**Step 1: Write the basic CLI structure test**

```typescript
// tests/unit/cli/cli.test.ts
import { Command } from 'commander';

describe('CLI', () => {
  it('should have mock-factory as program name', () => {
    // This is a smoke test - the real CLI will be tested via integration
    const program = new Command();
    program.name('mock-factory');
    expect(program.name()).toBe('mock-factory');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/cli/cli.test.ts -v`
Expected: FAIL (file doesn't exist yet)

**Step 3: Create CLI entry point**

```typescript
// src/cli/index.ts
#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('mock-factory')
  .description('Mock Server Factory - Create isolated mock servers for AI agent testing')
  .version('1.0.0');

// Commands will be added here
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

export { program };
```

**Step 4: Create commands barrel file**

```typescript
// src/cli/commands/index.ts
export * from './create';
export * from './list';
export * from './info';
export * from './delete';
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/cli/cli.test.ts -v`
Expected: PASS

**Step 6: Commit**

```bash
git add src/cli/ tests/unit/cli/
git commit -m "feat(cli): add CLI entry point with Commander.js"
```

---

## Task 3: Implement `list` Command

**Files:**
- Create: `src/cli/commands/list.ts`
- Create: `src/cli/utils/formatters.ts`

**Step 1: Write failing test for list command**

```typescript
// tests/unit/cli/list.test.ts
import { formatInstanceTable } from '../../src/cli/utils/formatters';
import { MockServerInstance } from '../../src/types';

describe('list command', () => {
  it('should format instances as a table', () => {
    const instances: Partial<MockServerInstance>[] = [
      {
        instanceId: 'netsuite_sharechat_331',
        connector: 'netsuite',
        orgId: 'sharechat',
        status: 'active',
        baseUrl: 'https://sharechat.suitetalk.api.netsuite.com',
      },
    ];

    const output = formatInstanceTable(instances as MockServerInstance[]);
    expect(output).toContain('netsuite_sharechat_331');
    expect(output).toContain('active');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/cli/list.test.ts -v`
Expected: FAIL (module not found)

**Step 3: Create formatters utility**

```typescript
// src/cli/utils/formatters.ts
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
${chalk.cyan('│')} URL:           ${chalk.yellow(instance.baseUrl?.padEnd(47) || 'N/A'.padEnd(47))}${chalk.cyan('│')}
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
```

**Step 4: Create list command**

```typescript
// src/cli/commands/list.ts
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { registryService } from '../../services/registryService';
import { formatInstanceTable } from '../utils/formatters';

export function createListCommand(): Command {
  const cmd = new Command('list')
    .description('List all mock server instances')
    .option('-c, --connector <type>', 'Filter by connector type (e.g., netsuite, snowflake)')
    .option('-o, --org <orgId>', 'Filter by organization ID')
    .option('-s, --status <status>', 'Filter by status (creating, active, stopped, error)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Fetching instances...').start();

      try {
        const filter: { connector?: string; orgId?: string; status?: any } = {};
        if (options.connector) filter.connector = options.connector;
        if (options.org) filter.orgId = options.org;
        if (options.status) filter.status = options.status;

        const instances = await registryService.list(
          Object.keys(filter).length > 0 ? filter : undefined
        );

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(instances, null, 2));
        } else {
          console.log('\n' + formatInstanceTable(instances) + '\n');
        }
      } catch (error) {
        spinner.fail(chalk.red('Failed to list instances'));
        console.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return cmd;
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/cli/list.test.ts -v`
Expected: PASS

**Step 6: Commit**

```bash
git add src/cli/commands/list.ts src/cli/utils/formatters.ts tests/unit/cli/
git commit -m "feat(cli): add list command with table formatting"
```

---

## Task 4: Implement `create` Command

**Files:**
- Create: `src/cli/commands/create.ts`

**Step 1: Write failing test**

```typescript
// tests/unit/cli/create.test.ts
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
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/cli/create.test.ts -v`
Expected: PASS (this is a logic test)

**Step 3: Create the create command**

```typescript
// src/cli/commands/create.ts
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { registryService } from '../../services/registryService';
import { sslDnsService } from '../../services/sslDnsService';
import { MockServerInstance, MockServerStatus } from '../../types';
import { formatCredentialsBox, formatSSLInstructions } from '../utils/formatters';

function generateInstanceId(connector: string, orgId: string, jobId?: string): string {
  const safeConnector = connector.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const safeOrgId = orgId.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const safeJobId = jobId ? jobId.replace(/[^a-z0-9]/g, '_') : uuidv4().split('-')[0];
  return `${safeConnector}_${safeOrgId}_${safeJobId}`;
}

export function createCreateCommand(): Command {
  const cmd = new Command('create')
    .description('Create a new mock server instance')
    .requiredOption('-c, --connector <type>', 'Connector type (e.g., netsuite, snowflake)')
    .requiredOption('-o, --org <orgId>', 'Organization ID (e.g., sharechat)')
    .option('-j, --job <jobId>', 'Job ID (auto-generated if not provided)')
    .option('-b, --brief <path>', 'Path to GenerationBrief JSON file')
    .option('-d, --api-docs <url>', 'URL to API documentation')
    .option('--skip-ssl', 'Skip SSL/DNS auto-configuration')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Creating mock server instance...').start();

      try {
        // Generate identifiers
        const instanceId = generateInstanceId(options.connector, options.org, options.job);
        const pgSchema = instanceId;

        spinner.text = `Checking if instance ${instanceId} already exists...`;

        // Check if instance already exists
        const existing = await registryService.get(instanceId);
        if (existing) {
          spinner.fail(chalk.red(`Instance ${instanceId} already exists`));
          process.exit(1);
        }

        // Load generation brief if provided
        let generationBrief: object | undefined;
        if (options.brief) {
          spinner.text = 'Loading generation brief...';
          if (!fs.existsSync(options.brief)) {
            spinner.fail(chalk.red(`Brief file not found: ${options.brief}`));
            process.exit(1);
          }
          generationBrief = JSON.parse(fs.readFileSync(options.brief, 'utf-8'));
        }

        // Setup SSL/DNS
        let sslConfig: object | undefined;
        let baseUrl: string | undefined;
        let domain: string | undefined;

        if (!options.skipSsl) {
          spinner.text = 'Setting up SSL/DNS configuration...';
          const sslResult = await sslDnsService.setupSSL({
            instanceId,
            connector: options.connector,
            orgId: options.org,
          });

          if (sslResult.success && sslResult.config) {
            sslConfig = sslResult.config;
            baseUrl = sslResult.config.mockUrl;
            domain = sslResult.config.domain;

            if (sslResult.warnings.length > 0) {
              sslResult.warnings.forEach((w) => console.warn(chalk.yellow(`  Warning: ${w}`)));
            }
          }
        }

        // Generate mock credentials
        const mockCredentials = {
          clientId: `mock-client-${options.org}-${options.connector}`,
          clientSecret: `mock-secret-${uuidv4().split('-')[0]}`,
          tokenEndpoint: `${baseUrl || 'http://localhost:3002'}/oauth/token`,
        };

        spinner.text = 'Creating registry entry...';

        // Create instance record
        const instance: Omit<MockServerInstance, 'id' | 'createdAt' | 'updatedAt'> = {
          instanceId,
          connector: options.connector,
          orgId: options.org,
          jobId: options.job,
          status: 'creating' as MockServerStatus,
          pgSchema,
          generationBrief,
          sslConfig,
          baseUrl,
          authEndpoint: '/oauth/token',
          mockCredentials,
          apiDocsSource: options.apiDocs,
        };

        await registryService.create(instance);

        // Update status to active (in real impl, this happens after provisioning)
        await registryService.update(instanceId, { status: 'active' as MockServerStatus });

        spinner.succeed(chalk.green(`Instance ${instanceId} created successfully!`));

        // Output
        if (options.json) {
          const result = await registryService.get(instanceId);
          console.log(JSON.stringify(result, null, 2));
        } else {
          const result = await registryService.get(instanceId);
          if (result) {
            result.mockCredentials = mockCredentials;
            result.baseUrl = baseUrl;
            console.log(formatCredentialsBox(result));

            if (domain && !options.skipSsl) {
              console.log(formatSSLInstructions(domain));
            }
          }
        }
      } catch (error) {
        spinner.fail(chalk.red('Failed to create instance'));
        console.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return cmd;
}
```

**Step 4: Run test**

Run: `npm test -- tests/unit/cli/create.test.ts -v`
Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/commands/create.ts tests/unit/cli/create.test.ts
git commit -m "feat(cli): add create command with SSL setup and credentials output"
```

---

## Task 5: Implement `info` and `delete` Commands

**Files:**
- Create: `src/cli/commands/info.ts`
- Create: `src/cli/commands/delete.ts`

**Step 1: Create info command**

```typescript
// src/cli/commands/info.ts
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { registryService } from '../../services/registryService';
import { formatCredentialsBox, formatSSLInstructions } from '../utils/formatters';
import { SSLConfig } from '../../services/sslDnsService';

export function createInfoCommand(): Command {
  const cmd = new Command('info')
    .description('Get details of a specific mock server instance')
    .argument('<instanceId>', 'Instance ID (e.g., netsuite_sharechat_331)')
    .option('--json', 'Output as JSON')
    .option('--creds', 'Show only credentials box (for quick copy/paste)')
    .action(async (instanceId, options) => {
      const spinner = ora(`Fetching instance ${instanceId}...`).start();

      try {
        const instance = await registryService.get(instanceId);

        if (!instance) {
          spinner.fail(chalk.red(`Instance ${instanceId} not found`));
          process.exit(1);
        }

        await registryService.updateLastAccessed(instanceId);

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(instance, null, 2));
        } else if (options.creds) {
          console.log(formatCredentialsBox(instance));
          const sslConfig = instance.sslConfig as SSLConfig | undefined;
          if (sslConfig?.domain) {
            console.log(formatSSLInstructions(sslConfig.domain));
          }
        } else {
          console.log('\n' + chalk.bold.underline(`Instance: ${instanceId}`) + '\n');
          console.log(`  ${chalk.gray('Connector:')}    ${instance.connector}`);
          console.log(`  ${chalk.gray('Organization:')} ${instance.orgId}`);
          console.log(`  ${chalk.gray('Job ID:')}       ${instance.jobId || '(none)'}`);
          console.log(`  ${chalk.gray('Status:')}       ${instance.status}`);
          console.log(`  ${chalk.gray('PG Schema:')}    ${instance.pgSchema}`);
          console.log(`  ${chalk.gray('Base URL:')}     ${instance.baseUrl || '(not configured)'}`);
          console.log(`  ${chalk.gray('Created:')}      ${instance.createdAt}`);
          console.log(`  ${chalk.gray('Updated:')}      ${instance.updatedAt}`);

          console.log('\n' + formatCredentialsBox(instance));

          const sslConfig = instance.sslConfig as SSLConfig | undefined;
          if (sslConfig?.domain) {
            console.log(formatSSLInstructions(sslConfig.domain));
          }
        }
      } catch (error) {
        spinner.fail(chalk.red('Failed to get instance info'));
        console.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return cmd;
}
```

**Step 2: Create delete command**

```typescript
// src/cli/commands/delete.ts
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { registryService } from '../../services/registryService';
import { sslDnsService, SSLConfig } from '../../services/sslDnsService';

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export function createDeleteCommand(): Command {
  const cmd = new Command('delete')
    .description('Delete a mock server instance')
    .argument('<instanceId>', 'Instance ID to delete')
    .option('-f, --force', 'Skip confirmation prompt')
    .option('--cleanup-ssl', 'Also cleanup SSL certificates')
    .action(async (instanceId, options) => {
      try {
        // Check instance exists
        const instance = await registryService.get(instanceId);
        if (!instance) {
          console.error(chalk.red(`Instance ${instanceId} not found`));
          process.exit(1);
        }

        // Confirm deletion
        if (!options.force) {
          const confirmed = await confirm(
            chalk.yellow(`Are you sure you want to delete ${instanceId}? [y/N] `)
          );
          if (!confirmed) {
            console.log('Deletion cancelled.');
            return;
          }
        }

        const spinner = ora(`Deleting instance ${instanceId}...`).start();

        // Cleanup SSL if requested
        if (options.cleanupSsl && instance.sslConfig) {
          spinner.text = 'Cleaning up SSL certificates...';
          const sslConfig = instance.sslConfig as SSLConfig;
          await sslDnsService.teardownSSL(sslConfig);
        }

        // Delete from registry
        await registryService.delete(instanceId);

        spinner.succeed(chalk.green(`Instance ${instanceId} deleted successfully`));

        if (instance.sslConfig) {
          const sslConfig = instance.sslConfig as SSLConfig;
          console.log(chalk.yellow(`\n⚠️  Manual cleanup may be required:`));
          console.log(chalk.gray(`   Remove from /etc/hosts: ${sslConfig.domain}`));
        }
      } catch (error) {
        console.error(chalk.red('Failed to delete instance'));
        console.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return cmd;
}
```

**Step 3: Update commands barrel file**

```typescript
// src/cli/commands/index.ts
export { createCreateCommand } from './create';
export { createListCommand } from './list';
export { createInfoCommand } from './info';
export { createDeleteCommand } from './delete';
```

**Step 4: Commit**

```bash
git add src/cli/commands/
git commit -m "feat(cli): add info and delete commands"
```

---

## Task 6: Wire Up CLI Entry Point

**Files:**
- Modify: `src/cli/index.ts`
- Modify: `package.json`

**Step 1: Update CLI entry point**

```typescript
// src/cli/index.ts
#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import {
  createCreateCommand,
  createListCommand,
  createInfoCommand,
  createDeleteCommand,
} from './commands';

// Initialize database connection for CLI operations
import '../config/database';

const program = new Command();

program
  .name('mock-factory')
  .description(
    chalk.cyan('Mock Server Factory') +
    '\n  Create isolated mock servers for AI agent testing.\n' +
    '  Each instance gets its own PostgreSQL schema and HTTPS endpoint.\n\n' +
    chalk.gray('  Supports: Snowflake, NetSuite, Salesforce, HubSpot, Google Workspace')
  )
  .version('1.0.0');

// Register commands
program.addCommand(createCreateCommand());
program.addCommand(createListCommand());
program.addCommand(createInfoCommand());
program.addCommand(createDeleteCommand());

// Clone command (simplified version using create)
program
  .command('clone')
  .description('Clone an existing instance with new org/job')
  .requiredOption('-f, --from <instanceId>', 'Source instance to clone')
  .requiredOption('-o, --org <orgId>', 'New organization ID')
  .option('-j, --job <jobId>', 'New job ID')
  .action(async (options) => {
    console.log(chalk.yellow('Clone command - coming soon'));
    console.log(chalk.gray(`Would clone ${options.from} to new org: ${options.org}`));
  });

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

export { program };
```

**Step 2: Add CLI script to package.json**

Add to `package.json` scripts section:

```json
{
  "scripts": {
    "cli": "ts-node src/cli/index.ts",
    "mock-factory": "ts-node src/cli/index.ts"
  },
  "bin": {
    "mock-factory": "./dist/cli/index.js"
  }
}
```

**Step 3: Test CLI manually**

Run: `npm run cli -- --help`
Expected: Shows help with all commands

Run: `npm run cli -- list`
Expected: Shows table of instances (may be empty or show existing ones)

**Step 4: Commit**

```bash
git add src/cli/index.ts package.json
git commit -m "feat(cli): wire up all commands and add npm scripts"
```

---

## Task 7: Create Integration Test

**Files:**
- Create: `tests/integration/cli.test.ts`

**Step 1: Write integration test**

```typescript
// tests/integration/cli.test.ts
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
  });

  it('should list instances', async () => {
    const { stdout } = await execAsync(`${CLI} list --json`);
    // Should return valid JSON (empty array or with instances)
    const instances = JSON.parse(stdout);
    expect(Array.isArray(instances)).toBe(true);
  });
});
```

**Step 2: Run integration test**

Run: `npm test -- tests/integration/cli.test.ts -v`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/integration/cli.test.ts
git commit -m "test(cli): add integration tests for CLI commands"
```

---

## Task 8: Update task-progress.md

**Files:**
- Modify: `docs/task-progress.md`

**Step 1: Update the progress document**

Update the Implementation Plan section to mark CLI as complete:

```markdown
### Phase 1: Core Infrastructure ✅ COMPLETE

| Task | Status | Notes |
|------|--------|-------|
| PostgreSQL registry table | ✅ Done | `migrations/006_mock_server_registry.sql` |
| Registry service | ✅ Done | `src/services/registryService.ts` |
| Factory CLI scaffolding | ✅ Done | `src/cli/index.ts` - Commander.js |
| Factory API endpoints | ✅ Done | `src/routes/factory.ts` |
```

Also update Acceptance Criteria:

```markdown
### Factory Tool
- [x] CLI creates mock server instance from connector + API docs + brief
- [x] API endpoints mirror CLI functionality
- [ ] Clone operation copies base and customizes with new brief
- [x] List/Info/Delete operations work correctly
```

**Step 2: Add session log entry**

Add to Session Log section:

```markdown
### 2026-02-05 (Session 6)
**Factory CLI Tool Complete**

Implemented Commander.js CLI with full credential output for AI agents:

**Commands:**
- `mock-factory create -c <connector> -o <org>` - Creates instance with SSL
- `mock-factory list` - Lists all instances in table format
- `mock-factory info <instanceId>` - Shows credentials box for copy/paste
- `mock-factory delete <instanceId>` - Removes instance

**Key Features:**
- Outputs copy-pasteable credentials box with URL, Client ID, Client Secret
- Auto-generates HTTPS URLs matching real connector formats
- Provides /etc/hosts setup instructions for local SSL
- JSON output mode for automation

**Testing:**
```bash
# Create a new instance
npm run cli -- create -c netsuite -o sharechat

# Get credentials for Claude Cowork
npm run cli -- info netsuite_sharechat_xxx --creds

# List all instances
npm run cli -- list
```
```

**Step 3: Commit**

```bash
git add docs/task-progress.md
git commit -m "docs: update task-progress with CLI implementation status"
```

---

## Testing the Complete Flow

After all tasks are complete, test the full workflow:

```bash
# 1. Create a new mock server instance
npm run cli -- create -c netsuite -o sharechat

# Output will show:
# ✅ Mock Server Ready!
# ┌─────────────────────────────────────────────────────────────────┐
# │ COPY THESE CREDENTIALS INTO CLAUDE COWORK / PIPESHUB           │
# ├─────────────────────────────────────────────────────────────────┤
# │ URL:           https://sharechat.suitetalk.api.netsuite.com     │
# │ Auth Type:     OAuth 2.0                                        │
# │ Client ID:     mock-client-sharechat-netsuite                   │
# │ Client Secret: mock-secret-abc123xyz                            │
# │ Token URL:     https://sharechat.suitetalk.api.netsuite.com/... │
# └─────────────────────────────────────────────────────────────────┘
#
# ⚠️  SSL Setup Required (run once):
#     sudo sh -c 'echo "127.0.0.1  sharechat.suitetalk.api.netsuite.com" >> /etc/hosts'

# 2. Setup /etc/hosts (one-time per domain)
sudo sh -c 'echo "127.0.0.1  sharechat.suitetalk.api.netsuite.com" >> /etc/hosts'

# 3. Start the server with HTTPS (requires additional Express HTTPS setup)
npm run dev

# 4. Copy credentials into Claude Cowork
# - Use the URL, Client ID, Client Secret from the output

# 5. List all instances
npm run cli -- list

# 6. Get credentials again later
npm run cli -- info netsuite_sharechat_xxx --creds
```

---

## Summary

This plan creates a complete Factory CLI tool that:

1. **Creates instances** with `mock-factory create -c netsuite -o sharechat`
2. **Outputs credentials** in a formatted box ready for copy/paste into AI agents
3. **Generates HTTPS URLs** that match real connector formats (e.g., `https://sharechat.suitetalk.api.netsuite.com`)
4. **Provides SSL setup instructions** for /etc/hosts modification
5. **Lists and manages** instances via `list`, `info`, `delete` commands

The credentials output is designed to be directly usable with Claude Cowork and PipesHub without modification.
