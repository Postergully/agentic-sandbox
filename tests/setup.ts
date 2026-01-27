// Test setup file for Jest

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing';
process.env.OAUTH_CLIENT_ID = 'agentic-sandbox-client';
process.env.OAUTH_CLIENT_SECRET = 'agentic-sandbox-secret';
process.env.OAUTH_REDIRECT_URI = 'http://localhost:3000/callback';

// Suppress console output during tests (optional - comment out for debugging)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Global test timeout
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
  // Allow time for any pending async operations to complete
  await new Promise((resolve) => setTimeout(resolve, 100));
});
