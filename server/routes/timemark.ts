import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import {
  archiveReviewPhotos,
  archiveTimemark,
  deleteTimemark,
  getTimemark,
  ingestTimemark,
  listTimemarks,
  overrideTimemarkTurjawali,
  previewArchiveReview,
  rematchTimemarkQueue,
  restoreArchived,
  unarchiveTimemark,
  updateTimemarkFields
} from '../services/timemark-service.js';
import { getTurjawaliRecap } from '../services/turjawali-recap-service.js';
import {
  TURJAWALI_MATCH_STATUSES,
  TURJAWALI_TYPES
} from '../../shared/types.js';

export const timemarkRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes }
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().max(200).optional(),
  status: z.enum(['all', 'parsed', 'review', 'failed']).optional(),
  turjawaliType: z.enum(['all', ...TURJAWALI_TYPES]).optional(),
  matchStatus: z.enum(['all', ...TURJAWALI_MATCH_STATUSES]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const recapQuerySchema = z.object({
  period: z.enum(['daily', 'weekly']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

timemarkRouter.get('/turjawali-recap', async (req, res) => {
  const query = recapQuerySchema.parse(req.query);
  res.json(await getTurjawaliRecap(query));
});

timemarkRouter.get('/', async (req, res) => {
  const query = querySchema.parse(req.query);
  res.json(await listTimemarks(query));
});

timemarkRouter.post('/rematch', async (req, res) => {
  const body = z
    .object({ scope: z.enum(['unmatched', 'partial', 'both']).optional() })
    .parse(req.body ?? {});
  res.json(await rematchTimemarkQueue(body.scope));
});

timemarkRouter.get('/:id', async (req, res) => {
  const item = await getTimemark(req.params.id);
  if (!item) throw new HttpError(404, 'Foto Timemark tidak ditemukan.');
  res.json(item);
});

timemarkRouter.post('/analyze', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'File gambar wajib diunggah pada field "file".');
  if (!req.file.mimetype.startsWith('image/')) {
    throw new HttpError(415, 'File harus berupa gambar (JPG, PNG, WEBP).');
  }
  const dto = await ingestTimemark({
    buffer: req.file.buffer,
    filename: req.file.originalname,
    mimeType: req.file.mimetype,
    senderName: String(req.body.senderName ?? 'Dashboard'),
    senderNumber: String(req.body.senderNumber ?? 'dashboard'),
    groupName: req.body.groupName ? String(req.body.groupName) : 'Upload Dashboard',
    caption: req.body.caption ? String(req.body.caption) : null,
    source: 'dashboard'
  });
  res.status(201).json({ item: dto, warnings: dto.status === 'review' ? ['Perlu verifikasi manual.'] : [] });
});

timemarkRouter.post('/archive-review/preview', async (req, res) => {
  const body = z
    .object({
      days: z.coerce.number().min(0).max(365).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    })
    .parse(req.body ?? {});
  res.json(await previewArchiveReview(body));
});

timemarkRouter.post('/restore-archived', async (req, res) => {
  const body = z
    .object({
      days: z.coerce.number().min(0).max(365).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    })
    .parse(req.body ?? {});
  res.json(await restoreArchived(body));
});

timemarkRouter.post('/archive-review', async (req, res) => {
  const body = z
    .object({
      days: z.coerce.number().min(0).max(365).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    })
    .parse(req.body ?? {});
  res.json(await archiveReviewPhotos(body));
});

timemarkRouter.post('/:id/archive', async (req, res) => {
  const ok = await archiveTimemark(String(req.params.id));
  if (!ok) throw new HttpError(404, 'Foto Timemark tidak ditemukan.');
  res.json({ status: 'archived' });
});

timemarkRouter.post('/:id/unarchive', async (req, res) => {
  const ok = await unarchiveTimemark(String(req.params.id));
  if (!ok) throw new HttpError(404, 'Foto Timemark tidak ditemukan.');
  res.json({ status: 'review' });
});

timemarkRouter.post('/approve-complete', async (req, res) => {
  const body = z
    .object({ minConfidence: z.coerce.number().min(0).max(100).optional() })
    .parse(req.body ?? {});
  const threshold = body.minConfidence ?? 50;
  // Kriteria sama dengan ingest: jam, tanggal, dan satuan/alamat terisi.
  const candidates = await prisma.timemarkPhoto.findMany({
    where: { status: 'review' },
    select: { id: true, timeText: true, capturedAt: true, unitName: true, address: true, confidence: true }
  });
  const ids = candidates
    .filter(
      (row) =>
        row.timeText &&
        row.capturedAt &&
        (row.unitName || row.address) &&
        (row.confidence ?? 0) >= threshold
    )
    .map((row) => row.id);

  if (ids.length > 0) {
    await prisma.timemarkPhoto.updateMany({
      where: { id: { in: ids } },
      data: { status: 'parsed' }
    });
  }
  res.json({ approved: ids.length, scanned: candidates.length, threshold });
});

timemarkRouter.patch('/:id/turjawali', async (req, res) => {
  const body = z.object({ turjawaliType: z.enum(TURJAWALI_TYPES) }).parse(req.body);
  const item = await overrideTimemarkTurjawali(req.params.id, body.turjawaliType);
  if (!item) throw new HttpError(404, 'Foto Timemark tidak ditemukan.');
  res.json(item);
});

const manualFieldsSchema = z.object({
  timeText: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam harus HH:MM (contoh 07:00).')
    .nullable()
    .optional(),
  capturedAt: z.string().max(40).nullable().optional(),
  unitName: z.string().max(200).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  coordinateText: z.string().max(80).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional()
});

timemarkRouter.patch('/:id', async (req, res) => {
  const body = manualFieldsSchema.parse(req.body ?? {});
  const item = await updateTimemarkFields(String(req.params.id), body);
  if (!item) throw new HttpError(404, 'Foto Timemark tidak ditemukan.');
  res.json(item);
});

timemarkRouter.delete('/:id', async (req, res) => {
  const existing = await getTimemark(req.params.id);
  if (!existing) throw new HttpError(404, 'Foto Timemark tidak ditemukan.');
  await deleteTimemark(req.params.id);
  res.status(204).end();
});
