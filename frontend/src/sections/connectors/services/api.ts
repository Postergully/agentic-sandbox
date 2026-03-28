// services/api.ts

import axios from 'axios';
import type { AxiosInstance, AxiosResponse } from 'axios';
import type { Connector, ConnectorConfig, ConnectorSchema } from '../types/types';

// Backend API response wrapper
interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    total?: number;
    timestamp?: string;
  };
}

class ConnectorApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api/v1/connectors',
      timeout: 30000,
    });

    // Add auth interceptor
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Add response interceptor to unwrap API response
    this.client.interceptors.response.use((response: AxiosResponse<ApiResponse<unknown>>) => {
      // Unwrap the data from the API response wrapper
      if (response.data && typeof response.data === 'object' && 'success' in response.data) {
        response.data = response.data.data as typeof response.data;
      }
      return response;
    });
  }

  // List Operations
  async getAll(): Promise<Connector[]> {
    const { data } = await this.client.get<Connector[]>('/');
    return data;
  }

  async getActive(): Promise<Connector[]> {
    const { data } = await this.client.get('/active');
    return data;
  }

  async getInactive(): Promise<Connector[]> {
    const { data } = await this.client.get('/inactive');
    return data;
  }

  async getByName(name: string): Promise<Connector> {
    const { data } = await this.client.get(`/${name}`);
    return data;
  }

  // Configuration Operations
  async getConfig(name: string): Promise<ConnectorConfig> {
    const { data } = await this.client.get(`/config/${name}`);
    return data;
  }

  async updateConfig(name: string, config: Partial<ConnectorConfig>): Promise<void> {
    await this.client.put(`/config/${name}`, config);
  }

  async getSchema(name: string): Promise<ConnectorSchema> {
    const { data } = await this.client.get(`/schema/${name}`);
    return data;
  }

  async getConfigAndSchema(name: string): Promise<{
    config: ConnectorConfig;
    schema: ConnectorSchema;
  }> {
    const { data } = await this.client.get(`/config-schema/${name}`);
    return data;
  }

  // Toggle Operations
  async toggle(name: string, enabled: boolean): Promise<void> {
    await this.client.post(`/toggle/${name}`, { enabled });
  }

  // OAuth Operations
  async getOAuthUrl(name: string, baseUrl: string): Promise<string> {
    const { data } = await this.client.get(`/${name}/oauth/authorize`, {
      params: { baseUrl },
    });
    return data.authorizationUrl;
  }

  async handleOAuthCallback(
    name: string,
    code: string,
    state: string
  ): Promise<{ success: boolean; filters?: unknown }> {
    const { data } = await this.client.get(`/${name}/oauth/callback`, {
      params: { code, state },
    });
    return data;
  }

  // Filter Operations
  async getFilters(name: string): Promise<unknown> {
    const { data } = await this.client.get(`/${name}/filters`);
    return data;
  }

  async saveFilters(name: string, filters: unknown): Promise<void> {
    await this.client.post(`/${name}/filters`, filters);
  }
}

export const connectorApi = new ConnectorApiService();
