/**
 * Normalisasi nomor telepon Indonesia ke format `62xxxxxxxxxx` (tanpa tanda baca).
 * Dipakai untuk mencocokkan pengirim WhatsApp dengan data personel.
 */
export function normalizePhone(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  // JID WhatsApp: "628...:12@s.whatsapp.net". Bagian ":12" adalah ID perangkat,
  // bukan bagian nomor HP, jadi harus dibuang sebelum menyaring digit.
  let text = String(value).trim();
  const at = text.indexOf('@');
  if (at >= 0) text = text.slice(0, at);
  text = text.replace(/:\d+$/, '');
  let digits = text.replace(/\D/g, '');
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
/**
 * Ambil nomor HP Indonesia pertama dari teks bebas (mis. kolom KET lampiran
 * Sprin: "08113671001 nomor hp"). Mengembalikan format 62xxxxxxxxxx.
 */
export function findPhone(text: string | null | undefined): string | null {
  if (!text) return null;
  // Izinkan pemisah spasi/titik/strip di antara digit (mis. "+62 811 3671 001").
  const match = String(text).match(/(?:\+?62|0)[\s.-]?8(?:\d[\s.-]?){7,11}/);
  if (!match) return null;
  return normalizePhone(match[0]);
}