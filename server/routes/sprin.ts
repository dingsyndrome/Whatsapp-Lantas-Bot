import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http-error.js';
import { TURJAWALI_TYPES } from '../../shared/types.js';
import { findPhone, normalizePhone } from '../lib/phone.js';
import {
  createManualSprin,
  deleteSprin,
  getSprin,
  importSprinPersonnel,
  ingestSprin,
  listSprins,
  updateSprinStatus
} from '../services/sprin-service.js';
import {
  autoNotifySprin,
  previewSprinNotification,
  saveSprinNotificationDraft,
  sendSprinNotification
} from '../services/sprin-notify-service.js';

export const sprinRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes }
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().max(200).optional(),
  status: z.enum(['all', 'active', 'completed', 'archived']).optional(),
  notify: z.enum(['all', 'review', 'sent']).optional()
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
  void autoNotifySprin(result.sprin.id);
});

sprinRouter.patch('/:id/status', async (req, res) => {
  const body = z.object({ status: z.enum(['active', 'completed', 'archived']) }).parse(req.body);
  const item = await updateSprinStatus(req.params.id, body.status);
  if (!item) throw new HttpError(404, 'Surat Perintah tidak ditemukan.');
  res.json(item);
});

const manualSprinSchema = z.object({
  number: z.string().min(3).max(120),
  about: z.string().max(2000).optional().nullable(),
  dasar: z.string().max(4000).optional().nullable(),
  untuk: z.string().max(4000).optional().nullable(),
  activityDate: z.string().max(40).optional().nullable(),
  timeText: z.string().max(40).optional().nullable(),
  place: z.string().max(500).optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  signatory: z.string().max(200).optional().nullable(),
  signatoryRank: z.string().max(60).optional().nullable(),
  turjawaliType: z
    .enum(TURJAWALI_TYPES)
    .optional()
    .nullable(),
  status: z.enum(['active', 'completed', 'archived']).optional()
});

sprinRouter.post('/manual', async (req, res) => {
  const body = manualSprinSchema.parse(req.body);
  res.status(201).json(await createManualSprin(body));
});

sprinRouter.post('/:id/personnel/import', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Berkas personel wajib diunggah pada field "file".');
  const sprinId = String(req.params.id);
  const result = await importSprinPersonnel(sprinId, {
    buffer: req.file.buffer,
    filename: req.file.originalname,
    mimeType: req.file.mimetype,
    mode: req.body?.mode === 'append' ? 'append' : 'replace'
  });
  if (!result) throw new HttpError(404, 'Surat Perintah tidak ditemukan.');
  res.status(201).json(result);
  void autoNotifySprin(sprinId);
});

const notifySchema = z.object({
  functionCodes: z.array(z.string().min(2).max(32)).max(30).optional(),
  excludePerwira: z.boolean().optional(),
  template: z.string().max(20_000).optional(),
  overrides: z.record(z.string().min(1).max(64), z.string().max(10_000)).optional(),
  force: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  confirmReview: z.boolean().optional(),
  reviewNote: z.string().max(2000).optional()
});

sprinRouter.post('/:id/notify/preview', async (req, res) => {
  const body = notifySchema.parse(req.body ?? {});
  const result = await previewSprinNotification(String(req.params.id), {
    ...body,
    persist: false
  });
  if (!result) throw new HttpError(404, 'Surat Perintah tidak ditemukan.');
  res.json(result);
});

sprinRouter.post('/:id/notify/draft', async (req, res) => {
  const body = notifySchema.parse(req.body ?? {});
  const result = await saveSprinNotificationDraft(String(req.params.id), {
    ...body,
    actor: 'Dashboard'
  });
  if (!result) throw new HttpError(404, 'Surat Perintah tidak ditemukan.');
  res.json(result);
});

sprinRouter.patch('/:id/personnel/:personnelId', async (req, res) => {
  const body = z
    .object({ phone: z.string().max(20).nullable() })
    .parse(req.body ?? {});
  const phone = body.phone ? normalizePhone(body.phone) : null;
  if (body.phone && !phone) throw new HttpError(400, 'Nomor HP tidak valid.');
  const updated = await prisma.sprinPersonnel.update({
    where: { id: String(req.params.personnelId) },
    data: { phone }
  });
  res.json({ id: updated.id, phone: updated.phone });
});

sprinRouter.get('/:id/personnel-phones', async (req, res) => {
  const sprin = await prisma.sprin.findUnique({
    where: { id: String(req.params.id) },
    include: { personnel: { orderBy: [{ page: 'asc' }, { no: 'asc' }] } }
  });
  if (!sprin) throw new HttpError(404, 'Surat Perintah tidak ditemukan.');
  res.json(
    sprin.personnel.map((person) => ({
      no: person.no,
      name: person.name,
      rank: person.rank,
      ket: person.ket,
      phone: person.phone,
      detected: findPhone(person.ket) ?? findPhone(person.rawText),
      rawText: person.rawText.slice(0, 300)
    }))
  );
});

sprinRouter.post('/:id/notify', async (req, res) => {
  const body = notifySchema.parse(req.body ?? {});
  const result = await sendSprinNotification(String(req.params.id), {
    ...body,
    actor: 'Dashboard'
  });
  if (!result) throw new HttpError(404, 'Surat Perintah tidak ditemukan.');
  res.json(result);
});

sprinRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteSprin(String(req.params.id));
  if (!deleted) throw new HttpError(404, 'Surat Perintah tidak ditemukan.');
  res.status(204).end();
});
