import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { getSettings, updateSettings } from '../services/settings.js';
import { rescheduleDailyRecap } from '../services/scheduler-service.js';
import { whatsappManager } from '../services/whatsapp-manager.js';

export const settingsRouter = Router();

const keywordSchema = z
  .object({
    PENGATURAN: z.array(z.string().min(1).max(80)).max(80),
    PENJAGAAN: z.array(z.string().min(1).max(80)).max(80),
    PENGAWALAN: z.array(z.string().min(1).max(80)).max(80),
    PATROLI: z.array(z.string().min(1).max(80)).max(80),
    PENEGAKKAN: z.array(z.string().min(1).max(80)).max(80)
  })
  .strict();

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const settingsSchema = z.object({
  botName: z.string().min(1).max(120).optional(),
  waDriver: z.enum(['mock', 'webjs', 'baileys']).optional(),
  autoReplyEnabled: z.boolean().optional(),
  autoReplyTemplate: z.string().max(10_000).optional(),
  timemarkPrompt: z.string().max(30_000).optional(),
  documentPrompt: z.string().max(30_000).optional(),
  aiEnabled: z.boolean().optional(),
  aiBaseUrl: z.string().url().max(500).optional(),
  aiApiKey: z.string().max(500).optional(),
  aiModel: z.string().min(1).max(120).optional(),
  scheduleEnabled: z.boolean().optional(),
  scheduleTime: timeSchema.optional(),
  scheduleTimezone: z.string().min(1).max(80).optional(),
  scheduleGroupJid: z.string().max(200).optional(),
  scheduleGroupName: z.string().max(200).optional(),
  minOcrConfidence: z.number().int().min(0).max(100).optional(),
  turjawaliMatchingEnabled: z.boolean().optional(),
  turjawaliKeywords: keywordSchema.optional(),
  gaturMorningStart: timeSchema.optional(),
  gaturMorningEnd: timeSchema.optional(),
  gaturEveningStart: timeSchema.optional(),
  gaturEveningEnd: timeSchema.optional(),
  patrolNightStart: timeSchema.optional(),
  patrolNightEnd: timeSchema.optional(),
  matchTimeToleranceMinutes: z.number().int().min(0).max(720).optional(),
  matchLocationRadiusMeters: z.number().int().min(25).max(50_000).optional()
});

settingsRouter.get('/', async (_req, res) => {
  res.json(await getSettings());
});

settingsRouter.put('/', async (req, res) => {
  const before = await getSettings();
  const body = settingsSchema.parse(req.body);
  const settings = await updateSettings(body);
  await rescheduleDailyRecap();
  if (before.waDriver !== settings.waDriver) {
    await whatsappManager.reflectConfig();
  }
  res.json(settings);
});

const groupSchema = z.object({
  jid: z.string().min(5).max(200),
  name: z.string().min(1).max(160)
});

settingsRouter.post('/groups', async (req, res) => {
  const body = groupSchema.parse(req.body);
  if (!body.jid.endsWith('@g.us') && !/^\d{10,}$/.test(body.jid)) {
    throw new HttpError(400, 'JID grup tidak valid. Gunakan format 1203...@g.us.');
  }
  const group = await prisma.monitoredGroup.upsert({
    where: { jid: body.jid },
    create: { jid: body.jid, name: body.name, active: true },
    update: { name: body.name, active: true }
  });
  res.status(201).json(group);
});

settingsRouter.patch('/groups/:id', async (req, res) => {
  const body = z
    .object({ name: z.string().min(1).max(160).optional(), active: z.boolean().optional() })
    .parse(req.body);
  const existing = await prisma.monitoredGroup.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new HttpError(404, 'Grup tidak ditemukan.');
  const group = await prisma.monitoredGroup.update({
    where: { id: req.params.id },
    data: body
  });
  res.json(group);
});

settingsRouter.delete('/groups/:id', async (req, res) => {
  const existing = await prisma.monitoredGroup.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new HttpError(404, 'Grup tidak ditemukan.');
  await prisma.monitoredGroup.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
