import { Router } from 'express';
import { realtime, type RealtimeEvent } from '../lib/realtime.js';

export const eventsRouter = Router();

eventsRouter.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event: RealtimeEvent | { type: string; data: unknown; at: string }) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  send({ type: 'connected', data: { ok: true }, at: new Date().toISOString() });

  const listener = (event: RealtimeEvent) => send(event);
  realtime.on('event', listener);
  const heartbeat = setInterval(() => {
    send({ type: 'heartbeat', data: { ts: Date.now() }, at: new Date().toISOString() });
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    realtime.off('event', listener);
    res.end();
  });
});
