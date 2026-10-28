import { prisma } from '../lib/prisma.js';
import { recordActivity } from '../lib/activity.js';
import { getBotConfig } from './settings.js';
import { isRosterSheet, parseRosterSheet } from './documents/roster-sheet.js';
import {
  AGUNG_SLOTS,
  ALL_SANDI_SLOTS,
  SANDI_SLOTS,
  type SandiSlotDefinition
} from './sandi-config.js';
import type {
  PersonnelRosterDTO,
  PersonnelRosterPage,
  SandiMapDTO,
  SandiSlot
} from '../../shared/types.js';

export class PersonnelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersonnelValidationError';
  }
}

export interface RosterImportInput {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
  mode?: 'replace' | 'append';
}

export interface RosterImportResult {
  mode: 'replace' | 'append';
  imported: number;
  replaced: number;
  total: number;
  counts: { perwira: number; anggota: number };
  warnings: string[];
  sheetName: string;
  mappedColumns: string[];
  skipped: number;
}

interface RosterPerson {
  id: string;
  name: string;
  rank: string | null;
  jabatan: string | null;
}

function toDTO(row: {
  id: string;
  no: number;
  name: string;
  rank: string | null;
  nrp: string | null;
  jabatan: string | null;
  phone: string | null;
  unit: string;
  category: string;
  sandi: string | null;
  active: boolean;
}): PersonnelRosterDTO {
  return {
    id: row.id,
    no: row.no,
    name: row.name,
    rank: row.rank,
    nrp: row.nrp,
    jabatan: row.jabatan,
    phone: row.phone,
    unit: row.unit,
    category: row.category as PersonnelRosterDTO['category'],
    sandi: row.sandi,
    active: row.active
  };
}

export async function importPersonnelRoster(input: RosterImportInput): Promise<RosterImportResult> {
  if (!isRosterSheet(input.filename, input.mimeType)) {
    throw new PersonnelValidationError('Format personel harus XLSX, XLSM, atau CSV.');
  }
  const mode: 'replace' | 'append' = input.mode === 'append' ? 'append' : 'replace';
  const sheet = await parseRosterSheet(input.buffer, input.filename, input.mimeType);

  const existing = await prisma.personnel.count();
  let replaced = 0;
  let imported = 0;

  if (mode === 'replace') {
    replaced = existing;
    await prisma.$transaction(async (tx) => {
      await tx.personnel.deleteMany({});
      await tx.personnel.createMany({
        data: sheet.rows.map((row) => ({
          no: row.no,
          name: row.name,
          rank: row.rank,
          nrp: row.nrp,
          jabatan: row.jabatan,
          phone: row.phone,
          unit: row.unit ?? 'SATLANTAS',
          category: row.category,
          sandi: row.sandi,
          active: true,
          source: 'import'
        }))
      });
    });
    imported = sheet.rows.length;
  } else {
    const current = await prisma.personnel.findMany({
      select: { id: true, name: true, nrp: true, phone: true }
    });
    const byNrp = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const row of current) {
      if (row.nrp) byNrp.set(row.nrp, row.id);
      byName.set(row.name.toUpperCase(), row.id);
    }

    for (const row of sheet.rows) {
      const matchId =
        (row.nrp ? byNrp.get(row.nrp) : undefined) ?? byName.get(row.name.toUpperCase());
      if (matchId) {
        await prisma.personnel.update({
          where: { id: matchId },
          data: {
            name: row.name,
            rank: row.rank,
            nrp: row.nrp,
            jabatan: row.jabatan,
            phone: row.phone,
            unit: row.unit ?? 'SATLANTAS',
            category: row.category,
            sandi: row.sandi,
            active: true
          }
        });
      } else {
        await prisma.personnel.create({
          data: {
            no: row.no,
            name: row.name,
            rank: row.rank,
            nrp: row.nrp,
            jabatan: row.jabatan,
            phone: row.phone,
            unit: row.unit ?? 'SATLANTAS',
            category: row.category,
            sandi: row.sandi,
            active: true,
            source: 'import'
          }
        });
      }
      imported += 1;
    }
  }

  const total = await prisma.personnel.count();
  await recordActivity({
    type: 'personnel_import',
    title: mode === 'replace' ? 'Data personel diganti' : 'Data personel diperbarui',
    description: `${sheet.rows.length} baris dari ${sheet.sheetName} (${sheet.counts.perwira} perwira) · total ${total}`,
    actor: 'Dashboard',
    entityType: 'personnel',
    metadata: { mode, imported, replaced, total }
  });

  return {
    mode,
    imported,
    replaced,
    total,
    counts: sheet.counts,
    warnings: sheet.warnings,
    sheetName: sheet.sheetName,
    mappedColumns: sheet.mappedColumns,
    skipped: sheet.skipped
  };
}

export async function listPersonnel(options: {
  search?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}): Promise<PersonnelRosterPage> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, options.pageSize ?? 50));
  const where = {
    ...(options.category && options.category !== 'all' ? { category: options.category } : {}),
    ...(options.search
      ? {
          OR: [
            { name: { contains: options.search } },
            { jabatan: { contains: options.search } },
            { nrp: { contains: options.search } },
            { phone: { contains: options.search } },
            { rank: { contains: options.search } }
          ]
        }
      : {})
  };

  const [total, rows, all] = await Promise.all([
    prisma.personnel.count({ where }),
    prisma.personnel.findMany({
      where,
      orderBy: [{ no: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.personnel.findMany({ select: { category: true, phone: true } })
  ]);

  return {
    items: rows.map(toDTO),
    total,
    page,
    pageSize,
    stats: {
      total: all.length,
      perwira: all.filter((row) => row.category === 'PERWIRA').length,
      anggota: all.filter((row) => row.category !== 'PERWIRA').length,
      withPhone: all.filter((row) => Boolean(row.phone)).length,
      withoutPhone: all.filter((row) => !row.phone).length
    }
  };
}

function pickByPattern(people: RosterPerson[], pattern: RegExp): RosterPerson | null {
  return people.find((person) => pattern.test((person.jabatan ?? '').toUpperCase())) ?? null;
}

async function rosterPeople(): Promise<RosterPerson[]> {
  return prisma.personnel.findMany({
    where: { active: true },
    select: { id: true, name: true, rank: true, jabatan: true },
    orderBy: [{ no: 'asc' }]
  });
}

async function storedSandiMap(): Promise<Record<string, string>> {
  const bot = await getBotConfig();
  try {
    const parsed = JSON.parse(bot.officerSandiMap || '{}') as Record<string, unknown>;
    const clean: Record<string, string> = {};
    for (const [code, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim()) clean[code] = value;
    }
    return clean;
  } catch {
    return {};
  }
}

function buildSlots(
  definitions: SandiSlotDefinition[],
  people: RosterPerson[],
  stored: Record<string, string>
): SandiSlot[] {
  const byId = new Map(people.map((person) => [person.id, person]));
  return definitions.map((definition) => {
    const manualId = stored[definition.code];
    if (manualId && byId.has(manualId)) {
      const person = byId.get(manualId)!;
      return {
        code: definition.code,
        label: definition.label,
        personnelId: person.id,
        personnelName: `${person.rank ? `${person.rank} ` : ''}${person.name}`,
        source: 'manual'
      };
    }
    if (definition.jabatanPattern) {
      const person = pickByPattern(people, definition.jabatanPattern);
      if (person) {
        return {
          code: definition.code,
          label: definition.label,
          personnelId: person.id,
          personnelName: `${person.rank ? `${person.rank} ` : ''}${person.name}`,
          source: 'default'
        };
      }
    }
    return {
      code: definition.code,
      label: definition.label,
      personnelId: null,
      personnelName: null,
      source: 'kosong'
    };
  });
}

export async function getSandiMapDTO(): Promise<SandiMapDTO> {
  const [people, stored] = await Promise.all([rosterPeople(), storedSandiMap()]);
  const perwira = people.filter(
    (person) => person.rank && ['IPDA', 'IPTU', 'AKP', 'KOMPOL', 'AKBP'].includes(person.rank)
  );
  return {
    slots: buildSlots(ALL_SANDI_SLOTS, people, stored),
    perwira: perwira.map((person) => ({
      id: person.id,
      name: person.name,
      rank: person.rank,
      jabatan: person.jabatan
    })),
    updatedAt: null
  };
}

export async function saveSandiMap(
  overrides: Record<string, string | null>
): Promise<SandiMapDTO> {
  const allowed = new Set(ALL_SANDI_SLOTS.map((slot) => slot.code));
  const clean: Record<string, string> = {};
  for (const [code, personnelId] of Object.entries(overrides)) {
    const normalized = code.toUpperCase().trim();
    if (!allowed.has(normalized)) continue;
    if (typeof personnelId === 'string' && personnelId.trim()) clean[normalized] = personnelId.trim();
  }

  const people = await prisma.personnel.findMany({ select: { id: true } });
  const known = new Set(people.map((person) => person.id));
  for (const [code, personnelId] of Object.entries(clean)) {
    if (!known.has(personnelId)) delete clean[code];
  }

  await prisma.botConfig.update({
    where: { id: 'singleton' },
    data: { officerSandiMap: JSON.stringify(clean) }
  });
  return getSandiMapDTO();
}

/** Kode sandi → identitas pemegangnya, dipakai mesin deteksi supervisi. */
export async function resolveSandiAssignments(): Promise<
  Record<string, { id: string; name: string; rank: string | null; sandi: string }>
> {
  const [people, stored] = await Promise.all([rosterPeople(), storedSandiMap()]);
  const byId = new Map(people.map((person) => [person.id, person]));
  const result: Record<string, { id: string; name: string; rank: string | null; sandi: string }> = {};

  for (const definition of ALL_SANDI_SLOTS) {
    const manualId = stored[definition.code];
    let person: RosterPerson | null = manualId ? byId.get(manualId) ?? null : null;
    if (!person && definition.jabatanPattern) person = pickByPattern(people, definition.jabatanPattern);
    if (person) {
      result[definition.code] = {
        id: person.id,
        name: person.name,
        rank: person.rank,
        sandi: definition.code
      };
    }
  }
  return result;
}

/** Statistik ringkas untuk panel Settings. */
export async function personnelSummary(): Promise<{
  total: number;
  perwira: number;
  anggota: number;
  withPhone: number;
}> {
  const all = await prisma.personnel.findMany({ select: { category: true, phone: true } });
  return {
    total: all.length,
    perwira: all.filter((row) => row.category === 'PERWIRA').length,
    anggota: all.filter((row) => row.category !== 'PERWIRA').length,
    withPhone: all.filter((row) => Boolean(row.phone)).length
  };
}

export { SANDI_SLOTS, AGUNG_SLOTS };
