import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { parseTimeOfDay } from '../lib/time.js';
import { buildWaText, getDailyBundle } from '../services/export-service.js';
import { sendDailyRecap } from '../services/scheduler-service.js';
import { sendPersonnelReminder } from '../services/reminder-service.js';
import { buildCustomRecap } from '../services/custom-recap-service.js';

export const reportsRouter = Router();

function parseOptionalTime(value: string | undefined, label: string): number | null {
  if (!value || !value.trim()) return null;
  const parsed = parseTimeOfDay(value);
  if (!parsed) {
    throw new HttpError(400, `Format ${label} tidak dikenali. Gunakan HH:MM, contoh 07:15.`);
  }
  return parsed.minutes;
}

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
      // Menerima "13", "07:15", "7.15" — lihat server/lib/time.ts.
      hourFrom: z.string().trim().max(10).optional(),
      hourTo: z.string().trim().max(10).optional(),
      category: z
        .enum(['ALL', 'POS_PAGI', 'PENGATURAN', 'PENJAGAAN', 'PENGAWALAN', 'PATROLI', 'PENEGAKKAN', 'LAINNYA'])
        .optional(),
      rosterOnly: z.coerce.boolean().optional()
    })
    .parse(req.query);

  const startMinutes = parseOptionalTime(q.hourFrom, 'jam mulai');
  const endMinutes = parseOptionalTime(q.hourTo, 'jam selesai');
  if (startMinutes !== null && endMinutes !== null && startMinutes > endMinutes) {
    throw new HttpError(400, 'Jam mulai tidak boleh lebih besar dari jam selesai.');
  }

  res.json(
    await buildCustomRecap({
      from: q.from,
      to: q.to ?? q.from,
      startMinutes,
      endMinutes,
      category: q.category,
      rosterOnly: q.rosterOnly
    })
  );
});
