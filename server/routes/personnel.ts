import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { HttpError } from '../lib/http-error.js';
import {
  getSandiMapDTO,
  importPersonnelRoster,
  listPersonnel,
  saveSandiMap
} from '../services/personnel-service.js';

export const personnelRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes }
});

const listQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  search: z.string().max(200).optional(),
  category: z.enum(['all', 'PERWIRA', 'PJU', 'ANGGOTA']).optional()
});

personnelRouter.get('/', async (req, res) => {
  res.json(await listPersonnel(listQuery.parse(req.query)));
});

personnelRouter.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Berkas personel wajib diunggah pada field "file".');
  const result = await importPersonnelRoster({
    buffer: req.file.buffer,
    filename: req.file.originalname,
    mimeType: req.file.mimetype,
    mode: req.body?.mode === 'append' ? 'append' : 'replace'
  });
  res.status(201).json(result);
});

personnelRouter.get('/sandi', async (_req, res) => {
  res.json(await getSandiMapDTO());
});

const sandiBody = z.object({
  map: z.record(z.string(), z.string().nullable())
});

personnelRouter.put('/sandi', async (req, res) => {
  const body = sandiBody.parse(req.body);
  res.json(await saveSandiMap(body.map));
});
