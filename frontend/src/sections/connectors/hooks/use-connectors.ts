// hooks/use-connectors.ts

import { useState, useEffect, useCallback } from 'react';
import { connectorApi } from '../services/api';
import type { Connector } from '../types/types';

interface UseConnectorsReturn {
  connectors: Connector[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useConnectors(): UseConnectorsReturn {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchConnectors = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await connectorApi.getAll();
      setConnectors(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch connectors'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnectors();
  }, [fetchConnectors]);

  return {
    connectors,
    isLoading,
    error,
    refetch: fetchConnectors,
  };
}
