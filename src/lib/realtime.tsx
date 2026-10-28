import * as React from 'react';
import type { WhatsAppStatusDTO } from '@/shared/types';
import { api } from '@/lib/api';

interface RealtimeEvent {
  type: string;
  data: unknown;
  at: string;
}

interface RealtimeContextValue {
  connected: boolean;
  version: number;
  lastEvent: RealtimeEvent | null;
  waStatus: WhatsAppStatusDTO | null;
  refreshWhatsApp: () => Promise<void>;
}

const RealtimeContext = React.createContext<RealtimeContextValue | null>(null);

const EVENT_TYPES = [
  'connected',
  'heartbeat',
  'activity',
  'stats',
  'wa-status',
  'wa-qr',
  'message',
  'export'
] as const;

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = React.useState(false);
  const [version, setVersion] = React.useState(0);
  const [lastEvent, setLastEvent] = React.useState<RealtimeEvent | null>(null);
  const [waStatus, setWaStatus] = React.useState<WhatsAppStatusDTO | null>(null);

  const refreshWhatsApp = React.useCallback(async () => {
    try {
      const status = await api.get<WhatsAppStatusDTO>('/wa/status');
      setWaStatus(status);
    } catch {
      // API can be temporarily unavailable.
    }
  }, []);

  React.useEffect(() => {
    void refreshWhatsApp();
  }, [refreshWhatsApp]);

  React.useEffect(() => {
    const source = new EventSource('/api/events');
    const handlers: Array<[string, (event: MessageEvent) => void]> = [];

    const handle = (type: string) => (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as RealtimeEvent;
        setLastEvent(parsed);
        if (type === 'heartbeat') return;
        if (parsed.type === 'wa-status' || parsed.type === 'wa-qr') {
          setWaStatus(parsed.data as WhatsAppStatusDTO);
          return;
        }
        if (['activity', 'stats', 'message', 'export'].includes(parsed.type)) {
          setVersion((current) => current + 1);
        }
      } catch {
        // Ignore malformed SSE payloads.
      }
    };

    for (const type of EVENT_TYPES) {
      const listener = handle(type);
      source.addEventListener(type, listener);
      handlers.push([type, listener]);
    }

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    return () => {
      for (const [type, listener] of handlers) source.removeEventListener(type, listener);
      source.close();
    };
  }, []);

  const value = React.useMemo<RealtimeContextValue>(
    () => ({ connected, version, lastEvent, waStatus, refreshWhatsApp }),
    [connected, version, lastEvent, waStatus, refreshWhatsApp]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const context = React.useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime harus dipakai di dalam RealtimeProvider.');
  return context;
}

export function useRealtimeVersion(): number {
  return useRealtime().version;
}
