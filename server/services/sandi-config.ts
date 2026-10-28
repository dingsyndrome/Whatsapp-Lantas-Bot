/**
 * Peta kode sandi (call sign) yang dipakai Polres:
 * - `12.1` … `12.6` untuk perwira Satlantas.
 * - `AGUNG 1` … `AGUNG 16` untuk jajaran Pejabat Utama (PJU) Polres.
 *
 * Hanya sandi yang sudah dipastikan pemegangnya yang diberi label/pola jabatan:
 * Agung 1 = Kapolres, Agung 2 = Wakapolres, Agung 4 = Kabag Ops,
 * Agung 12 = Kasat Lantas. Sandi Agung lain sengaja dibiarkan tanpa terjemahan —
 * bot menyimpan kode apa adanya sesuai caption, dan operator dapat memetakannya
 * manual di Settings → Personel.
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

const AGUNG_KNOWN: Record<number, SandiSlotDefinition> = {
  1: { code: 'AGUNG 1', label: 'Kapolres' },
  2: { code: 'AGUNG 2', label: 'Wakapolres', jabatanPattern: /\bWAKA/ },
  4: { code: 'AGUNG 4', label: 'Kabag Ops', jabatanPattern: /KABAG\s*OPS/ },
  12: { code: 'AGUNG 12', label: 'Kasat Lantas', jabatanPattern: /KASAT\s*LANTAS/ }
};

export const AGUNG_SLOTS: SandiSlotDefinition[] = Array.from({ length: 16 }, (_, index) => {
  const number = index + 1;
  return AGUNG_KNOWN[number] ?? { code: `AGUNG ${number}`, label: '' };
});

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
