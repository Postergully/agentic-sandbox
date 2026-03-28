import request from 'supertest';
import app from '../../src/app';
import { ApiResponse, Connector } from '../../src/types';

describe('Connector Routes Integration Tests', () => {
  describe('GET /api/v1/connectors', () => {
    it('should return a list of all connectors', async () => {
      const response = await request(app)
        .get('/api/v1/connectors')
        .expect(200);

      const body: ApiResponse<Connector[]> = response.body;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data!.length).toBeGreaterThan(0);
      expect(body.meta?.total).toBe(body.data!.length);
      expect(body.meta?.timestamp).toBeDefined();
    });

    it('should return NetSuite connector with correct structure', async () => {
      const response = await request(app)
        .get('/api/v1/connectors')
        .expect(200);

      const body: ApiResponse<Connector[]> = response.body;
      const netsuite = body.data!.find((c) => c._key === 'netsuite');

      expect(netsuite).toBeDefined();
      expect(netsuite!.name).toBe('NetSuite');
      expect(netsuite!.type).toBe('NETSUITE');
      expect(netsuite!.appGroup).toBe('ERP');
      expect(netsuite!.authType).toBe('OAUTH');
      expect(netsuite!.appDescription).toBe('Oracle NetSuite ERP system');
      expect(netsuite!.appCategories).toEqual(['ERP', 'Accounting', 'Finance']);
      expect(netsuite!.iconPath).toBe('/assets/icons/connectors/netsuite.svg');
      expect(netsuite!.isActive).toBe(true);
      expect(netsuite!.isConfigured).toBe(true);
      expect(netsuite!.isAuthenticated).toBe(true);
      expect(netsuite!.supportsRealtime).toBe(false);
    });
  });

  describe('GET /api/v1/connectors/active', () => {
    it('should return only active connectors', async () => {
      const response = await request(app)
        .get('/api/v1/connectors/active')
        .expect(200);

      const body: ApiResponse<Connector[]> = response.body;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      body.data!.forEach((connector) => {
        expect(connector.isActive).toBe(true);
      });
    });
  });

  describe('GET /api/v1/connectors/inactive', () => {
    it('should return only inactive connectors', async () => {
      const response = await request(app)
        .get('/api/v1/connectors/inactive')
        .expect(200);

      const body: ApiResponse<Connector[]> = response.body;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      // Currently all connectors are active, so this should be empty
      expect(body.data!.length).toBe(0);
    });
  });

  describe('GET /api/v1/connectors/:name', () => {
    it('should return a single connector by key', async () => {
      const response = await request(app)
        .get('/api/v1/connectors/netsuite')
        .expect(200);

      const body: ApiResponse<Connector> = response.body;
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data!._key).toBe('netsuite');
      expect(body.data!.name).toBe('NetSuite');
    });

    it('should return a single connector by name (case-insensitive)', async () => {
      const response = await request(app)
        .get('/api/v1/connectors/NetSuite')
        .expect(200);

      const body: ApiResponse<Connector> = response.body;
      expect(body.success).toBe(true);
      expect(body.data!._key).toBe('netsuite');
    });

    it('should return 404 for non-existent connector', async () => {
      const response = await request(app)
        .get('/api/v1/connectors/unknown')
        .expect(404);

      const body: ApiResponse = response.body;
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('CONNECTOR_NOT_FOUND');
      expect(body.error?.message).toBe('Connector not found');
    });
  });
});
