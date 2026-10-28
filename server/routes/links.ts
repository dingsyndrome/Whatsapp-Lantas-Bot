import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { deleteLink, getLinkSummary, listLinks, revalidateLink } from '../services/link-service.js';

export const linksRouter = Router();

linksRouter.get('/summary', async (_req, res) => {
  res.json(await getLinkSummary());
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
