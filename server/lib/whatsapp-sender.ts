import { normalizePhone } from './phone.js';

/**
 * Baileys dapat mengirim `participant` dalam format LID dan nomor HP asli di
 * `participantAlt` (atau sebaliknya, tergantung addressing mode grup). Ambil
 * JID telepon bila tersedia supaya pengirim dapat dicocokkan ke roster.
 */
function isPhoneJid(value: string | null | undefined): boolean {
  return Boolean(value && /@(s\.whatsapp\.net|c\.us)$/i.test(value));
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
