import * as React from 'react';
import { api, errorMessage } from '@/lib/api';

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: (showLoading?: boolean) => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

export function useApi<T>(path: string | null): UseApiResult<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(Boolean(path));
  const [error, setError] = React.useState<string | null>(null);
  const requestId = React.useRef(0);

  const refresh = React.useCallback(
    async (showLoading = false) => {
      if (!path) return;
      const id = ++requestId.current;
      if (showLoading) setLoading(true);
      try {
        const result = await api.get<T>(path);
        if (requestId.current === id) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (requestId.current === id) setError(errorMessage(err));
      } finally {
        if (requestId.current === id) setLoading(false);
      }
    },
    [path]
  );

  React.useEffect(() => {
    void refresh(true);
  }, [refresh]);

  return { data, loading, error, refresh, setData };
}

export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}
