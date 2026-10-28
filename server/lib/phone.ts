/**
 * Normalisasi nomor telepon Indonesia ke format `62xxxxxxxxxx` (tanpa tanda baca).
 * Dipakai untuk mencocokkan pengirim WhatsApp dengan data personel.
 */
export function normalizePhone(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  let digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('620')) digits = `62${digits.slice(3)}`;
  else if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith('8')) digits = `62${digits}`;
  return digits.length >= 9 ? digits : null;
}

/** Bandingkan dua nomor dengan toleransi awalan 62 dan digit terakhir. */
export function samePhone(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalizePhone(left);
  const b = normalizePhone(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const tail = 9;
  return a.length >= tail && b.length >= tail && a.slice(-tail) === b.slice(-tail);
}
