import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { parseTimeOfDay } from '../lib/time.js';
import { deleteLink, getLinkSummary, listLinks, revalidateLink } from '../services/link-service.js';
import {
  buildLinkRecap,
  sendLinkRecapToGroup,
  type LinkRecapParams
} from '../services/link-recap-service.js';

export const linksRouter = Router();

const recapQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Menerima "8", "08:20", "08.20" — lihat server/lib/time.ts.
  hourFrom: z.string().trim().max(10).optional(),
  hourTo: z.string().trim().max(10).optional(),
  platform: z.string().max(80).optional(),
  status: z.enum(['all', 'valid', 'invalid', 'restricted', 'unchecked']).optional(),
  search: z.string().max(200).optional()
});

type RecapQuery = z.infer<typeof recapQuerySchema>;

function parseOptionalTime(value: string | undefined, label: string): number | null {
  if (!value || !value.trim()) return null;
  const parsed = parseTimeOfDay(value);
  if (!parsed) {
    throw new HttpError(400, `Format ${label} tidak dikenali. Gunakan HH:MM, contoh 08:20.`);
  }
  return parsed.minutes;
}

function toRecapParams(input: RecapQuery): LinkRecapParams {
  const from = input.from;
  const to = input.to ?? from;
  if (from > to) {
    throw new HttpError(400, 'Tanggal mulai tidak boleh lebih besar dari tanggal selesai.');
  }
  const startMinutes = parseOptionalTime(input.hourFrom, 'jam mulai');
  const endMinutes = parseOptionalTime(input.hourTo, 'jam selesai');
  if (startMinutes !== null && endMinutes !== null && startMinutes > endMinutes) {
    throw new HttpError(400, 'Jam mulai tidak boleh lebih besar dari jam selesai.');
  }
  return {
    from,
    to,
    startMinutes,
    endMinutes,
    platform: input.platform,
    status: input.status,
    search: input.search
  };
}

linksRouter.get('/summary', async (_req, res) => {
  res.json(await getLinkSummary());
});

linksRouter.get('/recap', async (req, res) => {
  const query = recapQuerySchema.parse(req.query);
  res.json(await buildLinkRecap(toRecapParams(query)));
});

linksRouter.post('/recap/send', async (req, res) => {
  const body = recapQuerySchema
    .extend({ groupJid: z.string().max(200).optional() })
    .parse(req.body ?? {});
  const result = await sendLinkRecapToGroup(toRecapParams(body), body.groupJid);
  res.json({ ...result.recap, sent: result.sent, target: result.target, reason: result.reason });
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  search: z.string().max(200).optional(),
  platform: z.string().max(80).optional(),
  status: z.enum(['all', 'valid', 'invalid', 'restricted', 'unchecked']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

linksRouter.get('/', async (req, res) => {
  const query = querySchema.parse(req.query);
  res.json(await listLinks(query));
});

linksRouter.post('/:id/validate', async (req, res) => {
  const item = await revalidateLink(req.params.id);
  if (!item) throw new HttpError(404, 'Link tidak ditemukan.');
  res.json(item);
});

linksRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteLink(req.params.id);
  if (!deleted) throw new HttpError(404, 'Link tidak ditemukan.');
  res.status(204).end();
});
