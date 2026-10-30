import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { normalizePhone } from '../lib/phone.js';
import { isProbableLidNumber } from '../lib/whatsapp-sender.js';

/**
 * Nomor pengirim di database bisa berupa LID (identitas anonim WhatsApp),
 * bukan nomor HP — terutama pesan yang masuk sebelum bot membaca `participantAlt`.
 * Akibatnya pengirim tidak cocok ke roster dan muncul sebagai "belum mengirim".
 *
 * Layanan ini memetakan LID → nomor HP memakai pemetaan LID yang sudah dimiliki
 * Baileys (tersimpan di auth state), lalu memperbarui baris lama agar rekap
 * langsung mengenali pengirimnya.
 */
export type LidResolver = (lidJid: string) => Promise<string | null>;

export interface SenderBackfillResult {
  candidates: number;
  resolved: number;
  updatedLinks: number;
  updatedPhotos: number;
}

/** Terima hasil resolver (JID/nomor) dan kembalikan nomor HP 62… yang layak. */
export function toResolvedPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const phone = normalizePhone(value);
  if (!phone) return null;
  // Nomor HP Indonesia selalu diawali 62 setelah normalisasi; selain itu LID.
  if (!phone.startsWith('62')) return null;
  if (phone.length < 10 || phone.length > 15) return null;
  return phone;
}

/** Kumpulan LID unik dari nomor pengirim yang belum berupa nomor HP. */
export function collectLidNumbers(numbers: Array<string | null | undefined>): string[] {
  const unique = new Set<string>();
  for (const value of numbers) {
    const digits = (value ?? '').replace(/\D/g, '');
    if (!digits || !isProbableLidNumber(digits)) continue;
    unique.add(digits);
  }
  return [...unique];
}

let running = false;

export async function backfillSenderNumbers(
  resolveLid: LidResolver,
  options: { limit?: number } = {}
): Promise<SenderBackfillResult> {
  const limit = options.limit ?? 800;
  const result: SenderBackfillResult = {
    candidates: 0,
    resolved: 0,
    updatedLinks: 0,
    updatedPhotos: 0
  };

  if (running) return result;
  running = true;
  try {
    const [linkNumbers, photoNumbers] = await Promise.all([
      prisma.linkSubmission.findMany({ distinct: ['senderNumber'], select: { senderNumber: true } }),
      prisma.timemarkPhoto.findMany({ distinct: ['senderNumber'], select: { senderNumber: true } })
    ]);

    const lids = collectLidNumbers([
      ...linkNumbers.map((row) => row.senderNumber),
      ...photoNumbers.map((row) => row.senderNumber)
    ]).slice(0, limit);
    result.candidates = lids.length;

    for (const lid of lids) {
      let phone: string | null = null;
      try {
        phone = toResolvedPhone(await resolveLid(`${lid}@lid`));
      } catch (error) {
        logger.warn({ err: error, lid }, 'Gagal memetakan LID pengirim ke nomor HP');
      }
      if (!phone) continue;

      const [links, photos] = await Promise.all([
        prisma.linkSubmission.updateMany({ where: { senderNumber: lid }, data: { senderNumber: phone } }),
        prisma.timemarkPhoto.updateMany({ where: { senderNumber: lid }, data: { senderNumber: phone } })
      ]);
      result.resolved += 1;
      result.updatedLinks += links.count;
      result.updatedPhotos += photos.count;
    }

    if (result.resolved > 0) {
      logger.info(result, 'Nomor pengirim LID dipulihkan ke nomor HP');
    }
    return result;
  } finally {
    running = false;
  }
}
