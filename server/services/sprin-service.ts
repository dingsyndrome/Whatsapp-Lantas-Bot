import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { format } from 'date-fns';
import type { Prisma } from '@prisma/client';
import { paths } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { recordActivity } from '../lib/activity.js';
import {
  serializeSprin,
  type SprinWithCounts,
  type SprinWithPersonnel
} from '../lib/serializers.js';
import { parseSprinDocument } from './documents/sprin-reader.js';
import { isPersonnelSheet, parsePersonnelSheet } from './documents/personnel-sheet.js';
import type { ParsedPersonnel, ParsedSprinDocument } from './documents/types.js';
import { getBotConfig, getTurjawaliRules } from './settings.js';
import { classifySprinTurjawali } from './ocr/turjawali-matcher.js';
import type { SprinDTO, TurjawaliType } from '../../shared/types.js';

export class SprinValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SprinValidationError';
  }
}

export interface SprinIngestInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  source?: string;
  senderName?: string | null;
  senderNumber?: string | null;
}

const includeCounts = {
  _count: { select: { personnel: true, links: true, timemarks: true } }
} satisfies Prisma.SprinInclude;

async function saveDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<{ filePath: string; absolutePath: string; fileName: string; mimeType: string }> {
  const lower = filename.toLowerCase();
  const isPdf = lower.endsWith('.pdf') || mimeType.includes('pdf');
  const isDocx = lower.endsWith('.docx') || mimeType.includes('wordprocessingml');
  if (!isPdf && !isDocx) {
    throw new SprinValidationError('Hanya dokumen PDF atau DOCX yang didukung.');
  }
  const extension = isPdf ? 'pdf' : 'docx';
  const safeName = path
    .basename(filename)
    .replace(/[^\w.\- ()\[\]]+/g, '_')
    .slice(0, 120);
  const storedName = `${format(new Date(), 'yyyyMMdd-HHmmss')}-${randomUUID().slice(0, 8)}.${extension}`;
  const relative = `sprin/${storedName}`;
  const absolutePath = path.join(paths.storage, relative);
  await fs.writeFile(absolutePath, buffer);
  return {
    filePath: relative,
    absolutePath,
    fileName: safeName || `dokumen-sprin.${extension}`,
    mimeType: isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
}

function personnelCreateData(parsed: ParsedSprinDocument) {
  return parsed.personnel.map((person) => ({
    no: person.no,
    name: person.name,
    rankNrp: person.rankNrp,
    rank: person.rank,
    nrp: person.nrp,
    jabatan: person.jabatan,
    penugasan: person.penugasan,
    ket: person.ket,
    page: person.page,
    rawText: person.rawText
  }));
}

export async function ingestSprin(input: SprinIngestInput): Promise<{
  sprin: SprinDTO;
  created: boolean;
  warnings: string[];
  pageCount: number;
  aiUsed: boolean;
}> {
  const parsed = await parseSprinDocument(input.buffer, input.filename, input.mimeType);
  if (!parsed.number) {
    throw new SprinValidationError(
      'Nomor Sprin tidak terdeteksi. Pastikan dokumen memuat baris "Nomor: Sprin/.../...".'
    );
  }

  const saved = await saveDocument(input.buffer, input.filename, input.mimeType);
  const bot = await getBotConfig();
  const turjawali = classifySprinTurjawali(parsed, getTurjawaliRules(bot));
  const existing = await prisma.sprin.findUnique({
    where: { number: parsed.number },
    include: { personnel: true }
  });

  try {
    if (existing) {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.sprinPersonnel.deleteMany({ where: { sprinId: existing.id } });
        return tx.sprin.update({
          where: { id: existing.id },
          data: {
            about: parsed.about,
            dasar: parsed.dasar,
            untuk: parsed.untuk,
            activityDate: parsed.activityDate,
            timeText: parsed.timeText,
            place: parsed.place,
            latitude: parsed.latitude,
            longitude: parsed.longitude,
            signatory: parsed.signatory,
            signatoryRank: parsed.signatoryRank,
            filePath: saved.filePath,
            fileName: saved.fileName,
            mimeType: saved.mimeType,
            rawText: parsed.rawText,
            source: input.source ?? 'manual_upload',
            turjawaliType: turjawali.type,
            personnel: { create: personnelCreateData(parsed) }
          },
          include: {
            ...includeCounts,
            personnel: { orderBy: [{ page: 'asc' }, { no: 'asc' }] }
          }
        });
      });

      if (existing.filePath) {
        await fs.unlink(path.join(paths.storage, existing.filePath)).catch(() => undefined);
      }

      await recordActivity({
        type: 'sprin_updated',
        title: 'Data Sprin diperbarui',
        description: `${parsed.number} · ${parsed.about ?? 'tanpa perihal'} · ${turjawali.type}`,
        actor: input.senderName ?? 'Dashboard',
        entityType: 'sprin',
        entityId: updated.id,
        metadata: { personnel: parsed.personnel.length, turjawaliType: turjawali.type }
      });

      return {
        sprin: serializeSprin(updated as SprinWithPersonnel),
        created: false,
        warnings: parsed.warnings,
        pageCount: parsed.pageCount,
        aiUsed: parsed.aiUsed
      };
    }

    const created = await prisma.sprin.create({
      data: {
        number: parsed.number,
        about: parsed.about,
        dasar: parsed.dasar,
        untuk: parsed.untuk,
        activityDate: parsed.activityDate,
        timeText: parsed.timeText,
        place: parsed.place,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        signatory: parsed.signatory,
        signatoryRank: parsed.signatoryRank,
        filePath: saved.filePath,
        fileName: saved.fileName,
        mimeType: saved.mimeType,
        source: input.source ?? 'manual_upload',
        rawText: parsed.rawText,
        status: 'active',
        turjawaliType: turjawali.type,
        personnel: { create: personnelCreateData(parsed) }
      },
      include: {
        ...includeCounts,
        personnel: { orderBy: [{ page: 'asc' }, { no: 'asc' }] }
      }
    });

    await recordActivity({
      type: 'sprin',
      title: 'Surat Perintah baru diproses',
      description: `${parsed.number} · ${parsed.personnel.length} personel · ${turjawali.type}`,
      actor: input.senderName ?? 'Dashboard',
      entityType: 'sprin',
      entityId: created.id,
      metadata: { pageCount: parsed.pageCount, aiUsed: parsed.aiUsed, turjawaliType: turjawali.type }
    });

    return {
      sprin: serializeSprin(created as SprinWithPersonnel),
      created: true,
      warnings: parsed.warnings,
      pageCount: parsed.pageCount,
      aiUsed: parsed.aiUsed
    };
  } catch (error) {
    await fs.unlink(saved.absolutePath).catch(() => undefined);
    throw error;
  }
}

export async function listSprins(options: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: SprinDTO[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
  const where: Prisma.SprinWhereInput = {};
  if (options.status && options.status !== 'all') where.status = options.status;
  if (options.search) {
    where.OR = [
      { number: { contains: options.search } },
      { about: { contains: options.search } },
      { place: { contains: options.search } },
      { signatory: { contains: options.search } }
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.sprin.count({ where }),
    prisma.sprin.findMany({
      where,
      include: includeCounts,
      orderBy: [{ activityDate: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);
  return {
    items: rows.map((row) => serializeSprin(row as SprinWithCounts)),
    total,
    page,
    pageSize
  };
}

export async function getSprin(id: string): Promise<SprinDTO | null> {
  const row = await prisma.sprin.findUnique({
    where: { id },
    include: {
      ...includeCounts,
      personnel: { orderBy: [{ page: 'asc' }, { no: 'asc' }] }
    }
  });
  return row ? serializeSprin(row as SprinWithPersonnel) : null;
}

export interface ManualSprinInput {
  number: string;
  about?: string | null;
  dasar?: string | null;
  untuk?: string | null;
  activityDate?: string | Date | null;
  timeText?: string | null;
  place?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  signatory?: string | null;
  signatoryRank?: string | null;
  turjawaliType?: TurjawaliType | null;
  status?: string;
}

/**
 * Membuat/menyegarkan header Sprin tanpa dokumen. Berguna saat daftar personel
 * hanya tersedia dalam bentuk Excel/CSV, sehingga Sprin dibuat manual lalu
 * personelnya diimpor.
 */
export async function createManualSprin(input: ManualSprinInput): Promise<{
  sprin: SprinDTO;
  created: boolean;
}> {
  const number = input.number?.trim();
  if (!number) {
    throw new SprinValidationError('Nomor Surat Perintah wajib diisi.');
  }
  if (!/^[A-Za-z0-9./\-\s]{3,120}$/.test(number)) {
    throw new SprinValidationError('Nomor Surat Perintah mengandung karakter yang tidak diperbolehkan.');
  }

  const bot = await getBotConfig();
  const turjawaliType =
    input.turjawaliType && input.turjawaliType !== 'LAINNYA'
      ? input.turjawaliType
      : classifySprinTurjawali(
          { about: input.about ?? null, untuk: input.untuk ?? null, dasar: input.dasar ?? null },
          getTurjawaliRules(bot)
        ).type;

  const activityDate =
    input.activityDate instanceof Date
      ? input.activityDate
      : input.activityDate
        ? new Date(input.activityDate)
        : null;
  if (activityDate && Number.isNaN(activityDate.getTime())) {
    throw new SprinValidationError('Tanggal pelaksanaan tidak valid.');
  }

  const data = {
    number,
    about: input.about?.trim() || null,
    dasar: input.dasar?.trim() || null,
    untuk: input.untuk?.trim() || null,
    activityDate,
    timeText: input.timeText?.trim() || null,
    place: input.place?.trim() || null,
    latitude: typeof input.latitude === 'number' ? input.latitude : null,
    longitude: typeof input.longitude === 'number' ? input.longitude : null,
    signatory: input.signatory?.trim() || null,
    signatoryRank: input.signatoryRank?.trim() || null,
    turjawaliType,
    source: 'manual',
    status: input.status && ['active', 'completed', 'archived'].includes(input.status) ? input.status : 'active'
  };

  const existing = await prisma.sprin.findUnique({ where: { number } });

  const saved = existing
    ? await prisma.sprin.update({
        where: { id: existing.id },
        data,
        include: {
          ...includeCounts,
          personnel: { orderBy: [{ page: 'asc' }, { no: 'asc' }] }
        }
      })
    : await prisma.sprin.create({
        data,
        include: {
          ...includeCounts,
          personnel: { orderBy: [{ page: 'asc' }, { no: 'asc' }] }
        }
      });

  await recordActivity({
    type: existing ? 'sprin_updated' : 'sprin_created',
    title: existing ? 'Header Sprin diperbarui manual' : 'Sprin dibuat manual',
    description: `${number} · ${data.about ?? 'tanpa perihal'} · ${turjawaliType}`,
    actor: 'Dashboard',
    entityType: 'sprin',
    entityId: saved.id
  });

  return { sprin: serializeSprin(saved as SprinWithPersonnel), created: !existing };
}

export interface PersonnelImportInput {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
  mode?: 'replace' | 'append';
}

export async function importSprinPersonnel(
  sprinId: string,
  input: PersonnelImportInput
): Promise<{
  personnelCount: number;
  imported: number;
  rows: number;
  skipped: number;
  warnings: string[];
  sheetName: string;
  mappedColumns: string[];
  mode: 'replace' | 'append';
} | null> {
  const sprin = await prisma.sprin.findUnique({ where: { id: sprinId } });
  if (!sprin) return null;
  if (!isPersonnelSheet(input.filename, input.mimeType)) {
    throw new SprinValidationError('Format berkas personel harus XLSX atau CSV.');
  }

  const mode: 'replace' | 'append' = input.mode === 'append' ? 'append' : 'replace';
  const sheet = await parsePersonnelSheet(input.buffer, input.filename, input.mimeType);

  const toCreate = (people: ParsedPersonnel[]) =>
    people.map((person) => ({
      no: person.no,
      name: person.name,
      rankNrp: person.rankNrp,
      rank: person.rank,
      nrp: person.nrp,
      jabatan: person.jabatan,
      penugasan: person.penugasan,
      ket: person.ket,
      page: person.page,
      rawText: person.rawText
    }));

  let imported: number;

  if (mode === 'replace') {
    imported = sheet.personnel.length;
    await prisma.$transaction(async (tx) => {
      await tx.sprinPersonnel.deleteMany({ where: { sprinId } });
      await tx.sprinPersonnel.createMany({
        data: toCreate(sheet.personnel).map((row) => ({ ...row, sprinId }))
      });
    });
  } else {
    const existing = await prisma.sprinPersonnel.findMany({ where: { sprinId } });
    const seen = new Set(
      existing.map((row) => `${row.name.toUpperCase()}::${row.nrp ?? row.rankNrp ?? ''}`)
    );
    const nextNo = existing.reduce((max, row) => Math.max(max, row.no), 0);
    const fresh = sheet.personnel.filter((person) => {
      const key = `${person.name.toUpperCase()}::${person.nrp ?? person.rankNrp ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    imported = fresh.length;
    if (fresh.length > 0) {
      await prisma.sprinPersonnel.createMany({
        data: toCreate(fresh).map((row, index) => ({ ...row, no: nextNo + index + 1, sprinId }))
      });
    }
  }

  const personnelCount = await prisma.sprinPersonnel.count({ where: { sprinId } });

  await recordActivity({
    type: 'sprin_personnel_import',
    title: 'Personel Sprin diimpor',
    description: `${sprin.number} · ${imported} baris (${mode === 'replace' ? 'ganti' : 'tambah'}) dari ${sheet.sheetName}`,
    actor: 'Dashboard',
    entityType: 'sprin',
    entityId: sprinId,
    metadata: { imported, skipped: sheet.skipped, mode }
  });

  return {
    personnelCount,
    imported,
    rows: sheet.rows,
    skipped: sheet.skipped,
    warnings: sheet.warnings,
    sheetName: sheet.sheetName,
    mappedColumns: sheet.mappedColumns,
    mode
  };
}

export async function updateSprinStatus(id: string, status: string): Promise<SprinDTO | null> {
  if (!['active', 'completed', 'archived'].includes(status)) {
    throw new SprinValidationError('Status Sprin tidak valid.');
  }
  const exists = await prisma.sprin.findUnique({ where: { id } });
  if (!exists) return null;
  const updated = await prisma.sprin.update({
    where: { id },
    data: { status },
    include: {
      ...includeCounts,
      personnel: { orderBy: [{ page: 'asc' }, { no: 'asc' }] }
    }
  });
  await recordActivity({
    type: 'sprin_status',
    title: `Sprin ditandai ${status}`,
    description: updated.number,
    actor: 'Dashboard',
    entityType: 'sprin',
    entityId: updated.id
  });
  return serializeSprin(updated as SprinWithPersonnel);
}
