import { Response, NextFunction } from 'express';
import { instanceRouter } from '../../src/middleware/instanceRouter';
import registryService from '../../src/services/registryService';
import { InstanceRequest, MockServerInstance } from '../../src/types';

// Mock dependencies
jest.mock('../../src/services/registryService');
jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
}));

const mockRegistryService = registryService as jest.Mocked<typeof registryService>;

const makeInstance = (overrides: Partial<MockServerInstance> = {}): MockServerInstance => ({
  id: 'uuid-123',
  instanceId: 'netsuite_acme_001',
  connector: 'netsuite',
  orgId: 'acme',
  status: 'active',
  pgSchema: 'netsuite_acme_001',
  baseUrl: 'https://acme.suitetalk.api.netsuite.com',
  apiBasePath: '/api/netsuite',
  entityCount: 5,
  ...overrides,
});

describe('Instance Router Middleware', () => {
  let mockRequest: Partial<InstanceRequest>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock<NextFunction>;

  beforeEach(() => {
    mockRequest = {
      params: { instance_id: 'netsuite_acme_001' },
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  it('should attach instance metadata and call next for active instances', async () => {
    const instance = makeInstance();
    mockRegistryService.get.mockResolvedValue(instance);
    mockRegistryService.updateLastAccessed.mockResolvedValue();

    await instanceRouter(
      mockRequest as InstanceRequest,
      mockResponse as Response,
      nextFunction
    );

    expect(mockRegistryService.get).toHaveBeenCalledWith('netsuite_acme_001');
    expect(mockRequest.instance).toEqual({
      instanceId: 'netsuite_acme_001',
      connector: 'netsuite',
      pgSchema: 'netsuite_acme_001',
      baseUrl: 'https://acme.suitetalk.api.netsuite.com',
      apiBasePath: '/api/netsuite',
      orgId: 'acme',
    });
    expect(nextFunction).toHaveBeenCalledWith();
    expect(mockRegistryService.updateLastAccessed).toHaveBeenCalledWith('netsuite_acme_001');
  });

  it('should return 400 when instance_id is missing', async () => {
    mockRequest.params = {} as any;

    await instanceRouter(
      mockRequest as InstanceRequest,
      mockResponse as Response,
      nextFunction
    );

    expect(nextFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: 'MISSING_INSTANCE_ID',
      })
    );
  });

  it('should return 404 when instance is not found', async () => {
    mockRegistryService.get.mockResolvedValue(null);

    await instanceRouter(
      mockRequest as InstanceRequest,
      mockResponse as Response,
      nextFunction
    );

    expect(nextFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        code: 'INSTANCE_NOT_FOUND',
      })
    );
  });

  it('should return 503 when instance is not active', async () => {
    const instance = makeInstance({ status: 'creating' });
    mockRegistryService.get.mockResolvedValue(instance);

    await instanceRouter(
      mockRequest as InstanceRequest,
      mockResponse as Response,
      nextFunction
    );

    expect(nextFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        code: 'INSTANCE_NOT_ACTIVE',
      })
    );
  });

  it('should return 503 for stopped instances', async () => {
    const instance = makeInstance({ status: 'stopped' });
    mockRegistryService.get.mockResolvedValue(instance);

    await instanceRouter(
      mockRequest as InstanceRequest,
      mockResponse as Response,
      nextFunction
    );

    expect(nextFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        code: 'INSTANCE_NOT_ACTIVE',
      })
    );
  });

  it('should handle registryService.get errors gracefully', async () => {
    mockRegistryService.get.mockRejectedValue(new Error('DB connection failed'));

    await instanceRouter(
      mockRequest as InstanceRequest,
      mockResponse as Response,
      nextFunction
    );

    expect(nextFunction).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should not block on updateLastAccessed failure', async () => {
    const instance = makeInstance();
    mockRegistryService.get.mockResolvedValue(instance);
    mockRegistryService.updateLastAccessed.mockRejectedValue(new Error('Redis down'));

    await instanceRouter(
      mockRequest as InstanceRequest,
      mockResponse as Response,
      nextFunction
    );

    // Should still call next successfully
    expect(nextFunction).toHaveBeenCalledWith();
    expect(mockRequest.instance).toBeDefined();
  });
});
