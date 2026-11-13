import ExcelJS from 'exceljs';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { buildSprinRosterIndex, matchSprinRosterPerson } from './sprin-personnel-matcher.js';
import { isSatlantasPersonnel } from './personnel-scope.js';
import type {
  PosPagiAssignmentDTO,
  PosPagiDTO,
  PosPagiImportResult,
  PosPagiListDTO
} from '../../shared/types.js';

export interface ParsedPosPagiAssignment {
  no: number;
  name: string;
  rank: string | null;
  jabatan: string | null;
  role: 'ANGGOTA' | 'PADAL';
  postName: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ParsedPosPagiPost {
  name: string;
  latitude: number | null;
  longitude: number | null;
  order: number;
  assignments: ParsedPosPagiAssignment[];
}

export interface ParsedPosPagiWorkbook {
  sheetName: string;
  posts: ParsedPosPagiPost[];
  assignments: ParsedPosPagiAssignment[];
  warnings: string[];
}

interface PostAccumulator extends ParsedPosPagiPost {
  key: string;
}

function cleanCellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('').trim();
    }
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('result' in value && value.result !== undefined) return String(value.result).trim();
    return '';
  }
  return String(value).replace(/\s+/g, ' ').trim();
}

function cleanPersonnelName(value: string): string {
  let name = value.replace(/\s+/g, ' ').trim();
  for (let index = 0; index < 2; index += 1) {
    name = name.replace(/^\d{1,3}\s*[.)]?\s+/, '').trim();
  }
  return name;
}

function parseCoordinatePair(raw: string): { name: string; latitude: number | null; longitude: number | null } {
  const match = /^(.*?)\s+(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(raw);
  if (!match) return { name: raw.trim(), latitude: null, longitude: null };
  const latitude = Number(match[2]!.replace(',', '.'));
  const longitude = Number(match[3]!.replace(',', '.'));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { name: raw.trim(), latitude: null, longitude: null };
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { name: raw.trim(), latitude: null, longitude: null };
  }
  return {
    name: match[1]!.replace(/\s+/g, ' ').trim(),
    latitude,
    longitude
  };
}

function findHeaderRow(sheet: ExcelJS.Worksheet): number | null {
  const limit = Math.min(sheet.rowCount, 60);
  for (let row = 1; row <= limit; row += 1) {
    if (
      cleanCellText(sheet.getCell(row, 1).value).toUpperCase() === 'NO' &&
      cleanCellText(sheet.getCell(row, 2).value).toUpperCase() === 'NAMA'
    ) {
      return row;
    }
  }
  return null;
}

function mergedPostValues(sheet: ExcelJS.Worksheet): Map<number, string> {
  const result = new Map<number, string>();
  for (const range of sheet.model.merges ?? []) {
    const match = /^E(\d+):E(\d+)$/i.exec(range);
    if (!match) continue;
    const from = Number(match[1]);
    const to = Number(match[2]);
    const value = cleanCellText(sheet.getCell(from, 5).value);
    for (let row = from; row <= to; row += 1) result.set(row, value);
  }
  return result;
}

/**
 * Baca lampiran POS PAGI. Kolom: NO, NAMA, PANGKAT, JABATAN, dan kolom E
 * berisi "NAMA POS -lat, lng" yang biasanya digabung (merge) untuk beberapa
 * anggota. Nilai PADAL berarti perwira tanpa titik pos.
 */
export async function parsePosPagiWorkbook(buffer: Buffer): Promise<ParsedPosPagiWorkbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new HttpError(400, 'Berkas POS PAGI bukan XLSX yang valid.');
  }

  for (const sheet of workbook.worksheets) {
    const headerRow = findHeaderRow(sheet);
    if (!headerRow) continue;

    const merged = mergedPostValues(sheet);
    const posts = new Map<string, PostAccumulator>();
    const assignments: ParsedPosPagiAssignment[] = [];
    const warnings: string[] = [];
    let nextPostOrder = 0;

    for (let row = headerRow + 1; row <= sheet.rowCount; row += 1) {
      const no = Number(sheet.getCell(row, 1).value);
      const rawName = cleanCellText(sheet.getCell(row, 2).value);
      if (!Number.isFinite(no) || no < 1 || !rawName) continue;
      if (/^(NAMA|NO)$/i.test(rawName)) continue;

      const name = cleanPersonnelName(rawName);
      if (!name) continue;

      const postRaw = (merged.get(row) ?? cleanCellText(sheet.getCell(row, 5).value))
        .replace(/\s+/g, ' ')
        .trim();
      if (!postRaw) {
        warnings.push(`Baris ${row} (${name}) tidak memiliki pos/titik; dilewati.`);
        continue;
      }

      const rank = cleanCellText(sheet.getCell(row, 3).value) || null;
      const jabatan = cleanCellText(sheet.getCell(row, 4).value) || null;

      if (/^PADAL$/i.test(postRaw)) {
        assignments.push({
          no,
          name,
          rank,
          jabatan,
          role: 'PADAL',
          postName: null,
          latitude: null,
          longitude: null
        });
        continue;
      }

      const parsed = parseCoordinatePair(postRaw);
      if (!parsed.name) {
        warnings.push(`Baris ${row} (${name}) memiliki nama pos kosong; dilewati.`);
        continue;
      }
      if (parsed.latitude === null || parsed.longitude === null) {
        warnings.push(`Titik pos "${postRaw}" pada baris ${row} tidak memiliki koordinat valid.`);
      }

      const key = parsed.name.toUpperCase();
      let post = posts.get(key);
      if (!post) {
        post = {
          key,
          name: parsed.name.toUpperCase(),
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          order: nextPostOrder,
          assignments: []
        };
        nextPostOrder += 1;
        posts.set(key, post);
      } else if (
        post.latitude !== null &&
        parsed.latitude !== null &&
        (post.latitude !== parsed.latitude || post.longitude !== parsed.longitude)
      ) {
        warnings.push(`Pos "${post.name}" muncul dengan koordinat berbeda; koordinat pertama dipakai.`);
      }

      const assignment: ParsedPosPagiAssignment = {
        no,
        name,
        rank,
        jabatan,
        role: 'ANGGOTA',
        postName: post.name,
        latitude: post.latitude,
        longitude: post.longitude
      };
      post.assignments.push(assignment);
      assignments.push(assignment);
    }

    if (assignments.length > 0) {
      return {
        sheetName: sheet.name,
        posts: [...posts.values()].map(({ key: _key, ...post }) => post),
        assignments,
        warnings
      };
    }
  }

  throw new HttpError(
    400,
    'Tidak menemukan tabel POS PAGI. Pastikan ada header NO, NAMA, PANGKAT, JABATAN, dan kolom pos.'
  );
}

function assignmentDto(assignment: {
  id: string;
  posId: string | null;
  personnelId: string | null;
  no: number;
  name: string;
  rank: string | null;
  jabatan: string | null;
  role: string;
  matchStatus: string;
  matchMethod: string | null;
  personnel: { name: string; phone: string | null } | null;
}): PosPagiAssignmentDTO {
  return {
    id: assignment.id,
    posId: assignment.posId,
    personnelId: assignment.personnelId,
    personnelName: assignment.personnel?.name ?? null,
    phone: assignment.personnel?.phone ?? null,
    no: assignment.no,
    name: assignment.name,
    rank: assignment.rank,
    jabatan: assignment.jabatan,
    role: assignment.role === 'PADAL' ? 'PADAL' : 'ANGGOTA',
    matchStatus:
      assignment.matchStatus === 'MATCHED'
        ? 'MATCHED'
        : assignment.matchStatus === 'DUPLICATE'
          ? 'DUPLICATE'
          : 'UNMATCHED',
    matchMethod:
      assignment.matchMethod === 'nrp' ||
      assignment.matchMethod === 'name' ||
      assignment.matchMethod === 'name-abbrev' ||
      assignment.matchMethod === 'manual'
        ? assignment.matchMethod
        : null
  };
}

function postDto(post: {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  order: number;
  active: boolean;
  assignments: Array<Parameters<typeof assignmentDto>[0]>;
}): PosPagiDTO {
  return {
    id: post.id,
    name: post.name,
    latitude: post.latitude,
    longitude: post.longitude,
    radiusMeters: post.radiusMeters,
    order: post.order,
    active: post.active,
    assignments: post.assignments.map(assignmentDto)
  };
}

export async function listPosPagi(): Promise<PosPagiListDTO> {
  const [posts, padal] = await Promise.all([
    prisma.posPagi.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        assignments: {
          where: { active: true },
          orderBy: [{ no: 'asc' }],
          include: { personnel: { select: { name: true, phone: true } } }
        }
      }
    }),
    prisma.posPagiAssignment.findMany({
      where: { active: true, posId: null, role: 'PADAL' },
      orderBy: [{ no: 'asc' }],
      include: { personnel: { select: { name: true, phone: true } } }
    })
  ]);

  const postDtos = posts.map(postDto);
  const assignments = postDtos.flatMap((post) => post.assignments);
  const padalDtos = padal.map(assignmentDto);
  const all = [...assignments, ...padalDtos];
  return {
    posts: postDtos,
    padalAssignments: padalDtos,
    totals: {
      posts: postDtos.length,
      assigned: all.length,
      matched: all.filter((item) => item.matchStatus === 'MATCHED').length,
      unmatched: all.filter((item) => item.matchStatus === 'UNMATCHED').length,
      padal: padalDtos.length,
      withCoordinates: postDtos.filter((post) => post.latitude !== null && post.longitude !== null).length
    }
  };
}

export async function importPosPagiData(
  parsed: ParsedPosPagiWorkbook
): Promise<PosPagiImportResult> {
  const allPersonnel = await prisma.personnel.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      rank: true,
      nrp: true,
      phone: true,
      jabatan: true,
      category: true,
      unit: true
    }
  });
  const roster = allPersonnel.filter(isSatlantasPersonnel);
  const index = buildSprinRosterIndex(roster);

  const seenPersonnel = new Set<string>();
  const prepared = parsed.assignments.map((assignment) => {
    const match = matchSprinRosterPerson({ name: assignment.name, nrp: null }, index);
    let matchStatus: 'MATCHED' | 'UNMATCHED' | 'DUPLICATE' = match ? 'MATCHED' : 'UNMATCHED';
    if (match && seenPersonnel.has(match.person.id)) matchStatus = 'DUPLICATE';
    if (match) seenPersonnel.add(match.person.id);
    return {
      ...assignment,
      personnelId: match?.person.id ?? null,
      matchMethod: match?.method ?? null,
      matchStatus,
      active: matchStatus !== 'DUPLICATE'
    };
  });

  const unmatched = prepared.filter((item) => item.matchStatus === 'UNMATCHED');
  const warnings = [...parsed.warnings];
  if (unmatched.length > 0) {
    warnings.push(
      `${unmatched.length} nama belum terhubung ke roster: ${unmatched
        .map((item) => item.name)
        .slice(0, 8)
        .join(', ')}${unmatched.length > 8 ? ', …' : ''}`
    );
  }
  const duplicates = prepared.filter((item) => item.matchStatus === 'DUPLICATE');
  if (duplicates.length > 0) {
    warnings.push(
      `${duplicates.length} penugasan ganda dilewati: ${duplicates.map((item) => item.name).join(', ')}`
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.posPagiAssignment.deleteMany();
    await tx.posPagi.deleteMany();

    const postIdByName = new Map<string, string>();
    for (const post of parsed.posts) {
      const created = await tx.posPagi.create({
        data: {
          name: post.name,
          latitude: post.latitude,
          longitude: post.longitude,
          order: post.order,
          source: 'import'
        }
      });
      postIdByName.set(post.name, created.id);
    }

    if (prepared.length > 0) {
      await tx.posPagiAssignment.createMany({
        data: prepared.map((assignment) => ({
          posId: assignment.postName ? (postIdByName.get(assignment.postName) ?? null) : null,
          personnelId: assignment.personnelId,
          no: assignment.no,
          name: assignment.name,
          rank: assignment.rank,
          jabatan: assignment.jabatan,
          role: assignment.role,
          matchStatus: assignment.matchStatus,
          matchMethod: assignment.matchMethod,
          active: assignment.active
        }))
      });
    }
  });

  return { ...(await listPosPagi()), warnings, sheetName: parsed.sheetName };
}

export async function importPosPagiWorkbook(input: {
  buffer: Buffer;
  filename: string;
}): Promise<PosPagiImportResult> {
  return importPosPagiData(await parsePosPagiWorkbook(input.buffer));
}

export async function setPosPagiAssignmentPersonnel(
  assignmentId: string,
  personnelId: string | null
): Promise<PosPagiListDTO> {
  const assignment = await prisma.posPagiAssignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw new HttpError(404, 'Penugasan pos pagi tidak ditemukan.');

  if (personnelId) {
    const person = await prisma.personnel.findUnique({ where: { id: personnelId } });
    if (!person || !person.active) throw new HttpError(400, 'Personel tidak ditemukan atau tidak aktif.');
    const duplicate = await prisma.posPagiAssignment.findFirst({
      where: { personnelId, active: true, id: { not: assignmentId } }
    });
    if (duplicate) {
      throw new HttpError(409, `${person.name} sudah terdaftar pada penugasan pos pagi lain.`);
    }
    await prisma.posPagiAssignment.update({
      where: { id: assignmentId },
      data: {
        personnelId,
        matchStatus: 'MATCHED',
        matchMethod: 'manual',
        active: true
      }
    });
  } else {
    await prisma.posPagiAssignment.update({
      where: { id: assignmentId },
      data: { personnelId: null, matchStatus: 'UNMATCHED', matchMethod: null, active: true }
    });
  }
  return listPosPagi();
}

export async function updatePosPagiPost(
  postId: string,
  input: {
    name?: string;
    latitude?: number | null;
    longitude?: number | null;
    radiusMeters?: number;
    active?: boolean;
  }
): Promise<PosPagiListDTO> {
  const post = await prisma.posPagi.findUnique({ where: { id: postId } });
  if (!post) throw new HttpError(404, 'Pos pagi tidak ditemukan.');
  if (input.name !== undefined && !input.name.trim()) {
    throw new HttpError(400, 'Nama pos tidak boleh kosong.');
  }
  if (input.radiusMeters !== undefined && (input.radiusMeters < 5 || input.radiusMeters > 5_000)) {
    throw new HttpError(400, 'Radius harus antara 5 dan 5000 meter.');
  }
  await prisma.posPagi.update({
    where: { id: postId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim().toUpperCase() } : {}),
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
      ...(input.radiusMeters !== undefined ? { radiusMeters: input.radiusMeters } : {}),
      ...(input.active !== undefined ? { active: input.active } : {})
    }
  });
  return listPosPagi();
}
