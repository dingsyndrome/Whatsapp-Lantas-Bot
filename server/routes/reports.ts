import { Router } from 'express';
import { z } from 'zod';
import { buildWaText, getDailyBundle } from '../services/export-service.js';
import { sendDailyRecap } from '../services/scheduler-service.js';
import { sendPersonnelReminder } from '../services/reminder-service.js';
import { buildCustomRecap } from '../services/custom-recap-service.js';

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

reportsRouter.get('/custom', async (req, res) => {
  const q = z
    .object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      hourFrom: z.coerce.number().int().min(0).max(23).optional(),
      hourTo: z.coerce.number().int().min(0).max(23).optional(),
      category: z
        .enum(['ALL', 'POS_PAGI', 'PENGATURAN', 'PENJAGAAN', 'PENGAWALAN', 'PATROLI', 'PENEGAKKAN', 'LAINNYA'])
        .optional(),
      rosterOnly: z.coerce.boolean().optional()
    })
    .parse(req.query);
  res.json(await buildCustomRecap({ ...q, to: q.to ?? q.from }));
});