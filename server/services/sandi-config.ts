/**
 * Peta kode sandi (call sign) yang dipakai Polres:
 * - `12.1` … `12.6` untuk perwira Satlantas.
 * - `AGUNG 1` … `AGUNG 16` untuk jajaran Pejabat Utama (PJU) Polres.
 *
 * Label di bawah adalah jabatan yang lazim memegang sandi tersebut; nilainya
 * bisa ditimpa operator lewat Settings → Personel.
 */
export interface SandiSlotDefinition {
  code: string;
  label: string;
  /** Pola jabatan untuk menebak pemegang sandi secara otomatis. */
  jabatanPattern?: RegExp;
}

export const SANDI_SLOTS: SandiSlotDefinition[] = [
  { code: '12.1', label: 'Kasat Lantas', jabatanPattern: /KASAT\s*LANTAS/ },
  { code: '12.2', label: 'KBO Satlantas', jabatanPattern: /\bKBO\b/ },
  { code: '12.3', label: 'Kaur Mintu', jabatanPattern: /KAUR\s*MINTU|KAURMINTU/ },
  { code: '12.4', label: 'Kanit Regident', jabatanPattern: /KANIT\s*REGIDENT/ },
  { code: '12.5', label: 'Kanit Turjagwali', jabatanPattern: /KANIT\s*TURJAG/ },
  { code: '12.6', label: 'Kanit Gakkum', jabatanPattern: /KANIT\s*GAKKUM/ }
];

export const AGUNG_SLOTS: SandiSlotDefinition[] = [
  { code: 'AGUNG 1', label: 'Kapolres' },
  { code: 'AGUNG 2', label: 'Wakapolres', jabatanPattern: /\bWAKA\b/ },
  { code: 'AGUNG 3', label: 'Kabag Ops', jabatanPattern: /KABAG\s*OPS/ },
  { code: 'AGUNG 4', label: 'Kabag Ren', jabatanPattern: /KABAG\s*REN/ },
  { code: 'AGUNG 5', label: 'Kabag SDM', jabatanPattern: /KABAG\s*SDM/ },
  { code: 'AGUNG 6', label: 'Kasat Lantas', jabatanPattern: /KASAT\s*LANTAS/ },
  { code: 'AGUNG 7', label: 'Kasat Reskrim' },
  { code: 'AGUNG 8', label: 'Kasat Narkoba' },
  { code: 'AGUNG 9', label: 'Kasat Intelkam' },
  { code: 'AGUNG 10', label: 'Kasat Sabhara' },
  { code: 'AGUNG 11', label: 'Kasat Binmas' },
  { code: 'AGUNG 12', label: 'Kasat Tahti' },
  { code: 'AGUNG 13', label: 'Kasi Propam' },
  { code: 'AGUNG 14', label: 'Kasi Humas' },
  { code: 'AGUNG 15', label: 'Kasi Dokkes' },
  { code: 'AGUNG 16', label: 'Kasi Was' }
];

export const ALL_SANDI_SLOTS = [...SANDI_SLOTS, ...AGUNG_SLOTS];

export function normalizeSandiCode(raw: string): string | null {
  const value = raw.replace(/\s+/g, ' ').trim().toUpperCase();
  const numeric = value.match(/^12\s*[.,]\s*([1-6])$/);
  if (numeric) return `12.${numeric[1]}`;
  const agung = value.match(/^AGUNG\s*[-.]?\s*(\d{1,2})$/);
  if (agung) {
    const number = Number(agung[1]);
    if (number >= 1 && number <= 16) return `AGUNG ${number}`;
  }
  return null;
}

/** Cari semua kode sandi yang disebut di dalam sebuah teks. */
export function findSandiCodes(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();

  for (const match of text.matchAll(/\b12\s*[.,]\s*([1-6])\b/g)) {
    found.add(`12.${match[1]}`);
  }
  for (const match of text.matchAll(/\bagung\s*[-.]?\s*(\d{1,2})\b/gi)) {
    const number = Number(match[1]);
    if (number >= 1 && number <= 16) found.add(`AGUNG ${number}`);
  }
  return [...found];
}
