import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { HttpError } from '../lib/http-error.js';
import {
  importPosPagiWorkbook,
  listPosPagi,
  setPosPagiAssignmentPersonnel,
  updatePosPagiPost
} from '../services/pos-pagi-service.js';

export const posPagiRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes }
});

posPagiRouter.get('/', async (_req, res) => {
  res.json(await listPosPagi());
});

posPagiRouter.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Berkas POS PAGI wajib diunggah pada field "file".');
  const result = await importPosPagiWorkbook({
    buffer: req.file.buffer,
    filename: req.file.originalname
  });
  res.status(201).json(result);
});

const assignmentBody = z.object({
  personnelId: z.string().trim().min(1).nullable()
});

posPagiRouter.patch('/assignments/:id', async (req, res) => {
  const body = assignmentBody.parse(req.body);
  res.json(await setPosPagiAssignmentPersonnel(req.params.id!, body.personnelId));
});

const postBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  radiusMeters: z.number().int().min(5).max(5000).optional(),
  active: z.boolean().optional()
});

posPagiRouter.patch('/:id', async (req, res) => {
  const body = postBody.parse(req.body);
  res.json(await updatePosPagiPost(req.params.id!, body));
});
