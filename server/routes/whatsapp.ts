import { Router } from 'express';
import { z } from 'zod';
import { whatsappManager } from '../services/whatsapp-manager.js';
import { simulateIncoming } from '../services/simulation-service.js';

export const whatsappRouter = Router();

whatsappRouter.get('/status', (_req, res) => {
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
