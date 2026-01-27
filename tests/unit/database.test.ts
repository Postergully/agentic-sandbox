import { Pool, PoolClient, QueryResult } from 'pg';

// Mock pg module before importing database
jest.mock('pg', () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const mockPool = {
    query: jest.fn(),
    connect: jest.fn().mockResolvedValue(mockClient),
    end: jest.fn(),
    on: jest.fn(),
  };
  return { Pool: jest.fn(() => mockPool) };
});

jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

// Need to mock config before importing database
jest.mock('../../src/config', () => ({
  database: {
    host: 'localhost',
    port: 5432,
    name: 'test_db',
    user: 'test_user',
    password: 'test_pass',
    ssl: false,
    poolMin: 2,
    poolMax: 10,
  },
}));

describe('Database', () => {
  let database: any;
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the module cache to get a fresh instance
    jest.resetModules();

    // Re-mock after reset
    jest.mock('pg', () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      const mockPoolInstance = {
        query: jest.fn(),
        connect: jest.fn().mockResolvedValue(mockClient),
        end: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      };
      return { Pool: jest.fn(() => mockPoolInstance) };
    });

    // Re-import after mocking
    const { Pool } = require('pg');
    database = require('../../src/config/database').default;
    mockPool = Pool.mock.results[0]?.value || new Pool();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const Database = require('../../src/config/database');
      // The module exports a singleton, so importing twice should give same reference
      const instance1 = Database.default;
      const instance2 = Database.default;
      expect(instance1).toBe(instance2);
    });
  });

  describe('query', () => {
    it('should execute a query and return results', async () => {
      const mockResult: QueryResult = {
        rows: [{ id: 1, name: 'test' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      };
      mockPool.query.mockResolvedValueOnce(mockResult);

      const result = await database.query('SELECT * FROM test WHERE id = $1', [1]);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test WHERE id = $1', [1]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('test');
    });

    it('should execute a query without parameters', async () => {
      const mockResult: QueryResult = {
        rows: [{ count: '5' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      };
      mockPool.query.mockResolvedValueOnce(mockResult);

      const result = await database.query('SELECT COUNT(*) FROM test');

      expect(mockPool.query).toHaveBeenCalledWith('SELECT COUNT(*) FROM test', undefined);
      expect(result.rows[0].count).toBe('5');
    });

    it('should propagate query errors', async () => {
      const queryError = new Error('Syntax error in SQL');
      mockPool.query.mockRejectedValueOnce(queryError);

      await expect(database.query('INVALID SQL')).rejects.toThrow('Syntax error in SQL');
    });

    it('should log query execution time', async () => {
      const logger = require('../../src/utils/logger');
      const mockResult: QueryResult = {
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      };
      mockPool.query.mockResolvedValueOnce(mockResult);

      await database.query('SELECT 1');

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Executed query in')
      );
    });
  });

  describe('getClient', () => {
    it('should return a pool client', async () => {
      const client = await database.getClient();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(client).toBeDefined();
    });
  });

  describe('transaction', () => {
    let mockClient: any;

    beforeEach(() => {
      mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockPool.connect.mockResolvedValue(mockClient);
    });

    it('should execute callback within a transaction', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const callback = jest.fn().mockResolvedValue({ success: true });
      const result = await database.transaction(callback);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should rollback on callback error', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const callbackError = new Error('Transaction failed');
      const callback = jest.fn().mockRejectedValue(callbackError);

      await expect(database.transaction(callback)).rejects.toThrow('Transaction failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even on error', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const callback = jest.fn().mockRejectedValue(new Error('Error'));

      try {
        await database.transaction(callback);
      } catch (e) {
        // Expected
      }

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should support multiple operations in a single transaction', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const callback = async (client: PoolClient) => {
        await client.query('INSERT INTO test VALUES ($1)', ['value1']);
        await client.query('INSERT INTO test VALUES ($1)', ['value2']);
        return { inserted: 2 };
      };

      const result = await database.transaction(callback);

      expect(result).toEqual({ inserted: 2 });
      expect(mockClient.query).toHaveBeenCalledTimes(4); // BEGIN, 2 INSERTs, COMMIT
    });
  });

  describe('close', () => {
    it('should close the pool', async () => {
      await database.close();

      expect(mockPool.end).toHaveBeenCalled();
    });
  });

  describe('testConnection', () => {
    it('should return true when connection is successful', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ now: new Date() }] });

      const result = await database.testConnection();

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT NOW()', undefined);
    });

    it('should return false when connection fails', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await database.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('Pool Configuration', () => {
    it('should create pool with correct configuration', () => {
      const { Pool } = require('pg');

      // The Pool constructor should have been called with config
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 5432,
          database: 'test_db',
          user: 'test_user',
          password: 'test_pass',
        })
      );
    });

    it('should set up event listeners on pool', () => {
      expect(mockPool.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });
});
