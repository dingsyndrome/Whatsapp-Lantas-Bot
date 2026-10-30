import { endOfDay, format, startOfDay } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { prisma } from '../lib/prisma.js';
import { formatTimeOfDay, resolveTimeRange } from '../lib/time.js';
import { findSandiCodes } from './sandi-config.js';
import { resolveSandiAssignments } from './personnel-service.js';
import { PersonnelDirectory } from './personnel-directory.js';
import { formatRankName } from '../../shared/personnel-name.js';
import { TURJAWALI_LABELS, type TurjawaliType } from '../../shared/types.js';

export type RecapCategory =
  | 'ALL'
  | 'POS_PAGI'
  | 'PENGATURAN'
  | 'PENJAGAAN'
  | 'PENGAWALAN'
  | 'PATROLI'
  | 'PENEGAKKAN'
  | 'REGIDENT'
  | 'LAINNYA';

export interface CustomRecapParams {
  from: string;
  to: string;
  /** Awal rentang jam dalam menit sejak 00:00, mis. 07:15 → 435. */
  startMinutes?: number | null;
  /** Akhir rentang jam dalam menit sejak 00:00 (inklusif sampai detik terakhir menit itu). */
  endMinutes?: number | null;
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
  senderLabel: string;
  unitName: string | null;
  matchStatus: string;
  supervisorSandi: string | null;
  supervisorName: string | null;
  supervisorRank: string | null;
}

export interface CustomRecapResult {
  range: { from: string; to: string; startTime: string | null; endTime: string | null };
  category: RecapCategory;
  counts: { photos: number; links: number; activities: number; supervisors: number };
  activities: CustomRecapActivity[];
  supervisors: Array<{ sandi: string | null; name: string; rank: string | null; count: number }>;
  personnel: {
    rosterTotal: number;
    submitted: Array<{
      name: string;
      displayName: string;
      rank: string | null;
      rankNrp: string | null;
      photos: number;
      links: number;
    }>;
    notSubmitted: Array<{
      name: string;
      displayName: string;
      rank: string | null;
      rankNrp: string | null;
      phone: string | null;
    }>;
  };
  text: string;
}

/** Ringkas alamat menjadi kecamatan saja, sesuai kebutuhan laporan. */
function shortLocation(address: string | null, district: string | null): string {
  if (district && district.trim()) return `Kec. ${district.trim()}`;
  if (!address) return 'lokasi tidak tercatat';
  const match = address.match(/Kec(?:amatan)?\.?\s*([A-Za-z][A-Za-z\s.'-]{1,30}?)(?:,|\s*Kab|\s*Kota|$)/i);
  if (match) return `Kec. ${match[1].trim()}`;
  const kab = address.match(/Kab(?:upaten)?\.?\s*([A-Za-z][A-Za-z\s.'-]{1,30}?)(?:,|$)/i);
  if (kab) return `Kab. ${kab[1].trim()}`;
  return address.split(',')[0].trim().slice(0, 40);
}

export async function buildCustomRecap(params: CustomRecapParams): Promise<CustomRecapResult> {
  const from = startOfDay(new Date(`${params.from}T00:00:00`));
  const to = endOfDay(new Date(`${params.to}T00:00:00`));
  const category: RecapCategory = params.category ?? 'ALL';
  const startMinutes = typeof params.startMinutes === 'number' ? params.startMinutes : null;
  const endMinutes = typeof params.endMinutes === 'number' ? params.endMinutes : null;
  const startTime = formatTimeOfDay(startMinutes);
  const endTime = formatTimeOfDay(endMinutes);
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

  const directory = new PersonnelDirectory(
    roster.map((person) => ({
      id: person.id,
      name: person.name,
      rank: person.rank,
      phone: person.phone
    }))
  );

  const morningStart = bot?.gaturMorningStart ?? '06:00';
  const morningEnd = bot?.gaturMorningEnd ?? '08:00';
  // Batas absolut: jam mulai di tanggal `from`, jam selesai di tanggal `to`.
  // Ini membuat rentang lintas hari (29 Okt 13:36 → 30 Okt 08:26) tetap benar.
  const window = resolveTimeRange(params.from, params.to, startMinutes, endMinutes);

  const timeMatches = (date: Date): boolean => {
    if (date < window.start || date > window.end) return false;
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
    const person = directory.resolve(photo.senderName, photo.senderNumber);
    return {
      id: photo.id,
      at: (photo.capturedAt ?? photo.createdAt).toISOString(),
      timeText: photo.timeText,
      category: photo.turjawaliType as TurjawaliType,
      address: shortLocation(photo.address, photo.district),
      senderName: photo.senderName,
      senderLabel: person
        ? formatRankName(person.rank, person.name)
        : formatRankName(null, photo.senderName),
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
  const matchRoster = (senderName: string, senderNumber: string) =>
    directory.resolve(senderName, senderNumber);

  const rosterView = rosterOnly ? roster : roster;
  const isPerwira = (row: { category: string }) => row.category === 'PERWIRA';
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
      displayName: formatRankName(person.rank, person.name),
      rank: person.rank,
      rankNrp: [person.rank, person.nrp].filter(Boolean).join('/') || null,
      category: person.category,
      photos: submittedMap.get(person.id)?.photos ?? 0,
      links: submittedMap.get(person.id)?.links ?? 0
    }));
  const notSubmitted = rosterView
    .filter((person) => !submittedMap.has(person.id))
    .map((person) => ({
      name: person.name,
      displayName: formatRankName(person.rank, person.name),
      rank: person.rank,
      rankNrp: [person.rank, person.nrp].filter(Boolean).join('/') || null,
      category: person.category,
      phone: person.phone
    }));

  // Perwira tidak dibebani kewajiban pelaporan — dinilai pada pengawasan saja.
  const anggotaSubmitted = submitted.filter((person) => person.category !== 'PERWIRA');
  const anggotaNotSubmitted = notSubmitted.filter((person) => person.category !== 'PERWIRA');
  const anggotaTotal = rosterView.filter((person) => person.category !== 'PERWIRA').length;

  const label = category === 'ALL' ? 'Semua kegiatan' : category === 'POS_PAGI' ? `Pos pagi (${morningStart}–${morningEnd})` : TURJAWALI_LABELS[category];
  const supervisors = [...supervisorMap.values()].sort((a, b) => b.count - a.count);

  const lines: string[] = [
    `*REKAP ${label.toUpperCase()}*`,
    `${format(from, 'dd MMMM yyyy', { locale: localeId })}${params.to !== params.from ? ` – ${format(to, 'dd MMMM yyyy', { locale: localeId })}` : ''}${startTime !== null || endTime !== null ? ` · ${startTime ?? '00:00'}–${endTime ?? '23:59'}` : ''}`,
    '',
    `📸 Foto Timemark: ${filteredPhotos.length}`,
    `🔗 Link anggota: ${filteredLinks.length} (dari ${anggotaSubmitted.filter((p) => p.links > 0).length} anggota)`,
    `👮 Anggota sudah melapor: ${anggotaSubmitted.length}/${anggotaTotal}`,
    ''
  ];

  if (activities.length > 0) {
    lines.push('*KEGIATAN*');
    activities.slice(0, 20).forEach((activity, index) => {
      lines.push(
        `${index + 1}. ${activity.timeText ?? format(new Date(activity.at), 'HH:mm')} · ${TURJAWALI_LABELS[activity.category]} · ${activity.unitName ?? activity.senderLabel} · ${activity.address ?? '-'}`
      );
      if (activity.supervisorName || activity.supervisorSandi) {
        lines.push(
          `   👁️ ${activity.supervisorSandi ? `[${activity.supervisorSandi}] ` : ''}${formatRankName(activity.supervisorRank, activity.supervisorName)}`
        );
      }
    });
  } else {
    lines.push('_Tidak ada kegiatan pada rentang ini._');
  }

  if (supervisors.length > 0) {
    lines.push('', '*PERWIRA PENGAWAS*');
    supervisors.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.sandi ? `[${item.sandi}] ` : ''}${formatRankName(item.rank, item.name)} · ${item.count} laporan`);
    });
    lines.push('_Perwira tidak dihitung dalam kewajiban pelaporan._');
  }

  lines.push('', '*SUDAH MELAPOR*');
  if (anggotaSubmitted.length === 0) {
    lines.push('_Belum ada anggota yang melapor._');
  } else {
    anggotaSubmitted.slice(0, 30).forEach((person, index) => {
      const detail = `${person.photos} foto${person.links > 0 ? ` · ${person.links} link` : ''}`;
      lines.push(`${index + 1}. ${person.displayName} — ${detail}`);
    });
    if (anggotaSubmitted.length > 30) lines.push(`… dan ${anggotaSubmitted.length - 30} anggota lain.`);
  }

  lines.push('', '*BELUM MELAPOR*');
  if (anggotaNotSubmitted.length === 0) {
    lines.push('_Semua anggota roster sudah melapor._');
  } else {
    anggotaNotSubmitted.slice(0, 30).forEach((person, index) => {
      lines.push(`${index + 1}. ${person.displayName}`);
    });
    if (anggotaNotSubmitted.length > 30) {
      lines.push(`… dan ${anggotaNotSubmitted.length - 30} anggota lain.`);
    }
  }

  return {
    range: { from: params.from, to: params.to, startTime, endTime },
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
