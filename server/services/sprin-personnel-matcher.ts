import { normalizePersonnelName } from './personnel-directory.js';

export interface SprinRosterPerson {
  id: string;
  name: string;
  nrp?: string | null;
  phone?: string | null;
  jabatan?: string | null;
  rank?: string | null;
  category?: string | null;
  unit?: string | null;
}

export interface SprinRosterIndex {
  people: SprinRosterPerson[];
  byNrp: Map<string, SprinRosterPerson>;
  byName: Map<string, SprinRosterPerson[]>;
}

export type RosterMatchMethod = 'nrp' | 'name' | 'name-abbrev';

export interface RosterMatch {
  person: SprinRosterPerson;
  method: RosterMatchMethod;
}

function digits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D+/g, '');
}

function nameTokens(value: string | null | undefined): string[] {
  return normalizePersonnelName(value)
    .split(' ')
    .filter(Boolean);
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > 2) return 3;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j] ?? 0;
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      previous[j] = Math.min((previous[j - 1] ?? 0) + 1, above + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[right.length] ?? 0;
}

/**
 * Cocokkan token nama dengan toleransi terbatas:
 * - inisial (M. ↔ MUHAMMAD, K ↔ KURNIAWAN),
 * - awalan (PRIBADI ↔ PRIBADININGTYAS),
 * - beda satu huruf untuk token panjang (ROHMAN ↔ ROCHMAN, ARIF ↔ ARIEF).
 * Tidak dipakai untuk nama satu kata tanpa konteks.
 */
function tokenMatches(source: string, target: string, allowFuzzy = true): boolean {
  if (!source || !target) return false;
  if (source === target) return true;

  // Inisial di sisi Sprin: "M" → MUHAMMAD, "K" → KURNIAWAN.
  if (source.length === 1) return source[0] === target[0];
  // Inisial di sisi roster hanya boleh mewakili singkatan pendek (HS → H,
  // DWI → D), bukan nama panjang yang kebetulan berawalan sama
  // (MIFTAHUROHMAN → M).
  if (target.length === 1) return source.length <= 3 && source[0] === target[0];

  if (source.startsWith(target) || target.startsWith(source)) return true;
  if (!allowFuzzy) return false;
  if (Math.min(source.length, target.length) < 4) return false;
  return editDistance(source, target) <= 1;
}

/**
 * Nama Sprin sering disingkat di lampiran: "ARI EKO" untuk ARI EKO ISWOYO,
 * "ILHAM YUZRIL A" untuk ILHAM YUZRIL ARFANI, "ADI NUGROHO" untuk D.V. ADI
 * NUGROHO. Cocokkan hanya bila SEMUA token Sprin muncul berurutan di roster
 * dan kandidatnya tunggal.
 */
function matchesAbbreviatedName(sprinName: string, rosterName: string): boolean {
  const source = nameTokens(sprinName);
  const target = nameTokens(rosterName);
  if (source.length === 0 || target.length === 0) return false;
  if (source.length > target.length) return false;

  // Abaikan inisial di awal nama roster (mis. D.V. ADI NUGROHO) saat mencari
  // token pertama yang bermakna, tetapi tetap izinkan inisial itu dicocokkan.
  // Lewati prefiks nama pendek seperti "MOH", "D.V.", atau "M." saat mencari
  // token pertama, tetapi tetap izinkan prefiks itu dicocokkan sebagai inisial.
  const meaningfulStart = Math.max(
    0,
    target.findIndex((token) => token.length > 3)
  );
  const firstAllowsFuzzy = source.length > 1 || (source[0]?.length ?? 0) >= 6;
  let firstIndex = -1;
  for (let index = 0; index <= meaningfulStart; index += 1) {
    if (tokenMatches(source[0]!, target[index]!, firstAllowsFuzzy)) {
      firstIndex = index;
      break;
    }
  }
  if (firstIndex < 0) return false;

  let targetIndex = firstIndex + 1;
  for (let sourceIndex = 1; sourceIndex < source.length; sourceIndex += 1) {
    let found = false;
    while (targetIndex < target.length) {
      if (tokenMatches(source[sourceIndex]!, target[targetIndex]!, true)) {
        found = true;
        targetIndex += 1;
        break;
      }
      targetIndex += 1;
    }
    if (!found) return false;
  }
  return true;
}

/**
 * Indeks roster untuk notifikasi Sprin. Pencocokan di sini sengaja ketat:
 * nomor HP tidak boleh diberikan ke nama yang hanya "mirip".
 */
export function buildSprinRosterIndex(roster: SprinRosterPerson[]): SprinRosterIndex {
  const byNrp = new Map<string, SprinRosterPerson>();
  const byName = new Map<string, SprinRosterPerson[]>();

  for (const person of roster) {
    const nrp = digits(person.nrp);
    if (nrp && !byNrp.has(nrp)) byNrp.set(nrp, person);

    const name = normalizePersonnelName(person.name);
    if (!name) continue;
    const list = byName.get(name) ?? [];
    list.push(person);
    byName.set(name, list);
  }

  return { people: roster.filter((person) => Boolean(person.name?.trim())), byNrp, byName };
}

/**
 * Cocokkan satu baris personel Sprin ke roster.
 *
 * Aturan keamanan:
 * - NRP (bila ada) adalah sumber utama. Bila NRP ada tetapi tidak ditemukan,
 *   JANGAN jatuh ke pencocokan nama; baris dianggap tidak cocok.
 * - Tanpa NRP, nama lengkap exact dan tunggal diterima.
 * - Bila tidak exact, singkatan hanya diterima bila SEMUA token nama Sprin
 *   muncul berurutan di satu kandidat roster dan kandidatnya tunggal.
 * - Nama yang hanya berbagi satu kata (KARIYANTO vs HERIYANTO, ALI SODIK vs
 *   WARAS ALI HARTONO) tetap ditolak.
 */
export function matchSprinRosterPerson(
  person: { name: string; nrp?: string | null },
  index: SprinRosterIndex
): RosterMatch | null {
  const nrp = digits(person.nrp);
  if (nrp) {
    const match = index.byNrp.get(nrp);
    return match ? { person: match, method: 'nrp' } : null;
  }

  const name = normalizePersonnelName(person.name);
  if (!name) return null;
  const exact = index.byName.get(name) ?? [];
  if (exact.length === 1) return { person: exact[0]!, method: 'name' };
  if (exact.length > 1) return null;

  const candidates = index.people.filter((candidate) =>
    matchesAbbreviatedName(person.name, candidate.name)
  );
  if (candidates.length !== 1) return null;
  return { person: candidates[0]!, method: 'name-abbrev' };
}
