import { Request, Response, NextFunction } from 'express';
import {
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
} from '../../src/middleware/errorHandler';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      originalUrl: '/api/test',
      method: 'GET',
      ip: '127.0.0.1',
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  describe('AppError', () => {
    it('should create an error with correct properties', () => {
      const error = new AppError('Test error', 400, 'TEST_ERROR');

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should be an instance of Error', () => {
      const error = new AppError('Test', 500, 'CODE');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test', 500, 'CODE');

      expect(error.stack).toBeDefined();
      // Stack trace should contain file name or error message
      expect(error.stack).toContain('errorHandler.test.ts');
    });

    it('should support different status codes', () => {
      const badRequest = new AppError('Bad request', 400, 'BAD_REQUEST');
      const unauthorized = new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const forbidden = new AppError('Forbidden', 403, 'FORBIDDEN');
      const notFound = new AppError('Not found', 404, 'NOT_FOUND');
      const serverError = new AppError('Server error', 500, 'SERVER_ERROR');

      expect(badRequest.statusCode).toBe(400);
      expect(unauthorized.statusCode).toBe(401);
      expect(forbidden.statusCode).toBe(403);
      expect(notFound.statusCode).toBe(404);
      expect(serverError.statusCode).toBe(500);
    });
  });

  describe('errorHandler', () => {
    it('should handle AppError with correct status and response', () => {
      const appError = new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');

      errorHandler(appError, mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'CUSTOMER_NOT_FOUND',
          message: 'Customer not found',
        },
      });
    });

    it('should handle generic Error with 500 status', () => {
      const genericError = new Error('Something went wrong');

      errorHandler(
        genericError,
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    });

    it('should log AppError details', () => {
      const logger = require('../../src/utils/logger');
      const appError = new AppError('Test error', 400, 'TEST');

      errorHandler(appError, mockRequest as Request, mockResponse as Response, nextFunction);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('400 - Test error - /api/test - GET')
      );
    });

    it('should log generic error with stack trace', () => {
      const logger = require('../../src/utils/logger');
      const genericError = new Error('Generic error');

      errorHandler(
        genericError,
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('500 - Generic error'));
      expect(logger.error).toHaveBeenCalledWith(genericError.stack);
    });

    it('should not expose internal error details to client', () => {
      const internalError = new Error('Database connection string: postgres://...');

      errorHandler(
        internalError,
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      const jsonResponse = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(jsonResponse.error.message).toBe('An unexpected error occurred');
      expect(jsonResponse.error.message).not.toContain('postgres://');
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 with route information', () => {
      mockRequest.originalUrl = '/api/nonexistent';

      notFoundHandler(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Route /api/nonexistent not found',
        },
      });
    });

    it('should include the full path in error message', () => {
      mockRequest.originalUrl = '/api/v1/users/123/profile';

      notFoundHandler(mockRequest as Request, mockResponse as Response);

      const jsonResponse = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(jsonResponse.error.message).toBe(
        'Route /api/v1/users/123/profile not found'
      );
    });
  });

  describe('asyncHandler', () => {
    it('should pass resolved promise to response', async () => {
      const asyncFn = jest.fn().mockResolvedValue(undefined);
      const wrappedFn = asyncHandler(asyncFn);

      await wrappedFn(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(asyncFn).toHaveBeenCalledWith(mockRequest, mockResponse, nextFunction);
    });

    it('should catch rejected promise and pass to next', async () => {
      const testError = new Error('Async error');
      const asyncFn = jest.fn().mockRejectedValue(testError);
      const wrappedFn = asyncHandler(asyncFn);

      await wrappedFn(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(testError);
    });

    it('should handle synchronous errors wrapped in Promise.resolve', async () => {
      const asyncFn = jest.fn().mockImplementation(() => {
        return Promise.reject(new Error('Async wrapped error'));
      });
      const wrappedFn = asyncHandler(asyncFn);

      await wrappedFn(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should pass all arguments to the wrapped function', async () => {
      const asyncFn = jest.fn().mockResolvedValue(undefined);
      const wrappedFn = asyncHandler(asyncFn);

      const customReq = { ...mockRequest, body: { test: true } } as Request;
      await wrappedFn(customReq, mockResponse as Response, nextFunction);

      expect(asyncFn).toHaveBeenCalledWith(customReq, mockResponse, nextFunction);
      expect(asyncFn.mock.calls[0][0].body).toEqual({ test: true });
    });

    it('should work with async/await syntax', async () => {
      const asyncFn = async (req: Request, res: Response) => {
        const data = await Promise.resolve({ id: 1 });
        res.json(data);
      };
      const wrappedFn = asyncHandler(asyncFn);

      await wrappedFn(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.json).toHaveBeenCalledWith({ id: 1 });
    });

    it('should properly propagate AppError through next', async () => {
      const appError = new AppError('Validation failed', 400, 'VALIDATION_ERROR');
      const asyncFn = jest.fn().mockRejectedValue(appError);
      const wrappedFn = asyncHandler(asyncFn);

      await wrappedFn(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(appError);
      expect((nextFunction as jest.Mock).mock.calls[0][0]).toBeInstanceOf(AppError);
    });
  });
});
