import { endOfDay, format, startOfDay } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { prisma } from '../lib/prisma.js';
import { samePhone } from '../lib/phone.js';
import { findSandiCodes } from './sandi-config.js';
import { resolveSandiAssignments } from './personnel-service.js';
import { TURJAWALI_LABELS, type TurjawaliType } from '../../shared/types.js';

export type RecapCategory =
  | 'ALL'
  | 'POS_PAGI'
  | 'PENGATURAN'
  | 'PENJAGAAN'
  | 'PENGAWALAN'
  | 'PATROLI'
  | 'PENEGAKKAN'
  | 'LAINNYA';

export interface CustomRecapParams {
  from: string;
  to: string;
  hourFrom?: number;
  hourTo?: number;
  category?: RecapCategory;
  rosterOnly?: boolean;
}

export interface CustomRecapActivity {
  id: string;
  at: string;
  timeText: string | null;
  category: TurjawaliType;
  address: string | null;
  senderName: string;
  unitName: string | null;
  matchStatus: string;
  supervisorSandi: string | null;
  supervisorName: string | null;
  supervisorRank: string | null;
}

export interface CustomRecapResult {
  range: { from: string; to: string; hourFrom: number | null; hourTo: number | null };
  category: RecapCategory;
  counts: { photos: number; links: number; activities: number; supervisors: number };
  activities: CustomRecapActivity[];
  supervisors: Array<{ sandi: string | null; name: string; rank: string | null; count: number }>;
  personnel: {
    rosterTotal: number;
    submitted: Array<{ name: string; rankNrp: string | null; photos: number; links: number }>;
    notSubmitted: Array<{ name: string; rankNrp: string | null; phone: string | null }>;
  };
  text: string;
}

function normalizeName(value: string): string {
  return value
    .toUpperCase()
    .replace(/\b(S\.?H\.?|S\.?I\.?K\.?|S\.?TR\.?K\.?|M\.?H\.?|M\.?M\.?|CPHR|S\.?E\.?)\b/g, ' ')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hourOf(date: Date): number {
  return date.getHours();
}

export async function buildCustomRecap(params: CustomRecapParams): Promise<CustomRecapResult> {
  const from = startOfDay(new Date(`${params.from}T00:00:00`));
  const to = endOfDay(new Date(`${params.to}T00:00:00`));
  const category: RecapCategory = params.category ?? 'ALL';
  const hourFrom = typeof params.hourFrom === 'number' ? params.hourFrom : null;
  const hourTo = typeof params.hourTo === 'number' ? params.hourTo : null;
  const rosterOnly = params.rosterOnly !== false;

  const bot = await prisma.botConfig.findUnique({ where: { id: 'singleton' } });
  const [photos, links, roster, sandiMap] = await Promise.all([
    prisma.timemarkPhoto.findMany({
      where: { createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.linkSubmission.findMany({ where: { receivedAt: { gte: from, lte: to } } }),
    prisma.personnel.findMany({ where: { active: true }, orderBy: [{ no: 'asc' }] }),
    resolveSandiAssignments()
  ]);

  const morningStart = bot?.gaturMorningStart ?? '06:00';
  const morningEnd = bot?.gaturMorningEnd ?? '08:00';

  const timeMatches = (date: Date): boolean => {
    const hour = hourOf(date);
    if (hourFrom !== null && hour < hourFrom) return false;
    if (hourTo !== null && hour > hourTo) return false;
    if (category === 'POS_PAGI') {
      const hhmm = format(date, 'HH:mm');
      return hhmm >= morningStart && hhmm <= morningEnd;
    }
    return true;
  };

  const filteredPhotos = photos.filter((photo) => {
    const at = photo.capturedAt ?? photo.createdAt;
    if (!timeMatches(at)) return false;
    if (category === 'ALL' || category === 'POS_PAGI') return true;
    return photo.turjawaliType === category;
  });

  const filteredLinks = links.filter((link) => timeMatches(link.receivedAt));

  const activities: CustomRecapActivity[] = filteredPhotos.map((photo) => {
    const current = photo.supervisorSandi ? sandiMap[photo.supervisorSandi] : undefined;
    return {
      id: photo.id,
      at: (photo.capturedAt ?? photo.createdAt).toISOString(),
      timeText: photo.timeText,
      category: photo.turjawaliType as TurjawaliType,
      address: photo.address,
      senderName: photo.senderName,
      unitName: photo.unitName,
      matchStatus: photo.matchStatus,
      supervisorSandi: photo.supervisorSandi,
      supervisorName: current?.name ?? photo.supervisorName,
      supervisorRank: current?.rank ?? photo.supervisorRank
    };
  });

  // Perwira pengawas: dari sandi yang disebut di caption/OCR + hasil deteksi.
  const supervisorMap = new Map<string, { sandi: string | null; name: string; rank: string | null; count: number }>();
  for (const activity of activities) {
    const caption = filteredPhotos.find((photo) => photo.id === activity.id)?.caption ?? '';
    const codes = findSandiCodes(caption);
    const sandi = activity.supervisorSandi ?? codes[0] ?? null;
    if (!sandi && !activity.supervisorName) continue;
    const mapped = sandi ? sandiMap[sandi] : undefined;
    const name = mapped?.name ?? activity.supervisorName ?? '(belum dipetakan)';
    const key = `${sandi ?? ''}|${name}`;
    const current = supervisorMap.get(key) ?? {
      sandi,
      name,
      rank: mapped?.rank ?? activity.supervisorRank,
      count: 0
    };
    current.count += 1;
    supervisorMap.set(key, current);
  }

  const submittedMap = new Map<string, { photos: number; links: number }>();
  const matchRoster = (senderName: string, senderNumber: string) => {
    const name = normalizeName(senderName);
    return roster.find(
      (person) =>
        samePhone(person.phone, senderNumber) ||
        (name.length > 4 && normalizeName(person.name).includes(name.split(' ').slice(0, 2).join(' ')))
    );
  };

  const rosterView = rosterOnly ? roster : roster;
  for (const photo of filteredPhotos) {
    const person = matchRoster(photo.senderName, photo.senderNumber);
    if (!person) continue;
    const entry = submittedMap.get(person.id) ?? { photos: 0, links: 0 };
    entry.photos += 1;
    submittedMap.set(person.id, entry);
  }
  for (const link of filteredLinks) {
    const person = matchRoster(link.senderName, link.senderNumber);
    if (!person) continue;
    const entry = submittedMap.get(person.id) ?? { photos: 0, links: 0 };
    entry.links += 1;
    submittedMap.set(person.id, entry);
  }

  const submitted = rosterView
    .filter((person) => submittedMap.has(person.id))
    .map((person) => ({
      name: person.name,
      rankNrp: [person.rank, person.nrp].filter(Boolean).join('/') || null,
      photos: submittedMap.get(person.id)?.photos ?? 0,
      links: submittedMap.get(person.id)?.links ?? 0
    }));
  const notSubmitted = rosterView
    .filter((person) => !submittedMap.has(person.id))
    .map((person) => ({
      name: person.name,
      rankNrp: [person.rank, person.nrp].filter(Boolean).join('/') || null,
      phone: person.phone
    }));

  const label = category === 'ALL' ? 'Semua kegiatan' : category === 'POS_PAGI' ? `Pos pagi (${morningStart}–${morningEnd})` : TURJAWALI_LABELS[category];
  const supervisors = [...supervisorMap.values()].sort((a, b) => b.count - a.count);

  const lines: string[] = [
    `*REKAP ${label.toUpperCase()}*`,
    `${format(from, 'dd MMMM yyyy', { locale: localeId })}${params.to !== params.from ? ` – ${format(to, 'dd MMMM yyyy', { locale: localeId })}` : ''}${hourFrom !== null || hourTo !== null ? ` · ${String(hourFrom ?? 0).padStart(2, '0')}:00–${String(hourTo ?? 23).padStart(2, '0')}:59` : ''}`,
    '',
    `📸 Foto Timemark: ${filteredPhotos.length}`,
    `🔗 Link anggota: ${filteredLinks.length}`,
    `👮 Personel roster: ${submitted.length}/${rosterView.length} sudah melapor`,
    ''
  ];

  if (activities.length > 0) {
    lines.push('*KEGIATAN*');
    activities.slice(0, 20).forEach((activity, index) => {
      lines.push(
        `${index + 1}. ${activity.timeText ?? format(new Date(activity.at), 'HH:mm')} · ${TURJAWALI_LABELS[activity.category]} · ${activity.unitName ?? activity.senderName}`
      );
      if (activity.address) lines.push(`   📍 ${activity.address}`);
      if (activity.supervisorName || activity.supervisorSandi) {
        lines.push(
          `   👁️ ${activity.supervisorSandi ? `[${activity.supervisorSandi}] ` : ''}${[activity.supervisorRank, activity.supervisorName].filter(Boolean).join(' ')}`
        );
      }
    });
  } else {
    lines.push('_Tidak ada kegiatan pada rentang ini._');
  }

  if (supervisors.length > 0) {
    lines.push('', '*PERWIRA PENGAWAS*');
    supervisors.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.sandi ? `[${item.sandi}] ` : ''}${[item.rank, item.name].filter(Boolean).join(' ')} · ${item.count} laporan`);
    });
  }

  lines.push('', '*BELUM MELAPOR*');
  if (notSubmitted.length === 0) {
    lines.push('_Semua personel roster sudah melapor._');
  } else {
    notSubmitted.slice(0, 30).forEach((person, index) => {
      lines.push(`${index + 1}. ${person.name}${person.rankNrp ? ` (${person.rankNrp})` : ''}`);
    });
    if (notSubmitted.length > 30) lines.push(`… dan ${notSubmitted.length - 30} personel lain.`);
  }

  return {
    range: { from: params.from, to: params.to, hourFrom, hourTo },
    category,
    counts: {
      photos: filteredPhotos.length,
      links: filteredLinks.length,
      activities: activities.length,
      supervisors: supervisors.length
    },
    activities,
    supervisors,
    personnel: { rosterTotal: rosterView.length, submitted, notSubmitted },
    text: lines.join('\n')
  };
}
