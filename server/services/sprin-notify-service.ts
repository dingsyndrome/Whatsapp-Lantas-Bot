import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { recordActivity } from '../lib/activity.js';
import { samePhone } from '../lib/phone.js';
import { whatsappManager } from './whatsapp-manager.js';
import { TURJAWALI_LABELS, type TurjawaliType } from '../../shared/types.js';

export interface SprinNotificationItem {
  personnelId: string;
  name: string;
  phone: string | null;
  status:
    | 'sent'
    | 'preview'
    | 'skipped_no_phone'
    | 'skipped_excluded'
    | 'skipped_already'
    | 'failed'
    | 'already';
  message?: string;
  reason?: string;
}

export interface SprinNotificationResult {
  sprinNumber: string;
  matchedRoster: number;
  sent: number;
  failed: number;
  skipped: number;
  items: SprinNotificationItem[];
}

/** Jabatan yang tidak dikirimi notifikasi (mis. pimpinan satuan). */
const EXCLUDED_JABATAN = /KASAT\s*LANTAS|KEPALA\s*SATUAN|KAPOLRES/i;

function normalizeName(value: string): string {
  return value
    .toUpperCase()
    .replace(/\b(S\.?H\.?|S\.?I\.?K\.?|S\.?TR\.?K\.?|M\.?H\.?|M\.?M\.?|CPHR|S\.?E\.?)\b/g, ' ')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstTokens(name: string, count = 2): string {
  return normalizeName(name).split(' ').slice(0, count).join(' ');
}


/** Lokasi per orang: pakai kolom KET, atau bagian akhir jabatan bila Sprin hanya menulis 'terlampir'. */
function resolvePlace(place: string | null, ket: string | null, jabatan: string | null): string | null {
  const generic = !place || /terlampir|sesuai jadwal|lihat lampiran/i.test(place);
  if (!generic) return place;
  if (ket && ket.trim().length > 0) return `${ket.trim()} (${place ?? 'sesuai lampiran'})`;
  const tail = (jabatan ?? '').split(/\s{2,}|\s-\s/).pop()?.trim();
  return tail && tail.length > 3 ? tail : place;
}

export function buildSprinMessage(input: {
  personName: string;
  rankNrp: string | null;
  duty: string | null;
  sprinNumber: string;
  about: string | null;
  place: string | null;
  activityDate: Date | null;
  timeText: string | null;
  turjawaliType: TurjawaliType;
  botName: string;
}): string {
  const tanggal = input.activityDate
    ? format(input.activityDate, 'EEEE, dd MMMM yyyy', { locale: localeId })
    : 'sesuai jadwal';
  const jam = input.timeText ? `pukul ${input.timeText}` : 'sesuai jadwal pos';
  const tugas = input.duty ?? 'melaksanakan tugas sesuai Sprin';

  return [
    `*${input.botName}*`,
    `Halo ${input.personName}${input.rankNrp ? ` (${input.rankNrp})` : ''},`,
    '',
    `Anda tercatat dalam *${input.sprinNumber}* (${TURJAWALI_LABELS[input.turjawaliType]}).`,
    '',
    `• Tugas: ${tugas}`,
    `• Kegiatan: ${(input.about ?? 'sesuai Surat Perintah').slice(0, 220)}`,
    `• Lokasi: ${input.place ?? 'sesuai Sprin'}`,
    `• Jadwal: ${tanggal}, ${jam}`,
    `• Berlaku: sampai Sprin pengganti diterbitkan`,
    '',
    'Mohon melaksanakan tugas, lalu kirim *foto Timemark* dan *link laporan* ke grup ini.',
    '',
    '_Pesan otomatis SIGAP._'
  ].join('\n');
}

/**
 * Kirim notifikasi personal ke setiap personel dalam Sprin yang nomornya
 * tersedia di roster (dicocokkan lewat NRP lalu nama). Kasat Lantas dan
 * personel tanpa nomor dilewati. Bisa dipanggil ulang; yang sudah pernah
 * dikirimi dilewati kecuali `force`.
 */
export async function notifySprinPersonnel(
  sprinId: string,
  options: { force?: boolean; dryRun?: boolean; limit?: number } = {}
): Promise<SprinNotificationResult | null> {
  const sprin = await prisma.sprin.findUnique({
    where: { id: sprinId },
    include: { personnel: { orderBy: [{ page: 'asc' }, { no: 'asc' }] } }
  });
  if (!sprin) return null;

  const roster = await prisma.personnel.findMany({
    where: { active: true },
    select: { id: true, name: true, nrp: true, phone: true, jabatan: true, rank: true }
  });
  const byNrp = new Map(roster.filter((p) => p.nrp).map((p) => [p.nrp as string, p]));
  const byName = new Map(roster.map((p) => [normalizeName(p.name), p]));
  const byShort = new Map(roster.map((p) => [firstTokens(p.name), p]));

  const items: SprinNotificationItem[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let matchedRoster = 0;

  for (const person of sprin.personnel) {
    const rosterMatch =
      (person.nrp ? byNrp.get(person.nrp) : undefined) ??
      byName.get(normalizeName(person.name)) ??
      byShort.get(firstTokens(person.name)) ??
      null;

    if (rosterMatch) matchedRoster += 1;

    const phone = person.phone ?? rosterMatch?.phone ?? null;
    const jabatan = person.jabatan ?? rosterMatch?.jabatan ?? null;

    if (EXCLUDED_JABATAN.test(jabatan ?? '')) {
      skipped += 1;
      items.push({
        personnelId: person.id,
        name: person.name,
        phone,
        status: 'skipped_excluded',
        reason: 'Kasat Lantas / pimpinan satuan tidak dikirimi notifikasi'
      });
      continue;
    }

    if (!phone) {
      skipped += 1;
      items.push({
        personnelId: person.id,
        name: person.name,
        phone: null,
        status: 'skipped_no_phone',
        reason: 'Nomor HP tidak ada di roster'
      });
      continue;
    }

    if (options.limit && sent + failed >= options.limit) {
      skipped += 1;
      items.push({
        personnelId: person.id,
        name: person.name,
        phone,
        status: 'already',
        reason: 'Batas kirim per proses tercapai'
      });
      continue;
    }

    if (person.notifiedAt && !options.force) {
      skipped += 1;
      items.push({ personnelId: person.id, name: person.name, phone, status: 'already' });
      continue;
    }

    const message = buildSprinMessage({
      personName: person.name,
      rankNrp: person.rankNrp,
      duty: person.penugasan
        ? `${person.penugasan}${jabatan ? ` — ${jabatan}` : ''}`
        : jabatan,
      sprinNumber: sprin.number,
      about: sprin.about,
      place: resolvePlace(sprin.place, person.ket, person.jabatan),
      activityDate: sprin.activityDate,
      timeText: sprin.timeText,
      turjawaliType: sprin.turjawaliType as TurjawaliType,
      botName: (await prisma.botConfig.findUnique({ where: { id: 'singleton' } }))?.botName ?? 'SIGAP'
    });

    if (options.dryRun) {
      skipped += 1;
      items.push({ personnelId: person.id, name: person.name, phone, status: 'preview', message });
      continue;
    }

    const jid = `${phone}@c.us`;
    const ok = await whatsappManager.sendMessage(jid, message).catch(() => false);
    if (ok) {
      sent += 1;
      await prisma.sprinPersonnel.update({
        where: { id: person.id },
        data: { notifiedAt: new Date() }
      });
      // Jeda antar pesan agar nomor bot tidak diblokir WhatsApp.
      await new Promise((resolve) => setTimeout(resolve, 4000));
      items.push({ personnelId: person.id, name: person.name, phone, status: 'sent' });
    } else {
      failed += 1;
      items.push({
        personnelId: person.id,
        name: person.name,
        phone,
        status: 'failed',
        reason: 'WhatsApp belum terhubung atau pengiriman gagal'
      });
    }
  }

  await recordActivity({
    type: 'sprin_notify',
    title: 'Notifikasi Sprin dikirim ke personel',
    description: `${sprin.number} · terkirim ${sent}, gagal ${failed}, dilewati ${skipped}`,
    actor: 'SIGAP',
    entityType: 'sprin',
    entityId: sprinId,
    metadata: { sent, failed, skipped, matchedRoster }
  });

  logger.info(
    { sprin: sprin.number, sent, failed, skipped, matchedRoster },
    'Notifikasi Sprin selesai'
  );

  return { sprinNumber: sprin.number, matchedRoster, sent, failed, skipped, items };
}

export { samePhone };

/** Dipanggil otomatis setelah Sprin diunggah/diingest (jika diaktifkan). */
export async function autoNotifySprin(sprinId: string): Promise<void> {
  const bot = await prisma.botConfig.findUnique({ where: { id: 'singleton' } });
  if (bot && bot.notifyOnSprinUpload === false) return;
  const status = whatsappManager.getStatus();
  if (status.status !== 'connected' && status.status !== 'mock') {
    logger.info({ status: status.status }, 'Notifikasi Sprin ditunda: WhatsApp belum terhubung');
    return;
  }
  try {
    await notifySprinPersonnel(sprinId);
  } catch (error) {
    logger.warn({ err: error }, 'Gagal mengirim notifikasi Sprin otomatis');
  }
}