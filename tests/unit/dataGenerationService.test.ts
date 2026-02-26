import { DataGenerationService } from '../../src/services/dataGenerationService';
import { ConnectorSchema, GenerationBrief } from '../../src/types/dataGeneration';

// Mock dependencies
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/generators', () => ({
  DataGenerationOrchestrator: jest.fn().mockImplementation(() => ({
    executePlan: jest.fn().mockResolvedValue(new Map()),
  })),
  GenerationPlanBuilder: {
    buildPlan: jest.fn().mockReturnValue({
      jobId: 'test-job',
      tables: [],
      executionOrder: [],
      crossTableConstraints: [],
      estimatedTotalRecords: 0,
      estimatedTimeMs: 0,
    }),
  },
}));

const mockFs = jest.requireMock('fs/promises') as {
  readFile: jest.Mock;
  writeFile: jest.Mock;
  mkdir: jest.Mock;
};
const mockLogger = jest.requireMock('../../src/utils/logger') as {
  error: jest.Mock;
};

const makeSchema = (name: string): ConnectorSchema => ({
  connectorId: name,
  connectorName: name,
  connectorType: 'api',
  version: '1.0.0',
  description: `${name} connector`,
  authentication: { type: 'oauth2' },
  baseUrl: '/api',
  entities: {
    users: {
      table: 'users',
      description: 'Users entity',
      fields: [
        { name: 'id', type: 'string', required: true, primaryKey: true },
        { name: 'name', type: 'string', required: true },
      ],
    },
  },
});

const makeBrief = (connectorName: string): GenerationBrief => ({
  jobId: 'test-job-123',
  orgId: 'test-org',
  sessionId: 'test-session',
  callbacks: {
    outputDirectory: '/tmp/test-output',
    statusFile: '/tmp/test-output/status.json',
  },
  connectors: [
    {
      name: connectorName,
      entities: [{ name: 'users', estimatedVolume: 10 }],
    },
  ],
  metadata: { industry: 'tech' },
});

describe('DataGenerationService', () => {
  let service: DataGenerationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DataGenerationService();
  });

  afterEach(() => {
    // Clear any intervals that executeJob may have started
    jest.clearAllTimers();
  });

  describe('schema passthrough', () => {
    it('should use provided schema instead of loading from file', async () => {
      const schema = makeSchema('hubspot');
      const brief = makeBrief('hubspot');

      try {
        await service.executeJob(brief, { outputFormat: 'json' }, { hubspot: schema });
      } catch {
        // Execution may fail downstream; we only care about schema loading
      }

      // Should NOT have tried to read a schema file from disk
      expect(mockFs.readFile).not.toHaveBeenCalledWith(
        expect.stringContaining('hubspot.json'),
        expect.anything()
      );
    });

    it('should fall back to loadConnectorSchema when no schema provided', async () => {
      const schema = makeSchema('hubspot');
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(schema));

      try {
        await service.executeJob(makeBrief('hubspot'), { outputFormat: 'json' });
      } catch {
        // Execution may fail downstream
      }

      // Should have tried to read from disk
      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('hubspot.json'),
        'utf-8'
      );
    });

    it('should skip connector when no schema found anywhere', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT: no such file'));

      let result;
      try {
        result = await service.executeJob(makeBrief('nonexistent'), { outputFormat: 'json' });
      } catch {
        // May throw if no connectors processed
      }

      // Should have logged the error about failed schema loading
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to load schema for connector',
        expect.objectContaining({ connector: 'nonexistent' })
      );
    });
  });
});
