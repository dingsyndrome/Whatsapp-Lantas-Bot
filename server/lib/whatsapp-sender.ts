import { normalizePhone } from './phone.js';

/**
 * Baileys dapat mengirim `participant` dalam format LID dan nomor HP asli di
 * `participantAlt` (atau sebaliknya, tergantung addressing mode grup). Ambil
 * JID telepon bila tersedia supaya pengirim dapat dicocokkan ke roster.
 */
function isPhoneJid(value: string | null | undefined): boolean {
  return Boolean(value && /@(s\.whatsapp\.net|c\.us)$/i.test(value));
}

/** JID identitas anonim WhatsApp (`123456789@lid` atau `@hosted.lid`). */
export function isLidJid(value: string | null | undefined): boolean {
  return Boolean(value && /@(hosted\.lid|lid)$/i.test(value));
}

/**
 * Nomor tersimpan yang sebenarnya LID, bukan nomor HP.
 * LID selalu panjang (13-16 digit); nomor HP Indonesia setelah normalisasi
 * diawali `62` dan lebih pendek, atau masih diawali `0`/`8` bila belum dinormalisasi.
 */
export function isProbableLidNumber(value: string | null | undefined): boolean {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return false;
  if (digits.length >= 14) return true;
  if (digits.startsWith('62') || digits.startsWith('0') || digits.startsWith('8')) return false;
  return digits.length >= 10;
}

/** Ubah LID (dengan atau tanpa `@lid`) menjadi JID yang dikenali Baileys. */
export function toLidJid(value: string): string {
  const trimmed = value.trim();
  if (isLidJid(trimmed)) return trimmed;
  return `${trimmed.replace(/\D/g, '')}@lid`;
}

function looksLikePhone(value: string | null | undefined): boolean {
  if (!value) return false;
  const digits = value.replace(/\D/g, '');
  return (
    digits.length >= 10 &&
    digits.length <= 15 &&
    (digits.startsWith('62') || digits.startsWith('0') || digits.startsWith('8'))
  );
}

/** Pilih JID yang paling mungkin berisi nomor HP, dengan fallback ke JID utama. */
export function resolveSenderJid(
  primary: string | null | undefined,
  alternate?: string | null | undefined
): string {
  if (isPhoneJid(primary)) return primary as string;
  if (isPhoneJid(alternate)) return alternate as string;
  if (alternate && looksLikePhone(alternate)) return alternate;
  return primary ?? alternate ?? '';
}

/** Nomor pengirim ternormalisasi; fallback ke JID apa adanya bila bukan nomor HP. */
export function resolveSenderNumber(
  primary: string | null | undefined,
  alternate?: string | null | undefined
): string {
  const jid = resolveSenderJid(primary, alternate);
  return normalizePhone(jid) ?? jid;
}
