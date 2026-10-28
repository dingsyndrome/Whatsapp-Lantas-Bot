import {
  endOfDay,
  endOfWeek,
  format,
  startOfDay,
  startOfWeek
} from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import type {
  SupervisionSignal,
  TurjawaliActivityType,
  TurjawaliMatchStatus,
  TurjawaliPersonnelStatus,
  TurjawaliRecap,
  TurjawaliRecapCategory,
  TurjawaliType
} from '../../shared/types.js';
import {
  TURJAWALI_LABELS,
  TURJAWALI_TYPES
} from '../../shared/types.js';
import { prisma } from '../lib/prisma.js';
import { isoDay } from '../lib/dates.js';

const ACTIVE_TYPES: TurjawaliActivityType[] = [
  'PENGATURAN',
  'PENJAGAAN',
  'PENGAWALAN',
  'PATROLI',
  'PENEGAKKAN'
];

function parseDate(value?: string | null): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function rangeFor(
  period: 'daily' | 'weekly',
  dateInput?: string | null
): { start: Date; end: Date; label: string } {
  const date = parseDate(dateInput);
  if (period === 'weekly') {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = endOfWeek(date, { weekStartsOn: 1 });
    return {
      start,
      end,
      label: `${format(start, 'dd MMM', { locale: localeId })} – ${format(end, 'dd MMM yyyy', { locale: localeId })}`
    };
  }
  const start = startOfDay(date);
  const end = endOfDay(date);
  return {
    start,
    end,
    label: format(date, "EEEE, dd MMMM yyyy", { locale: localeId })
  };
}

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function nameMatches(senderName: string, personnelName: string): boolean {
  const sender = normalizedName(senderName);
  const person = normalizedName(personnelName);
  if (!sender || !person) return false;
  if (sender === person) return true;
  const senderTokens = new Set(sender.split(' ').filter((token) => token.length > 2));
  const personTokens = person.split(' ').filter((token) => token.length > 2);
  if (personTokens.length === 0) return false;
  const overlap = personTokens.filter((token) => senderTokens.has(token)).length;
  return overlap >= Math.min(2, personTokens.length);
}

function locationKey(address: string | null): string {
  return (address ?? 'Lokasi tidak tercatat').replace(/\s+/g, ' ').trim();
}

export async function getTurjawaliRecap(options: {
  period?: 'daily' | 'weekly';
  date?: string | null;
}): Promise<TurjawaliRecap> {
  const period = options.period === 'weekly' ? 'weekly' : 'daily';
  const { start, end, label } = rangeFor(period, options.date);

  const [photos, activeSprins] = await Promise.all([
    prisma.timemarkPhoto.findMany({
      where: { createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.sprin.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        number: true,
        turjawaliType: true,
        personnel: {
          select: {
            id: true,
            name: true,
            rankNrp: true,
            jabatan: true,
            penugasan: true
          }
        }
      }
    })
  ]);

  const activePersonnel = new Map<
    string,
    {
      id: string;
      name: string;
      rankNrp: string | null;
      jabatan: string | null;
      penugasan: string | null;
      sprinNumber: string;
      sprinType: TurjawaliType;
    }
  >();
  for (const sprin of activeSprins) {
    for (const person of sprin.personnel) {
      const key = normalizedName(person.name);
      if (!key || activePersonnel.has(key)) continue;
      activePersonnel.set(key, {
        id: person.id,
        name: person.name,
        rankNrp: person.rankNrp,
        jabatan: person.jabatan,
        penugasan: person.penugasan,
        sprinNumber: sprin.number,
        sprinType: TURJAWALI_TYPES.includes(sprin.turjawaliType as TurjawaliType)
          ? (sprin.turjawaliType as TurjawaliType)
          : 'LAINNYA'
      });
    }
  }

  const personnelList = [...activePersonnel.values()];
  const assignedByType = new Map<TurjawaliType, number>();
  for (const sprin of activeSprins) {
    const type = TURJAWALI_TYPES.includes(sprin.turjawaliType as TurjawaliType)
      ? (sprin.turjawaliType as TurjawaliType)
      : 'LAINNYA';
    assignedByType.set(type, (assignedByType.get(type) ?? 0) + sprin.personnel.length);
  }
  const personForPhoto = new Map<string, string>();
  for (const photo of photos) {
    const byName = personnelList.find((person) => nameMatches(photo.senderName, person.name));
    const personId = byName?.id ?? photo.matchedPersonnelId;
    if (personId) personForPhoto.set(photo.id, personId);
  }

  const categories = ACTIVE_TYPES.map((type): TurjawaliRecapCategory => {
    const categoryPhotos = photos.filter((photo) => photo.turjawaliType === type);
    const matched = categoryPhotos.filter((photo) => photo.matchStatus === 'MATCHED');
    const partial = categoryPhotos.filter((photo) => photo.matchStatus === 'PARTIAL_MATCH');
    const unmatched = categoryPhotos.filter((photo) => photo.matchStatus === 'UNMATCHED');
    const reportedIds = new Set<string>();
    for (const photo of categoryPhotos) {
      const personId = personForPhoto.get(photo.id);
      if (personId) reportedIds.add(personId);
    }
    const locationCounts = new Map<string, number>();
    for (const photo of categoryPhotos) {
      const key = locationKey(photo.address);
      locationCounts.set(key, (locationCounts.get(key) ?? 0) + 1);
    }
    return {
      type,
      label: TURJAWALI_LABELS[type],
      photoCount: categoryPhotos.length,
      matchedCount: matched.length,
      partialCount: partial.length,
      unmatchedCount: unmatched.length,
      personnelReported: reportedIds.size,
      personnelAssigned: assignedByType.get(type) ?? 0,
      locations: [...locationCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([address, count]) => ({ address, count }))
    };
  });

  const matchedPhotos = photos.filter((photo) => photo.matchStatus === 'MATCHED').length;
  const partialPhotos = photos.filter((photo) => photo.matchStatus === 'PARTIAL_MATCH').length;
  const unmatchedPhotos = photos.filter((photo) => photo.matchStatus === 'UNMATCHED').length;

  const details: TurjawaliPersonnelStatus[] = [];
  const reportedPersonnel = new Set<string>();
  for (const person of personnelList) {
    const related = photos.filter((photo) => personForPhoto.get(photo.id) === person.id);
    if (related.length > 0) reportedPersonnel.add(person.id);
    const types = [
      ...new Set(
        related
          .map((photo) => photo.turjawaliType)
          .filter((type): type is TurjawaliType =>
            TURJAWALI_TYPES.includes(type as TurjawaliType)
          )
      )
    ];
    const last = related.at(-1);
    details.push({
      id: person.id,
      name: person.name,
      rankNrp: person.rankNrp,
      jabatan: person.jabatan,
      penugasan: person.penugasan,
      sprinNumber: person.sprinNumber,
      reported: related.length > 0,
      photoCount: related.length,
      lastReportAt: last?.createdAt.toISOString() ?? null,
      turjawaliTypes: types
    });
  }

  details.sort((a, b) => {
    if (a.reported !== b.reported) return a.reported ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const supervisionPhotos = photos.filter((photo) => photo.isSupervision);
  const officerKeys = new Set(
    supervisionPhotos.map(
      (photo) =>
        photo.supervisorPersonnelId ??
        `${photo.supervisorSandi ?? ''}|${photo.supervisorName ?? photo.senderName}`
    )
  );
  const supervisionItems: SupervisionSignal[] = supervisionPhotos
    .slice(-20)
    .reverse()
    .map((photo) => ({
      photoId: photo.id,
      name: photo.supervisorName ?? photo.senderName,
      rank: photo.supervisorRank,
      sandi: photo.supervisorSandi,
      senderName: photo.senderName,
      senderNumber: photo.senderNumber,
      capturedAt: photo.capturedAt?.toISOString() ?? null,
      createdAt: photo.createdAt.toISOString(),
      address: photo.address,
      turjawaliType: photo.turjawaliType
    }));

  return {
    period,
    date: isoDay(start),
    from: isoDay(start),
    to: isoDay(end),
    label,
    totalPhotos: photos.length,
    matchedPhotos,
    partialPhotos,
    unmatchedPhotos,
    otherPhotos: photos.filter((photo) => !ACTIVE_TYPES.includes(photo.turjawaliType as TurjawaliActivityType)).length,
    categories,
    personnel: {
      active: activePersonnel.size,
      reported: reportedPersonnel.size,
      pending: Math.max(0, activePersonnel.size - reportedPersonnel.size),
      details
    },
    supervisions: {
      total: supervisionPhotos.length,
      uniqueOfficers: officerKeys.size,
      items: supervisionItems
    }
  };
}

export function matchStatusFromString(value: string): TurjawaliMatchStatus {
  if (value === 'MATCHED' || value === 'PARTIAL_MATCH' || value === 'UNMATCHED') return value;
  return 'UNMATCHED';
}
