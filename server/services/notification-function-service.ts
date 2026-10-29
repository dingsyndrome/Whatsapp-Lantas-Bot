import { prisma } from '../lib/prisma.js';
import { recordActivity } from '../lib/activity.js';
import type { NotificationFunctionDTO } from '../../shared/types.js';

export const DEFAULT_NOTIFICATION_FUNCTIONS = [
  {
    code: 'SATLANTAS',
    name: 'Satlantas',
    keywords: ['SATLANTAS', 'TURJAGWALI', 'REGIDENT', 'KAMSEL', 'GAKKUM', 'PATWAL'],
    excludePerwira: true,
    sortOrder: 10
  }
] as const;

const PERWIRA_RANK = /^(IPDA|IPTU|AKP|KOMPOL|AKBP|KOMBES|BRIGJEN|IRJEN|JENDRAL)$/i;

export interface NotificationFunctionInput {
  code?: string;
  name?: string;
  keywords?: string[];
  excludePerwira?: boolean;
  active?: boolean;
  sortOrder?: number;
}

export class NotificationFunctionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationFunctionError';
  }
}

export function parseFunctionKeywords(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean)
      )
    ];
  } catch {
    return [];
  }
}

function normalizeKeywords(keywords: string[] | undefined): string[] {
  return [
    ...new Set(
      (keywords ?? [])
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean)
    )
  ];
}

export function isPerwira(input: {
  category?: string | null;
  rank?: string | null;
  rankNrp?: string | null;
}): boolean {
  if ((input.category ?? '').toUpperCase() === 'PERWIRA') return true;
  const rank = (input.rank ?? input.rankNrp ?? '').trim().split(/[\s/]/)[0] ?? '';
  return PERWIRA_RANK.test(rank);
}

interface FunctionRow {
  id: string;
  code: string;
  name: string;
  keywords: string;
  excludePerwira: boolean;
  active: boolean;
  sortOrder: number;
}

function matchesFunction(row: Pick<FunctionRow, 'code' | 'keywords'>, text: string): boolean {
  const keywords = parseFunctionKeywords(row.keywords);
  if (text.includes(row.code.toUpperCase())) return true;
  return keywords.some((keyword) => text.includes(keyword));
}

export function detectFunctionCodes(
  text: string | null | undefined,
  functions: Array<Pick<FunctionRow, 'code' | 'keywords'>>
): string[] {
  const haystack = (text ?? '').toUpperCase();
  if (!haystack) return [];
  return functions
    .filter((row) => matchesFunction(row, haystack))
    .map((row) => row.code);
}

export function pickPrimaryFunction(
  codes: string[],
  functions: Array<Pick<FunctionRow, 'code' | 'keywords' | 'sortOrder'>>
): string | null {
  if (codes.length === 0) return null;
  const ranked = [...functions]
    .filter((row) => codes.includes(row.code))
    .sort((a, b) => {
      const aKeyword = Math.max(0, ...parseFunctionKeywords(a.keywords).map((word) => word.length));
      const bKeyword = Math.max(0, ...parseFunctionKeywords(b.keywords).map((word) => word.length));
      return bKeyword - aKeyword || a.sortOrder - b.sortOrder;
    });
  return ranked[0]?.code ?? codes[0] ?? null;
}

async function ensureDefaultFunctions(): Promise<void> {
  for (const entry of DEFAULT_NOTIFICATION_FUNCTIONS) {
    await prisma.notificationFunction.upsert({
      where: { code: entry.code },
      create: {
        code: entry.code,
        name: entry.name,
        keywords: JSON.stringify(entry.keywords),
        excludePerwira: entry.excludePerwira,
        active: true,
        sortOrder: entry.sortOrder
      },
      update: {}
    });
  }
}

export async function getNotificationFunctionRows(): Promise<FunctionRow[]> {
  await ensureDefaultFunctions();
  return prisma.notificationFunction.findMany({
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }]
  });
}

export async function listNotificationFunctions(): Promise<NotificationFunctionDTO[]> {
  const [functions, personnel] = await Promise.all([
    getNotificationFunctionRows(),
    prisma.personnel.findMany({
      where: { active: true },
      select: { unit: true, jabatan: true, category: true, rank: true, phone: true, active: true }
    })
  ]);

  return functions.map((row) => {
    const eligible = personnel.filter((person) => {
      if (!person.phone) return false;
      if (row.excludePerwira && isPerwira(person)) return false;
      return matchesFunction(row, `${person.jabatan ?? ''} ${person.unit}`.toUpperCase());
    });
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      keywords: parseFunctionKeywords(row.keywords),
      excludePerwira: row.excludePerwira,
      active: row.active,
      sortOrder: row.sortOrder,
      availableCount: eligible.length,
      phoneReady: eligible.length > 0
    };
  });
}

export async function createNotificationFunction(
  input: NotificationFunctionInput
): Promise<NotificationFunctionDTO> {
  const code = (input.code ?? '').trim().toUpperCase();
  const name = (input.name ?? '').trim();
  const keywords = normalizeKeywords(input.keywords);
  if (!/^[A-Z0-9_]{2,32}$/.test(code)) {
    throw new NotificationFunctionError('Kode fungsi harus 2–32 karakter: huruf, angka, atau garis bawah.');
  }
  if (!name) throw new NotificationFunctionError('Nama fungsi wajib diisi.');
  if (keywords.length === 0) {
    throw new NotificationFunctionError('Isi minimal satu kata kunci jabatan untuk fungsi ini.');
  }
  const existing = await prisma.notificationFunction.findUnique({ where: { code } });
  if (existing) throw new NotificationFunctionError(`Fungsi ${code} sudah ada.`);

  const created = await prisma.notificationFunction.create({
    data: {
      code,
      name,
      keywords: JSON.stringify(keywords),
      excludePerwira: input.excludePerwira ?? true,
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? 100
    }
  });
  await recordActivity({
    type: 'notification_function_created',
    title: 'Fungsi notifikasi ditambahkan',
    description: `${code} · ${name} · ${keywords.join(', ')}`,
    actor: 'Dashboard',
    entityType: 'notification_function',
    entityId: created.id
  });
  const rows = await listNotificationFunctions();
  return rows.find((row) => row.code === code)!;
}

export async function updateNotificationFunction(
  id: string,
  input: NotificationFunctionInput
): Promise<NotificationFunctionDTO> {
  const existing = await prisma.notificationFunction.findUnique({ where: { id } });
  if (!existing) throw new NotificationFunctionError('Fungsi notifikasi tidak ditemukan.');

  const code = input.code === undefined ? existing.code : input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_]{2,32}$/.test(code)) {
    throw new NotificationFunctionError('Kode fungsi harus 2–32 karakter: huruf, angka, atau garis bawah.');
  }
  if (code !== existing.code) {
    const duplicate = await prisma.notificationFunction.findUnique({ where: { code } });
    if (duplicate) throw new NotificationFunctionError(`Fungsi ${code} sudah ada.`);
  }
  const keywords = input.keywords === undefined ? parseFunctionKeywords(existing.keywords) : normalizeKeywords(input.keywords);
  if (keywords.length === 0) {
    throw new NotificationFunctionError('Isi minimal satu kata kunci jabatan untuk fungsi ini.');
  }
  const name = input.name === undefined ? existing.name : input.name.trim();
  if (!name) throw new NotificationFunctionError('Nama fungsi wajib diisi.');

  await prisma.notificationFunction.update({
    where: { id },
    data: {
      code,
      name,
      keywords: JSON.stringify(keywords),
      excludePerwira: input.excludePerwira ?? existing.excludePerwira,
      active: input.active ?? existing.active,
      sortOrder: input.sortOrder ?? existing.sortOrder
    }
  });
  await recordActivity({
    type: 'notification_function_updated',
    title: 'Fungsi notifikasi diperbarui',
    description: `${code} · ${name}`,
    actor: 'Dashboard',
    entityType: 'notification_function',
    entityId: id
  });
  const rows = await listNotificationFunctions();
  return rows.find((row) => row.code === code)!;
}

export async function deleteNotificationFunction(id: string): Promise<boolean> {
  const existing = await prisma.notificationFunction.findUnique({ where: { id } });
  if (!existing) return false;
  await prisma.notificationFunction.delete({ where: { id } });
  await recordActivity({
    type: 'notification_function_deleted',
    title: 'Fungsi notifikasi dihapus',
    description: existing.code,
    actor: 'Dashboard',
    entityType: 'notification_function',
    entityId: id
  });
  return true;
}
