import { Router } from 'express';
import { z } from 'zod';
import { whatsappManager } from '../services/whatsapp-manager.js';
import { simulateIncoming } from '../services/simulation-service.js';

export const whatsappRouter = Router();

whatsappRouter.get('/status', async (_req, res) => {
  // Status dibaca halaman Settings terus-menerus. Kesempatan yang sama dipakai
  // untuk menyambung ulang driver yang mati setelah error pertama, supaya
  // halaman bisa pulih sendiri tanpa perlu restart container.
  await whatsappManager.syncConnection().catch(() => undefined);
  res.json(whatsappManager.getStatus());
});

whatsappRouter.post('/connect', async (_req, res) => {
  res.json(await whatsappManager.connect());
});

whatsappRouter.post('/disconnect', async (_req, res) => {
  res.json(await whatsappManager.disconnect(false));
});

whatsappRouter.post('/logout', async (_req, res) => {
  res.json(await whatsappManager.disconnect(true));
});

whatsappRouter.post('/restart', async (_req, res) => {
  res.json(await whatsappManager.restart());
});

whatsappRouter.get('/groups', async (_req, res) => {
  res.json(await whatsappManager.getGroups());
});

whatsappRouter.post('/resync', async (req, res) => {
  const body = z
    .object({
      hours: z.coerce.number().min(1).max(168).optional(),
      limitPerChat: z.coerce.number().min(1).max(20).optional()
    })
    .parse(req.body ?? {});
  res.json(await whatsappManager.resyncRecentMessages(body));
});

whatsappRouter.post('/pairing', async (req, res) => {
  const body = z.object({ phone: z.string().min(9).max(20) }).parse(req.body ?? {});
  res.json(await whatsappManager.requestPairing(body.phone));
});

whatsappRouter.post('/reset-session', async (req, res) => {
  const body = z
    .object({ target: z.enum(['webjs', 'baileys', 'all']).optional() })
    .parse(req.body ?? {});
  res.json(await whatsappManager.resetSessions(body.target ?? 'all'));
});

whatsappRouter.post('/simulate', async (req, res) => {
  const body = z
    .object({
      kind: z.enum(['image', 'document', 'links']),
      senderName: z.string().max(120).optional(),
      senderNumber: z.string().max(40).optional(),
      groupName: z.string().max(160).optional()
    })
    .parse(req.body);
  const result = await simulateIncoming(body);
  res.status(201).json(result);
});
