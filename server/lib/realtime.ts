import { EventEmitter } from 'node:events';

export type RealtimeEventName = 'activity' | 'stats' | 'wa-status' | 'wa-qr' | 'message' | 'export' | 'heartbeat';

export interface RealtimeEvent {
  type: RealtimeEventName;
  data: unknown;
  at: string;
}

class RealtimeBus extends EventEmitter {
  publish(type: RealtimeEventName, data: unknown): void {
    const event: RealtimeEvent = { type, data, at: new Date().toISOString() };
    this.emit('event', event);
  }
}

export const realtime = new RealtimeBus();
realtime.setMaxListeners(100);
