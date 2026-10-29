import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import sharp from 'sharp';
import { paths } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { recordActivity } from '../lib/activity.js';
import { serializeTimemark, type TimemarkWithSprin } from '../lib/serializers.js';
import { getBotConfig } from './settings.js';
import { extractTimemarkFromFile } from './ocr/timemark-ocr.js';
import { detectSupervision } from './ocr/supervision-detector.js';
import {
  matchTurjawali,
  rematchPendingTimemarks,
  rematchTimemark,
  type RematchSummary,
  type TurjawaliMatchOutcome
} from './ocr/turjawali-matcher.js';
import type { TimemarkDTO, TurjawaliType } from '../../shared/types.js';
import { TURJAWALI_LABELS } from '../../shared/types.js';

export interface TimemarkIngestInput {
  buffer: Buffer;
  filename?: string;
  mimeType: string;
  senderName: string;
  senderNumber: string;
  groupName?: string | null;
  caption?: string | null;
  source?: string;
  messageId?: string | null;
  receivedAt?: Date;
}

interface SavedImage {
  imagePath: string;
  thumbnailPath: string;
  absolutePath: string;
}

async function saveImage(buffer: Buffer): Promise<SavedImage> {
  const metadata = await sharp(buffer).metadata();
  if (!metadata.format) throw new Error('File gambar tidak valid.');
  if ((metadata.width ?? 0) < 120 || (metadata.height ?? 0) < 120) {
    throw new Error('Resolusi gambar terlalu kecil untuk dibaca.');
  }

  const base = `${format(new Date(), 'yyyyMMdd-HHmmss')}-${randomUUID().slice(0, 8)}`;
  const imagePath = `timemark/${base}.jpg`;
  const thumbnailPath = `timemark/${base}-thumb.jpg`;
  const absolutePath = path.join(paths.storage, imagePath);
  const thumbnailAbsolute = path.join(paths.storage, thumbnailPath);

  await Promise.all([
    sharp(buffer)
      .rotate()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90, mozjpeg: true })
      .toFile(absolutePath),
    sharp(buffer)
      .rotate()
      .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(thumbnailAbsolute)
  ]);

  return { imagePath, thumbnailPath, absolutePath };
}

async function findDto(id: string): Promise<TimemarkDTO> {
  const photo = (await prisma.timemarkPhoto.findUniqueOrThrow({
    where: { id },
    include: {
      sprin: { select: { number: true } },
      matchedPersonnel: { select: { id: true, name: true, rankNrp: true, penugasan: true } }
    }
  })) as TimemarkWithSprin;
  return serializeTimemark(photo);
}

const timemarkInclude = {
  sprin: { select: { number: true } },
  matchedPersonnel: { select: { id: true, name: true, rankNrp: true, penugasan: true } }
} as const;

export async function ingestTimemark(input: TimemarkIngestInput): Promise<TimemarkDTO> {
  if (input.messageId) {
    const existing = await prisma.timemarkPhoto.findUnique({
      where: { messageId: input.messageId },
      include: timemarkInclude
    });
    if (existing) return serializeTimemark(existing as TimemarkWithSprin);
  }

  const saved = await saveImage(input.buffer);
  const bot = await getBotConfig();
  let dtoId: string | null = null;
  const receivedAt = input.receivedAt ?? new Date();
  const senderCaption = input.caption ?? null;

  try {
    const result = await extractTimemarkFromFile(saved.absolutePath);
    const extraction = result.extraction;
    const criticalComplete =
      Boolean(extraction.timeText) &&
      Boolean(extraction.capturedAt) &&
      extraction.latitude !== null &&
      extraction.longitude !== null;
    const status =
      extraction.confidence >= bot.minOcrConfidence && criticalComplete ? 'parsed' : 'review';
    const match = await matchTurjawali({
      ocr: extraction,
      senderName: input.senderName,
      senderNumber: input.senderNumber,
      caption: senderCaption,
      receivedAt
    });
    const supervision = await detectSupervision({
      caption: senderCaption,
      ocrText: result.ocrText,
      senderName: input.senderName,
      senderNumber: input.senderNumber
    }).catch(() => null);

    const created = await prisma.timemarkPhoto.create({
      data: {
        source: input.source ?? 'whatsapp',
        messageId: input.messageId ?? null,
        senderName: input.senderName,
        senderNumber: input.senderNumber,
        groupName: input.groupName ?? null,
        imagePath: saved.imagePath,
        thumbnailPath: saved.thumbnailPath,
        mimeType: 'image/jpeg',
        caption: senderCaption,
        senderCaption,
        capturedAt: extraction.capturedAt,
        timeText: extraction.timeText,
        dateText: extraction.dateText,
        address: extraction.address,
        village: extraction.village,
        district: extraction.district,
        regency: extraction.regency,
        province: extraction.province,
        unitName: extraction.unitName,
        latitude: extraction.latitude,
        longitude: extraction.longitude,
        coordinateText: extraction.coordinateText,
        rawText: result.ocrText,
        confidence: extraction.confidence,
        aiUsed: result.aiUsed,
        status,
        turjawaliType: match.classification.type,
        matchStatus: match.matchStatus,
        matchScore: match.matchScore,
        matchedPersonnelId: match.matchedPersonnelId,
        matchNotes: match.matchNotes,
        sprinId: match.sprinId,
        isSupervision: supervision?.isSupervision ?? false,
        supervisorSandi: supervision?.sandi ?? null,
        supervisorName: supervision?.name ?? null,
        supervisorRank: supervision?.rank ?? null,
        supervisorPersonnelId: supervision?.personnelId ?? null,
        createdAt: receivedAt
      }
    });
    dtoId = created.id;

    await recordActivity({
      type: 'timemark',
      title:
        status === 'parsed'
          ? `Foto ${TURJAWALI_LABELS[match.classification.type]} diverifikasi`
          : 'Foto Timemark perlu ditinjau',
      description: `${extraction.unitName ?? input.senderName} · ${extraction.timeText ?? 'jam tidak terbaca'} · ${extraction.address ?? 'alamat tidak terbaca'} · match ${match.matchScore}%`,
      actor: input.senderName,
      entityType: 'timemark',
      entityId: created.id,
      metadata: {
        confidence: extraction.confidence,
        senderNumber: input.senderNumber,
        groupName: input.groupName ?? null,
        turjawaliType: match.classification.type,
        matchStatus: match.matchStatus,
        matchScore: match.matchScore,
        sprinNumber: match.sprinNumber,
        matchedPersonnelId: match.matchedPersonnelId
      }
    });

    return await findDto(created.id);
  } catch (error) {
    logger.error({ err: error }, 'Timemark OCR failed, saving image for manual review');
    let fallbackMatch: TurjawaliMatchOutcome | null = null;
    try {
      fallbackMatch = await matchTurjawali({
        ocr: {},
        senderName: input.senderName,
        senderNumber: input.senderNumber,
        caption: senderCaption,
        receivedAt
      });
    } catch (matchError) {
      logger.debug({ err: matchError }, 'Fallback Turjawali classification failed');
    }
    const supervision = await detectSupervision({
      caption: senderCaption,
      ocrText: '',
      senderName: input.senderName,
      senderNumber: input.senderNumber
    }).catch(() => null);
    const created = await prisma.timemarkPhoto.create({
      data: {
        source: input.source ?? 'whatsapp',
        messageId: input.messageId ?? null,
        senderName: input.senderName,
        senderNumber: input.senderNumber,
        groupName: input.groupName ?? null,
        imagePath: saved.imagePath,
        thumbnailPath: saved.thumbnailPath,
        mimeType: 'image/jpeg',
        caption: senderCaption,
        senderCaption,
        createdAt: receivedAt,
        status: 'failed',
        confidence: 0,
        rawText: error instanceof Error ? error.message : 'OCR gagal',
        turjawaliType: fallbackMatch?.classification.type ?? 'LAINNYA',
        matchStatus: fallbackMatch?.matchStatus ?? 'UNMATCHED',
        matchScore: fallbackMatch?.matchScore ?? 0,
        matchedPersonnelId: fallbackMatch?.matchedPersonnelId ?? null,
        matchNotes: fallbackMatch?.matchNotes ?? 'OCR gagal; matching tidak dapat dijalankan.',
        isSupervision: supervision?.isSupervision ?? false,
        supervisorSandi: supervision?.sandi ?? null,
        supervisorName: supervision?.name ?? null,
        supervisorRank: supervision?.rank ?? null,
        supervisorPersonnelId: supervision?.personnelId ?? null
      }
    });
    dtoId = created.id;
    await recordActivity({
      type: 'timemark_failed',
      title: 'Foto Timemark gagal diproses',
      description: error instanceof Error ? error.message : 'OCR gagal membaca gambar.',
      actor: input.senderName,
      entityType: 'timemark',
      entityId: created.id
    });
    return await findDto(created.id);
  } finally {
    // Keep files for audit; log the resulting record id so uploads remain traceable.
    if (dtoId) logger.debug({ timemarkId: dtoId }, 'Timemark ingest finished');
  }
}

export async function listTimemarks(options: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  turjawaliType?: string;
  matchStatus?: string;
  from?: string;
  to?: string;
}): Promise<{ items: TimemarkDTO[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 24));
  const where: Record<string, unknown> = {};
  if (options.status && options.status !== 'all') where.status = options.status;
  if (options.turjawaliType && options.turjawaliType !== 'all') {
    where.turjawaliType = options.turjawaliType;
  }
  if (options.matchStatus && options.matchStatus !== 'all') {
    where.matchStatus = options.matchStatus;
  }
  if (options.search) {
    where.OR = [
      { senderName: { contains: options.search } },
      { unitName: { contains: options.search } },
      { address: { contains: options.search } },
      { groupName: { contains: options.search } },
      { senderCaption: { contains: options.search } },
      { matchNotes: { contains: options.search } }
    ];
  }
  if (options.from || options.to) {
    where.capturedAt = {
      ...(options.from ? { gte: new Date(`${options.from}T00:00:00`) } : {}),
      ...(options.to ? { lte: new Date(`${options.to}T23:59:59`) } : {})
    };
  }

  const [total, rows] = await Promise.all([
    prisma.timemarkPhoto.count({ where }),
    prisma.timemarkPhoto.findMany({
      where,
      include: timemarkInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);

  return {
    items: rows.map((row) => serializeTimemark(row as TimemarkWithSprin)),
    total,
    page,
    pageSize
  };
}

export async function getTimemark(id: string): Promise<TimemarkDTO | null> {
  const photo = await prisma.timemarkPhoto.findUnique({
    where: { id },
    include: timemarkInclude
  });
  return photo ? serializeTimemark(photo as TimemarkWithSprin) : null;
}

export interface TimemarkManualFields {
  timeText?: string | null;
  capturedAt?: string | null;
  unitName?: string | null;
  address?: string | null;
  coordinateText?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Koreksi manual hasil OCR oleh admin. Jam & tanggal yang dikoreksi dipakai
 * untuk rekap dan pencocokan Sprin, jadi setelah disimpan foto di-rematch dan
 * status `review` bisa berubah menjadi `parsed`.
 */
export async function updateTimemarkFields(
  id: string,
  input: TimemarkManualFields
): Promise<TimemarkDTO | null> {
  const existing = await prisma.timemarkPhoto.findUnique({ where: { id } });
  if (!existing) return null;

  const data: Record<string, unknown> = {};

  if (input.timeText !== undefined) {
    const time = (input.timeText ?? '').trim();
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw new Error('Format jam harus HH:MM (contoh 07:00).');
    }
    data.timeText = time || null;
  }

  if (input.capturedAt !== undefined) {
    if (input.capturedAt) {
      const parsed = new Date(input.capturedAt);
      if (Number.isNaN(parsed.getTime())) throw new Error('Tanggal tidak valid.');
      data.capturedAt = parsed;
      data.dateText = format(parsed, 'EEEE, dd/MM/yyyy', { locale: localeId });
    } else {
      data.capturedAt = null;
    }
  }

  for (const key of ['unitName', 'address', 'coordinateText'] as const) {
    if (input[key] !== undefined) {
      const value = (input[key] ?? '').trim();
      data[key] = value || null;
    }
  }
  for (const key of ['latitude', 'longitude'] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }

  const nextTime = (data.timeText as string | null | undefined) ?? existing.timeText;
  const nextDate =
    (data.capturedAt as Date | null | undefined) ?? existing.capturedAt;
  if (nextTime && nextDate) data.status = 'parsed';

  await prisma.timemarkPhoto.update({ where: { id }, data });

  // Jam/tanggal memengaruhi kecocokan Sprin & status review.
  await rematchTimemark(id).catch((error) =>
    logger.warn({ err: error }, 'Rematch setelah koreksi manual gagal')
  );
  // Koreksi jam/tanggal TIDAK boleh mengubah kategori yang sudah dipilih admin.
  await prisma.timemarkPhoto.update({
    where: { id },
    data: { turjawaliType: existing.turjawaliType }
  });

  await recordActivity({
    type: 'timemark_corrected',
    title: 'Data Timemark dikoreksi manual',
    description: `${existing.senderName} · ${nextTime ?? 'jam kosong'} · ${existing.unitName ?? 'satuan kosong'}`,
    actor: 'Dashboard',
    entityType: 'timemark',
    entityId: id,
    metadata: { fields: Object.keys(data) }
  });

  return getTimemark(id);
}

export async function overrideTimemarkTurjawali(
  id: string,
  turjawaliType: TurjawaliType
): Promise<TimemarkDTO | null> {
  const existing = await prisma.timemarkPhoto.findUnique({ where: { id } });
  if (!existing) return null;
  await rematchTimemark(id, turjawaliType);
  // Pilihan operator selalu menang (termasuk 'LAINNYA'), agar dropdown tidak terasa
  // 'tidak merespons' saat mesin cocok mengembalikan kategori lain.
  await prisma.timemarkPhoto.update({ where: { id }, data: { turjawaliType } });
  await recordActivity({
    type: 'timemark_override',
    title: `Kategori Turjawali dikoreksi: ${TURJAWALI_LABELS[turjawaliType]}`,
    description: `${existing.senderName} · ${existing.timeText ?? 'jam tidak terbaca'}`,
    actor: 'Dashboard',
    entityType: 'timemark',
    entityId: id,
    metadata: { previousType: existing.turjawaliType, turjawaliType }
  });
  return getTimemark(id);
}

export async function rematchTimemarkQueue(scope: 'unmatched' | 'partial' | 'both' = 'both'): Promise<RematchSummary> {
  const summary = await rematchPendingTimemarks({ scope, limit: 200 });
  await recordActivity({
    type: 'timemark_rematch',
    title: 'Pencocokan ulang Turjawali dijalankan',
    description: `${summary.processed} foto diproses · ${summary.matched} matched · ${summary.partial} partial · ${summary.unmatched} unmatched`,
    actor: 'Dashboard',
    entityType: 'timemark',
    metadata: { ...summary }
  });
  return summary;
}

export async function deleteTimemark(id: string): Promise<void> {
  const photo = await prisma.timemarkPhoto.findUnique({ where: { id } });
  if (!photo) return;
  await prisma.timemarkPhoto.delete({ where: { id } });
  await Promise.all([
    fs.unlink(path.join(paths.storage, photo.imagePath)).catch(() => undefined),
    photo.thumbnailPath
      ? fs.unlink(path.join(paths.storage, photo.thumbnailPath)).catch(() => undefined)
      : Promise.resolve()
  ]);
}
