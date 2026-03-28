import { Request, Response, NextFunction } from 'express';
import { requestLogger } from '../../src/middleware/requestLogger';

const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();

jest.mock('../../src/utils/logger', () => ({
  info: (...args: unknown[]) => mockInfo(...args),
  warn: (...args: unknown[]) => mockWarn(...args),
  error: (...args: unknown[]) => mockError(...args),
  debug: jest.fn(),
}));

describe('Request Logger Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFn: NextFunction;
  let finishHandler: (() => void) | undefined;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      originalUrl: '/api/test',
      url: '/api/test',
      headers: {
        'x-request-id': 'req-123',
        'user-agent': 'test-agent/1.0',
      },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' } as any,
    };
    mockRes = {
      statusCode: 200,
      on: jest.fn((event: string, handler: () => void) => {
        if (event === 'finish') {
          finishHandler = handler;
        }
        return mockRes as Response;
      }),
      getHeader: jest.fn().mockReturnValue('1234'),
    };
    nextFn = jest.fn();
    finishHandler = undefined;
    jest.clearAllMocks();
  });

  it('should call next immediately', () => {
    requestLogger(mockReq as Request, mockRes as Response, nextFn);
    expect(nextFn).toHaveBeenCalled();
  });

  it('should register a finish event handler', () => {
    requestLogger(mockReq as Request, mockRes as Response, nextFn);
    expect(mockRes.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('should log info for 2xx responses', () => {
    mockRes.statusCode = 200;
    requestLogger(mockReq as Request, mockRes as Response, nextFn);
    finishHandler!();

    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/test 200'),
      expect.objectContaining({
        meta: expect.objectContaining({
          method: 'GET',
          path: '/api/test',
          status: 200,
          request_id: 'req-123',
          user_agent: 'test-agent/1.0',
        }),
      })
    );
  });

  it('should log warn for 4xx responses', () => {
    mockRes.statusCode = 404;
    requestLogger(mockReq as Request, mockRes as Response, nextFn);
    finishHandler!();

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/test 404'),
      expect.any(Object)
    );
  });

  it('should log error for 5xx responses', () => {
    mockRes.statusCode = 500;
    requestLogger(mockReq as Request, mockRes as Response, nextFn);
    finishHandler!();

    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/test 500'),
      expect.any(Object)
    );
  });

  it('should include response time in log', () => {
    requestLogger(mockReq as Request, mockRes as Response, nextFn);
    finishHandler!();

    const message = mockInfo.mock.calls[0][0] as string;
    expect(message).toMatch(/\d+(\.\d+)?ms/);
  });

  it('should include content_length from response header', () => {
    requestLogger(mockReq as Request, mockRes as Response, nextFn);
    finishHandler!();

    expect(mockRes.getHeader).toHaveBeenCalledWith('content-length');
    const meta = (mockInfo.mock.calls[0][1] as any).meta;
    expect(meta.content_length).toBe('1234');
  });

  it('should fall back to url when originalUrl is not set', () => {
    delete mockReq.originalUrl;
    mockReq.url = '/fallback-url';
    requestLogger(mockReq as Request, mockRes as Response, nextFn);
    finishHandler!();

    const message = mockInfo.mock.calls[0][0] as string;
    expect(message).toContain('/fallback-url');
  });

  it('should handle missing x-request-id gracefully', () => {
    mockReq.headers = { 'user-agent': 'test' };
    requestLogger(mockReq as Request, mockRes as Response, nextFn);
    finishHandler!();

    const meta = (mockInfo.mock.calls[0][1] as any).meta;
    expect(meta.request_id).toBeUndefined();
  });
});
