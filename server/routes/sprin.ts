import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { HttpError } from '../lib/http-error.js';
import { getSprin, ingestSprin, listSprins, updateSprinStatus } from '../services/sprin-service.js';

export const sprinRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes }
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().max(200).optional(),
  status: z.enum(['all', 'active', 'completed', 'archived']).optional()
});

sprinRouter.get('/', async (req, res) => {
  const query = querySchema.parse(req.query);
  res.json(await listSprins(query));
});

sprinRouter.get('/:id', async (req, res) => {
  const item = await getSprin(req.params.id);
  if (!item) throw new HttpError(404, 'Surat Perintah tidak ditemukan.');
  res.json(item);
});

sprinRouter.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Dokumen wajib diunggah pada field "file".');
  const lower = req.file.originalname.toLowerCase();
  const valid =
    lower.endsWith('.pdf') ||
    lower.endsWith('.docx') ||
    req.file.mimetype === 'application/pdf' ||
    req.file.mimetype.includes('wordprocessingml');
  if (!valid) throw new HttpError(415, 'Format harus PDF atau DOCX.');
  const result = await ingestSprin({
    buffer: req.file.buffer,
    filename: req.file.originalname,
    mimeType: req.file.mimetype,
    source: 'dashboard',
    senderName: String(req.body.senderName ?? 'Dashboard'),
    senderNumber: String(req.body.senderNumber ?? 'dashboard')
  });
  res.status(201).json(result);
});

sprinRouter.patch('/:id/status', async (req, res) => {
  const body = z.object({ status: z.enum(['active', 'completed', 'archived']) }).parse(req.body);
  const item = await updateSprinStatus(req.params.id, body.status);
  if (!item) throw new HttpError(404, 'Surat Perintah tidak ditemukan.');
  res.json(item);
});
