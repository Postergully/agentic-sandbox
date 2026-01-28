/**
 * Tests for Parser Index (unified parser interface)
 */

import { detectInputType, SchemaInputType } from '../../../src/schema/parsers';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs for file existence checks
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

describe('Parser Index', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
  });

  describe('detectInputType', () => {
    describe('OpenAPI detection', () => {
      it('should detect OpenAPI object with openapi field', () => {
        const result = detectInputType({ openapi: '3.0.0', info: {}, paths: {} });
        expect(result.type).toBe('openapi');
        expect(result.suggestedParser).toBe('openapi');
        expect(result.confidence).toBeGreaterThan(0.9);
      });

      it('should detect Swagger object with swagger field', () => {
        const result = detectInputType({ swagger: '2.0', info: {}, paths: {} });
        expect(result.type).toBe('openapi');
        expect(result.suggestedParser).toBe('openapi');
      });

      it('should detect YAML file path', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        const result = detectInputType('/path/to/openapi.yaml');
        expect(result.type).toBe('openapi');
        expect(result.suggestedParser).toBe('openapi');
      });

      it('should detect YML file path', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        const result = detectInputType('/path/to/swagger.yml');
        expect(result.type).toBe('openapi');
        expect(result.suggestedParser).toBe('openapi');
      });

      it('should detect JSON file with OpenAPI content', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue('{"openapi": "3.0.0"}');
        const result = detectInputType('/path/to/api.json');
        expect(result.type).toBe('openapi');
        expect(result.suggestedParser).toBe('openapi');
      });

      it('should detect URL with openapi in path', () => {
        const result = detectInputType('https://api.example.com/openapi.json');
        expect(result.type).toBe('openapi-url');
        expect(result.suggestedParser).toBe('openapi');
      });

      it('should detect URL with swagger in path', () => {
        const result = detectInputType('https://api.example.com/swagger.yaml');
        expect(result.type).toBe('openapi-url');
        expect(result.suggestedParser).toBe('openapi');
      });

      it('should detect inline JSON OpenAPI', () => {
        const result = detectInputType('{"openapi": "3.0.0", "info": {}}');
        expect(result.type).toBe('openapi');
        expect(result.suggestedParser).toBe('openapi');
      });

      it('should detect inline YAML with openapi marker', () => {
        const result = detectInputType('openapi: 3.0.0\ninfo:\n  title: API');
        expect(result.type).toBe('openapi');
        expect(result.suggestedParser).toBe('openapi');
      });
    });

    describe('ConnectorSchema detection', () => {
      it('should detect ConnectorSchema object', () => {
        const result = detectInputType({
          name: 'test',
          entities: [],
          auth: { type: 'apikey', fields: [] },
        });
        expect(result.type).toBe('json-sample');
        expect(result.suggestedParser).toBe('json');
      });

      it('should detect JSON file with ConnectorSchema', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue('{"entities": [], "auth": {}}');
        const result = detectInputType('/path/to/schema.json');
        expect(result.type).toBe('file');
        expect(result.suggestedParser).toBe('json');
      });

      it('should detect inline ConnectorSchema JSON', () => {
        const result = detectInputType('{"entities": [], "auth": {"type": "oauth2"}}');
        expect(result.type).toBe('json-sample');
        expect(result.suggestedParser).toBe('json');
      });
    });

    describe('LLM inference detection', () => {
      it('should suggest LLM for generic JSON objects', () => {
        const result = detectInputType({ users: [{ id: 1, name: 'John' }] });
        expect(result.type).toBe('json-sample');
        expect(result.suggestedParser).toBe('llm');
      });

      it('should suggest LLM for non-OpenAPI URLs', () => {
        const result = detectInputType('https://developer.example.com/api-docs');
        expect(result.type).toBe('url');
        expect(result.suggestedParser).toBe('llm');
      });

      it('should suggest LLM for generic JSON files', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue('{"users": []}');
        const result = detectInputType('/path/to/sample.json');
        expect(result.type).toBe('json-sample');
        expect(result.suggestedParser).toBe('llm');
      });

      it('should suggest LLM for text descriptions', () => {
        const result = detectInputType('CRM API with customers, contacts, and deals');
        expect(result.type).toBe('description');
        expect(result.suggestedParser).toBe('llm');
      });

      it('should suggest LLM for unknown file types', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        const result = detectInputType('/path/to/docs.md');
        expect(result.type).toBe('file');
        expect(result.suggestedParser).toBe('llm');
      });
    });

    describe('Confidence levels', () => {
      it('should have high confidence for explicit OpenAPI specs', () => {
        const result = detectInputType({ openapi: '3.0.0' });
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      });

      it('should have medium confidence for LLM inference', () => {
        const result = detectInputType({ users: [] });
        expect(result.confidence).toBeLessThan(0.9);
        expect(result.confidence).toBeGreaterThanOrEqual(0.5);
      });

      it('should have lower confidence for descriptions', () => {
        const result = detectInputType('Some API description');
        expect(result.confidence).toBeLessThanOrEqual(0.6);
      });
    });
  });
});
