import { endOfDay, format, startOfDay } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { prisma } from '../lib/prisma.js';
import { formatTimeOfDay, resolveTimeRange } from '../lib/time.js';
import { distanceMeters } from '../lib/geo.js';
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
  | 'PENYULUHAN'
  | 'DIKMAS_LANTAS'
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

export type PosPagiLocationStatus =
  | 'SESUAI'
  | 'TIDAK_SESUAI'
  | 'TANPA_KOORDINAT'
  | 'TANPA_TITIK'
  | 'TIDAK_MELAPOR';

export interface CustomRecapPosPagiPerson {
  assignmentId: string;
  personnelId: string | null;
  name: string;
  displayName: string;
  rank: string | null;
  role: 'ANGGOTA' | 'PADAL';
  status: 'SUBMITTED' | 'NOT_SUBMITTED' | 'UNMATCHED';
  photos: number;
  links: number;
  times: string[];
  firstAt: string;
  lastAt: string;
  reportAt: string | null;
  reportLatitude: number | null;
  reportLongitude: number | null;
  reportAddress: string | null;
  distanceMeters: number | null;
  locationStatus: PosPagiLocationStatus;
  matchMethod: string | null;
}

export interface CustomRecapPosPagiPost {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  assigned: number;
  submitted: number;
  notSubmitted: number;
  wrongLocation: number;
  unmatched: number;
  personnel: CustomRecapPosPagiPerson[];
}

export interface CustomRecapPosPagi {
  posts: CustomRecapPosPagiPost[];
  padal: CustomRecapPosPagiPerson[];
  unmatched: CustomRecapPosPagiPerson[];
  totals: {
    posts: number;
    assigned: number;
    submitted: number;
    notSubmitted: number;
    wrongLocation: number;
    unmatched: number;
    padal: number;
  };
}

export interface CustomRecapResult {
  range: { from: string; to: string; startTime: string | null; endTime: string | null };
  category: RecapCategory;
  counts: { photos: number; links: number; activities: number; supervisors: number };
  posPagi: CustomRecapPosPagi | null;
  activities: CustomRecapActivity[];
  supervisors: Array<{
    sandi: string | null;
    name: string;
    rank: string | null;
    count: number;
    firstAt: string;
    lastAt: string;
    times: string[];
    locations: string[];
  }>;
  supervisionEvents: Array<{
    id: string;
    at: string;
    time: string;
    sandi: string | null;
    name: string;
    rank: string | null;
    location: string;
    turjawaliType: string;
  }>;
  personnel: {
    rosterTotal: number;
    submitted: Array<{
      name: string;
      displayName: string;
      rank: string | null;
      rankNrp: string | null;
      category: string;
      photos: number;
      links: number;
      firstAt: string;
      lastAt: string;
      times: string[];
    }>;
    notSubmitted: Array<{
      name: string;
      displayName: string;
      rank: string | null;
      rankNrp: string | null;
      category: string;
      phone: string | null;
    }>;
  };
  text: string;
}

/** Cadangan untuk foto lama: ambil nama dari teks OCR yang sudah tersimpan. */

function normalizeTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((token) => token.length > 2);
}

/**
 * Tentukan personel roster untuk sebuah foto. Urutan sama dengan rekap pos pagi
 * yang terbukti mengenali pelapor: nama di watermark, lalu nama di teks OCR,
 * lalu pengirim, lalu kecocokan token nama (toleran singkatan).
 */
function resolvePhotoPerson(
  photo: { personnelName: string | null; rawText: string | null; senderName: string; senderNumber: string },
  directory: PersonnelDirectory,
  roster: Array<{ id: string; name: string; rank: string | null }>
): { id: string; name: string; rank: string | null } | null {
  const direct =
    (photo.personnelName ? directory.resolve(photo.personnelName, null) : null) ??
    directory.resolve(nameFromRawText(photo.rawText), null) ??
    directory.resolve(photo.senderName, photo.senderNumber);
  if (direct) return direct;

  const senderTokens = new Set(normalizeTokens(photo.senderName));
  if (senderTokens.size === 0) return null;
  let best: { id: string; name: string; rank: string | null; score: number } | null = null;
  for (const person of roster) {
    const personTokens = normalizeTokens(person.name);
    if (personTokens.length === 0) continue;
    const overlap = personTokens.filter((token) => senderTokens.has(token)).length;
    const needed = Math.min(2, personTokens.length);
    if (overlap >= needed && overlap > (best?.score ?? 0)) {
      best = { id: person.id, name: person.name, rank: person.rank, score: overlap };
    }
  }
  return best ? { id: best.id, name: best.name, rank: best.rank } : null;
}

function nameFromRawText(rawText: string | null | undefined): string | null {
  if (!rawText) return null;
  const match = rawText.match(/NAMA\s*[:;]\s*([^\n|]{3,80})/i);
  if (!match) return null;
  const value = match[1].replace(/\s{2,}/g, ' ').trim().replace(/[.,;:]+$/, '');
  return value.length >= 3 ? value : null;
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

  const posPagiPosts =
    category === 'POS_PAGI'
      ? await prisma.posPagi.findMany({
          where: { active: true },
          orderBy: [{ order: 'asc' }, { name: 'asc' }],
          include: {
            assignments: {
              where: { active: true },
              orderBy: [{ no: 'asc' }],
              include: { personnel: true }
            }
          }
        })
      : [];
  const posPagiPadal =
    category === 'POS_PAGI'
      ? await prisma.posPagiAssignment.findMany({
          where: { active: true, posId: null, role: 'PADAL' },
          orderBy: [{ no: 'asc' }],
          include: { personnel: true }
        })
      : [];

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

  // Link hanya relevan untuk rekap gabungan ("Semua kegiatan"). Pada rekap per
  // kategori (mis. Gatur), laporan link tidak boleh ikut dihitung — kalau tidak,
  // anggota yang hanya mengirim link akan muncul sebagai "sudah melapor".
  const filteredLinks = category === 'ALL' ? links.filter((link) => timeMatches(link.receivedAt)) : [];

  const activities: CustomRecapActivity[] = filteredPhotos.map((photo) => {
    const current = photo.supervisorSandi ? sandiMap[photo.supervisorSandi] : undefined;
    // Nama pada watermark ("Nama: ...") adalah subjek laporan; pengirim hanya
    // cadangan bila nama di foto tidak terbaca.
    const person = resolvePhotoPerson(photo, directory, roster);
    return {
      id: photo.id,
      at: (photo.capturedAt ?? photo.createdAt).toISOString(),
      timeText: photo.timeText,
      category: photo.turjawaliType as TurjawaliType,
      address: shortLocation(photo.address, photo.district),
      senderName: photo.senderName,
      senderLabel: person
        ? formatRankName(person.rank, person.name)
        : (photo.senderName ?? '').trim(),
      unitName: photo.unitName,
      matchStatus: photo.matchStatus,
      supervisorSandi: photo.supervisorSandi,
      supervisorName: current?.name ?? photo.supervisorName,
      supervisorRank: current?.rank ?? photo.supervisorRank
    };
  });

  // Perwira pengawas: dari sandi yang disebut di caption/OCR + hasil deteksi.
  // Dicatat per kejadian supaya laporan bisa menyebut jam dan lokasinya.
  const supervisionEvents = filteredPhotos
    .filter((photo) => photo.isSupervision || photo.supervisorSandi || photo.supervisorName)
    .map((photo) => {
      const current = photo.supervisorSandi ? sandiMap[photo.supervisorSandi] : undefined;
      const codes = findSandiCodes(photo.caption ?? '');
      const sandi = photo.supervisorSandi ?? codes[0] ?? null;
      const mapped = sandi ? sandiMap[sandi] : undefined;
      const at = photo.capturedAt ?? photo.createdAt;
      return {
        id: photo.id,
        at: at.toISOString(),
        time: format(at, 'HH:mm'),
        sandi,
        name: mapped?.name ?? current?.name ?? photo.supervisorName ?? '(belum dipetakan)',
        rank: mapped?.rank ?? current?.rank ?? photo.supervisorRank,
        location: shortLocation(photo.address, photo.district),
        turjawaliType: photo.turjawaliType
      };
    })
    .sort((a, b) => a.at.localeCompare(b.at));

  const supervisorMap = new Map<
    string,
    {
      sandi: string | null;
      name: string;
      rank: string | null;
      count: number;
      firstAt: string;
      lastAt: string;
      times: string[];
      locations: string[];
    }
  >();
  for (const event of supervisionEvents) {
    const key = `${event.sandi ?? ''}|${event.name}`;
    const current = supervisorMap.get(key) ?? {
      sandi: event.sandi,
      name: event.name,
      rank: event.rank,
      count: 0,
      firstAt: event.at,
      lastAt: event.at,
      times: [],
      locations: []
    };
    current.count += 1;
    current.times.push(event.time);
    if (!current.locations.includes(event.location)) current.locations.push(event.location);
    if (event.at < current.firstAt) current.firstAt = event.at;
    if (event.at > current.lastAt) current.lastAt = event.at;
    supervisorMap.set(key, current);
  }

  const submittedMap = new Map<string, { photos: number; links: number; times: Date[] }>();
  const reportsByPerson = new Map<
    string,
    Array<{ at: Date; latitude: number | null; longitude: number | null; address: string | null }>
  >();
  const matchRoster = (senderName: string, senderNumber: string) =>
    directory.resolve(senderName, senderNumber);

  const rosterView = rosterOnly ? roster : roster;
  const isPerwira = (row: { category: string }) => row.category === 'PERWIRA';
  for (const photo of filteredPhotos) {
    const person = resolvePhotoPerson(photo, directory, roster);
    if (!person) continue;
    const at = photo.capturedAt ?? photo.createdAt;
    const entry = submittedMap.get(person.id) ?? { photos: 0, links: 0, times: [] };
    entry.photos += 1;
    entry.times.push(at);
    submittedMap.set(person.id, entry);
    const reports = reportsByPerson.get(person.id) ?? [];
    reports.push({
      at,
      latitude: photo.latitude ?? null,
      longitude: photo.longitude ?? null,
      address: photo.address ?? null
    });
    reportsByPerson.set(person.id, reports);
  }
  for (const link of filteredLinks) {
    const person = matchRoster(link.senderName, link.senderNumber);
    if (!person) continue;
    const entry = submittedMap.get(person.id) ?? { photos: 0, links: 0, times: [] };
    entry.links += 1;
    entry.times.push(link.receivedAt);
    submittedMap.set(person.id, entry);
  }

  const posPagi: CustomRecapPosPagi | null =
    category === 'POS_PAGI'
      ? (() => {
          const makePerson = (
            assignment: {
              id: string;
              personnelId: string | null;
              name: string;
              rank: string | null;
              matchMethod: string | null;
              personnel: {
                id: string;
                name: string;
                rank: string | null;
                nrp: string | null;
                phone: string | null;
                category: string;
              } | null;
            },
            post: { latitude: number | null; longitude: number | null; radiusMeters: number } | null,
            role: 'ANGGOTA' | 'PADAL'
          ): CustomRecapPosPagiPerson => {
            const person = assignment.personnel;
            const entry = person ? submittedMap.get(person.id) : undefined;
            const submitted = Boolean(entry && (entry.photos > 0 || entry.links > 0));
            const sortedTimes = entry
              ? [...entry.times].sort((a, b) => a.getTime() - b.getTime())
              : [];
            const times = [...new Set(sortedTimes.map((value) => format(value, 'HH:mm')))];
            const reports = person ? (reportsByPerson.get(person.id) ?? []) : [];

            let nearest:
              | {
                  at: Date;
                  distance: number;
                  latitude: number;
                  longitude: number;
                  address: string | null;
                }
              | null = null;
            if (post && post.latitude !== null && post.longitude !== null) {
              const postLatitude = post.latitude;
              const postLongitude = post.longitude;
              for (const report of reports) {
                if (report.latitude === null || report.longitude === null) continue;
                const distance = distanceMeters(
                  postLatitude,
                  postLongitude,
                  report.latitude,
                  report.longitude
                );
                if (!nearest || distance < nearest.distance) {
                  nearest = {
                    at: report.at,
                    distance,
                    latitude: report.latitude,
                    longitude: report.longitude,
                    address: report.address
                  };
                }
              }
            }

            const locationStatus: PosPagiLocationStatus = !person
              ? 'TIDAK_MELAPOR'
              : !submitted
                ? 'TIDAK_MELAPOR'
                : !post || post.latitude === null || post.longitude === null
                  ? 'TANPA_TITIK'
                  : nearest
                    ? nearest.distance <= (post?.radiusMeters ?? 100)
                      ? 'SESUAI'
                      : 'TIDAK_SESUAI'
                    : 'TANPA_KOORDINAT';

            return {
              assignmentId: assignment.id,
              personnelId: person?.id ?? null,
              name: person?.name ?? assignment.name,
              displayName: formatRankName(person?.rank ?? assignment.rank, person?.name ?? assignment.name),
              rank: person?.rank ?? assignment.rank,
              role,
              status: !person ? 'UNMATCHED' : submitted ? 'SUBMITTED' : 'NOT_SUBMITTED',
              photos: entry?.photos ?? 0,
              links: entry?.links ?? 0,
              times,
              firstAt: sortedTimes[0]?.toISOString() ?? '',
              lastAt: sortedTimes[sortedTimes.length - 1]?.toISOString() ?? '',
              reportAt: nearest?.at.toISOString() ?? reports[0]?.at.toISOString() ?? null,
              reportLatitude: nearest?.latitude ?? null,
              reportLongitude: nearest?.longitude ?? null,
              reportAddress: nearest?.address ?? reports[0]?.address ?? null,
              distanceMeters: nearest?.distance ?? null,
              locationStatus,
              matchMethod: assignment.matchMethod
            };
          };

          const posts: CustomRecapPosPagiPost[] = posPagiPosts.map((post) => {
            const personnel = post.assignments.map((assignment) =>
              makePerson(assignment, post, 'ANGGOTA')
            );
            return {
              id: post.id,
              name: post.name,
              latitude: post.latitude,
              longitude: post.longitude,
              radiusMeters: post.radiusMeters,
              assigned: personnel.length,
              submitted: personnel.filter((person) => person.status === 'SUBMITTED').length,
              notSubmitted: personnel.filter((person) => person.status === 'NOT_SUBMITTED').length,
              wrongLocation: personnel.filter((person) => person.locationStatus === 'TIDAK_SESUAI').length,
              unmatched: personnel.filter((person) => person.status === 'UNMATCHED').length,
              personnel
            };
          });
          const padal = posPagiPadal.map((assignment) => makePerson(assignment, null, 'PADAL'));
          const allPersonnel = [...posts.flatMap((post) => post.personnel), ...padal];
          return {
            posts,
            padal,
            unmatched: allPersonnel.filter((person) => person.status === 'UNMATCHED'),
            totals: {
              posts: posts.length,
              assigned: allPersonnel.length,
              submitted: allPersonnel.filter((person) => person.status === 'SUBMITTED').length,
              notSubmitted: allPersonnel.filter((person) => person.status === 'NOT_SUBMITTED').length,
              wrongLocation: allPersonnel.filter((person) => person.locationStatus === 'TIDAK_SESUAI')
                .length,
              unmatched: allPersonnel.filter((person) => person.status === 'UNMATCHED').length,
              padal: padal.length
            }
          };
        })()
      : null;

  const baseSubmitted = rosterView
    .filter((person) => submittedMap.has(person.id))
    .map((person) => {
      const entry = submittedMap.get(person.id)!;
      const sorted = [...entry.times].sort((a, b) => a.getTime() - b.getTime());
      const times = [...new Set(sorted.map((value) => format(value, 'HH:mm')))];
      return {
        name: person.name,
        displayName: formatRankName(person.rank, person.name),
        rank: person.rank,
        rankNrp: [person.rank, person.nrp].filter(Boolean).join('/') || null,
        category: person.category,
        photos: entry.photos,
        links: entry.links,
        firstAt: sorted[0]?.toISOString() ?? '',
        lastAt: sorted[sorted.length - 1]?.toISOString() ?? '',
        times
      };
    });
  const baseNotSubmitted = rosterView
    .filter((person) => !submittedMap.has(person.id))
    .map((person) => ({
      name: person.name,
      displayName: formatRankName(person.rank, person.name),
      rank: person.rank,
      rankNrp: [person.rank, person.nrp].filter(Boolean).join('/') || null,
      category: person.category,
      phone: person.phone
    }));

  // Untuk rekap POS PAGI, kewajiban lapor hanya untuk anggota yang tercantum
  // di pos — bukan seluruh roster Satlantas.
  const posPagiAnggota = posPagi
    ? posPagi.posts.flatMap((post) => post.personnel).filter((person) => person.role === 'ANGGOTA')
    : [];
  const rosterById = new Map(roster.map((person) => [person.id, person]));
  const submitted = posPagi
    ? posPagiAnggota
        .filter((person) => person.status === 'SUBMITTED' && person.personnelId)
        .map((person) => {
          const rosterPerson = rosterById.get(person.personnelId!);
          return {
            name: person.name,
            displayName: person.displayName,
            rank: person.rank,
            rankNrp: [person.rank, rosterPerson?.nrp].filter(Boolean).join('/') || null,
            category: rosterPerson?.category ?? 'ANGGOTA',
            photos: person.photos,
            links: person.links,
            firstAt: person.firstAt,
            lastAt: person.lastAt,
            times: person.times
          };
        })
        .sort((a, b) => a.firstAt.localeCompare(b.firstAt) || a.displayName.localeCompare(b.displayName))
    : baseSubmitted;
  const notSubmitted = posPagi
    ? posPagiAnggota
        .filter((person) => person.status === 'NOT_SUBMITTED' && person.personnelId)
        .map((person) => {
          const rosterPerson = rosterById.get(person.personnelId!);
          return {
            name: person.name,
            displayName: person.displayName,
            rank: person.rank,
            rankNrp: [person.rank, rosterPerson?.nrp].filter(Boolean).join('/') || null,
            category: rosterPerson?.category ?? 'ANGGOTA',
            phone: rosterPerson?.phone ?? null
          };
        })
    : baseNotSubmitted;

  // Perwira tidak dibebani kewajiban pelaporan — dinilai pada pengawasan saja.
  const anggotaSubmitted = submitted
    .filter((person) => person.category !== 'PERWIRA')
    // Urutkan dari jam Timemark paling awal; bila jam sama, urut nama.
    .sort((a, b) => a.firstAt.localeCompare(b.firstAt) || a.displayName.localeCompare(b.displayName));
  const anggotaNotSubmitted = notSubmitted.filter((person) => person.category !== 'PERWIRA');
  const anggotaTotal = posPagi
    ? new Set(posPagiAnggota.map((person) => person.personnelId).filter(Boolean)).size
    : rosterView.filter((person) => person.category !== 'PERWIRA').length;

  const label = category === 'ALL' ? 'Semua kegiatan' : category === 'POS_PAGI' ? `Pos pagi (${morningStart}–${morningEnd})` : TURJAWALI_LABELS[category];
  const supervisors = [...supervisorMap.values()].sort((a, b) => b.count - a.count);

  const lines: string[] = [
    `*REKAP ${label.toUpperCase()}*`,
    `${format(from, 'dd MMMM yyyy', { locale: localeId })}${params.to !== params.from ? ` – ${format(to, 'dd MMMM yyyy', { locale: localeId })}` : ''}${startTime !== null || endTime !== null ? ` · ${startTime ?? '00:00'}–${endTime ?? '23:59'}` : ''}`,
    '',
    `📸 Foto Timemark: ${filteredPhotos.length}`,
    // Link hanya relevan pada rekap gabungan; rekap per kategori fokus ke foto.
    ...(category === 'ALL'
      ? [`🔗 Link anggota: ${filteredLinks.length} (dari ${anggotaSubmitted.filter((p) => p.links > 0).length} anggota)`]
      : []),
    `👮 Anggota sudah melapor: ${anggotaSubmitted.length}/${anggotaTotal}`,
    ''
  ];

  if (activities.length > 0) {
    const perCategory = new Map<TurjawaliType, number>();
    for (const activity of activities) {
      perCategory.set(activity.category, (perCategory.get(activity.category) ?? 0) + 1);
    }
    lines.push('*KEGIATAN*');
    lines.push(`Total ${activities.length} kegiatan`);
    [...perCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, count]) => {
        lines.push(`• ${TURJAWALI_LABELS[category] ?? category} : ${count} kegiatan`);
      });

    // Rincian tiap kegiatan dengan jam pengecekan (waktu Timemark), urut kronologis.
    const sortedActivities = [...activities].sort((a, b) => a.at.localeCompare(b.at));
    lines.push('', '*RINCIAN KEGIATAN*');
    sortedActivities.forEach((activity, index) => {
      const time = format(new Date(activity.at), 'HH:mm');
      const categoryLabel =
        category === 'ALL' ? ` · ${TURJAWALI_LABELS[activity.category] ?? activity.category}` : '';
      const unit = activity.unitName ? ` · ${activity.unitName}` : '';
      lines.push(`${index + 1}. ${time} — ${activity.senderLabel} · ${activity.address}${unit}${categoryLabel}`);
    });
  } else {
    lines.push('_Tidak ada kegiatan pada rentang ini._');
  }

  lines.push('', '*SUPERVISI PERWIRA*');
  if (supervisionEvents.length === 0) {
    lines.push('_Belum ada laporan supervisi/pengecekan perwira terdeteksi pada rentang ini._');
  } else {
    supervisionEvents.forEach((event, index) => {
      const who = formatRankName(event.rank, event.name);
      const sandi = event.sandi ? ` [${event.sandi}]` : '';
      lines.push(`${index + 1}. ${event.time} — ${who}${sandi} · ${event.location}`);
    });
    lines.push(
      `_Total ${supervisionEvents.length} laporan supervisi dari ${supervisors.length} perwira._`
    );
  }

  if (posPagi) {
    lines.push('', '*POS PAGI*');
    if (posPagi.posts.length === 0) {
      lines.push('_Belum ada data pos pagi. Impor lewat Settings → Pos Pagi._');
    } else {
      posPagi.posts.forEach((post, index) => {
        lines.push(
          `${index + 1}. ${post.name} — ${post.assigned} anggota · ${post.submitted} lapor · ${post.notSubmitted} belum${post.wrongLocation ? ` · ${post.wrongLocation} tidak sesuai titik` : ''}`
        );
      });
    }
    if (posPagi.padal.length > 0) {
      lines.push(
        `PADAL: ${posPagi.padal.filter((person) => person.status === 'SUBMITTED').length}/${posPagi.padal.length} sudah melapor`
      );
    }

    const wrongLocation = posPagi.posts
      .flatMap((post) =>
        post.personnel
          .filter((person) => person.locationStatus === 'TIDAK_SESUAI')
          .map((person) => ({ post, person }))
      )
      .sort((a, b) => a.post.name.localeCompare(b.post.name));
    lines.push('', '*TIDAK SESUAI TITIK*');
    if (wrongLocation.length === 0) {
      lines.push('_Semua laporan yang masuk berada dalam radius titik pos._');
    } else {
      wrongLocation.forEach(({ post, person }, index) => {
        lines.push(
          `${index + 1}. ${person.displayName} — ${post.name} · ${person.distanceMeters ?? '?'} m (radius ${post.radiusMeters} m)`
        );
      });
    }

    if (posPagi.unmatched.length > 0) {
      lines.push('', '*BELUM TERHUBUNG KE ROSTER*');
      posPagi.unmatched.forEach((person, index) => {
        lines.push(`${index + 1}. ${person.name} — ${person.role === 'PADAL' ? 'PADAL' : 'anggota pos'}`);
      });
      lines.push('_Hubungkan lewat Settings → Pos Pagi agar ikut dinilai._');
    }
  }

  lines.push('', '*SUDAH MELAPOR*');
  if (anggotaSubmitted.length === 0) {
    lines.push('_Belum ada anggota yang melapor._');
  } else {
    anggotaSubmitted.forEach((person, index) => {
      const detail = `${person.photos} foto${person.links > 0 ? ` · ${person.links} link` : ''}`;
      const time =
        person.times.length > 1
          ? `${person.times[0]}–${person.times[person.times.length - 1]}`
          : (person.times[0] ?? '-');
      lines.push(`${index + 1}. ${person.displayName} — ${detail} · ${time}`);
    });
  }

  lines.push('', '*BELUM MELAPOR*');
  if (anggotaNotSubmitted.length === 0) {
    lines.push('_Semua anggota roster sudah melapor._');
  } else {
    anggotaNotSubmitted.forEach((person, index) => {
      lines.push(`${index + 1}. ${person.displayName}`);
    });
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
    supervisionEvents,
    personnel: { rosterTotal: posPagi ? anggotaTotal : rosterView.length, submitted, notSubmitted },
    posPagi,
    text: lines.join('\n')
  };
}
