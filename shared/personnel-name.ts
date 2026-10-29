/**
 * Format nama personel untuk teks rekap WhatsApp: `[PANGKAT] [NAMA]`.
 *
 * Nama gelar setelah koma (mis. ", S.H.") tidak ditampilkan agar baris rekap
 * tetap ringkas. Bila pangkat belum diketahui, nama asli dipertahankan.
 */

const RANK_PREFIX =
  /^(AKBP|AKP|KOMPOL|KOMISARIS BESAR POLISI|KOMISARIS POLISI|AJUN KOMISARIS BESAR POLISI|AJUN KOMISARIS POLISI|INSPEKTUR JENDERAL POLISI|INSPEKTUR JENDERAL|BRIGADIR JENDERAL POLISI|BRIGADIR JENDERAL|KOMISARIS JENDERAL POLISI|KOMISARIS JENDERAL|IPDA|IPTU|AIPTU|AIPDA|BRIGADIR|BRIGPOL|BRIPKA|BRIPTU|BRIPDA|BHARADA|BHARA|PENATA MUDA|PENATA|PEMBINA|PRATU|PRAKA|BHAYANGKARA)\b\s*/i;

/** Ambil nama utama tanpa gelar akademik setelah koma atau di akhir nama. */
export function cleanPersonnelName(name: string | null | undefined): string {
  const value = (name ?? '').trim();
  if (!value) return '';
  let primary = value.split(',')[0]?.trim() ?? '';
  // Sebagian data tidak memakai koma sebelum gelar (mis. "ENDY K.S. S.H.").
  primary = primary.replace(
    /\s+(S\.?H\.?|S\.?I\.?K\.?|S\.?TR\.?K\.?|M\.?H\.?|M\.?M\.?|CPHR|S\.?E\.?|S\.?AP\.?|S\.?Sos\.?|A\.?Md\.?)\s*$/i,
    ''
  );
  return primary.replace(/\s+/g, ' ').trim();
}

/** Pangkat dari kolom gabungan seperti "BRIPTU/99040746". */
export function rankFromRankNrp(rankNrp: string | null | undefined): string | null {
  const value = (rankNrp ?? '').trim();
  if (!value) return null;
  const rank = value.split('/')[0]?.trim();
  return rank || null;
}

/**
 * Gabungkan pangkat dan nama. Bila nama sudah diawali pangkat, pangkat tidak
 * diduplikasi. Bila pangkat kosong, nama (termasuk pangkat yang sudah ada)
 * dipertahankan.
 */
export function formatRankName(
  rank: string | null | undefined,
  name: string | null | undefined
): string {
  const cleanName = cleanPersonnelName(name);
  const cleanRank = (rank ?? '').trim().toUpperCase();
  if (!cleanName) return cleanRank;
  if (!cleanRank) return cleanName;
  const withoutRank = cleanName.replace(RANK_PREFIX, '').trim();
  return `${cleanRank} ${withoutRank || cleanName}`.trim();
}
