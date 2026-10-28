import { Router } from 'express';
import { z } from 'zod';
import { buildWaText, getDailyBundle } from '../services/export-service.js';
import { sendDailyRecap } from '../services/scheduler-service.js';
import { sendPersonnelReminder } from '../services/reminder-service.js';

export const reportsRouter = Router();

reportsRouter.get('/preview', async (req, res) => {
  const date = typeof req.query.date === 'string' ? req.query.date : undefined;
  const bundle = await getDailyBundle(date);
  res.json({ ...bundle, text: buildWaText(bundle) });
});

reportsRouter.post('/send', async (req, res) => {
  const body = z
    .object({ groupJid: z.string().max(200).optional(), date: z.string().optional() })
    .parse(req.body ?? {});
  const result = await sendDailyRecap('manual', body.groupJid, body.date);
  res.json({ ...result, requestedGroupJid: body.groupJid ?? null });
});

reportsRouter.post('/personnel-reminder', async (req, res) => {
  const body = z
    .object({
      groupJid: z.string().max(200).optional(),
      period: z.enum(['daily', 'weekly']).optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    })
    .parse(req.body ?? {});
  res.json(await sendPersonnelReminder(body));
});
