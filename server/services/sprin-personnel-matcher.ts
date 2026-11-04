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
function tokenMatches(
  source: string,
  target: string,
  allowFuzzy = true,
  allowWideInitial = false
): boolean {
  if (!source || !target) return false;
  if (source === target) return true;

  // Inisial di sisi Sprin: "M" → MUHAMMAD, "K" → KURNIAWAN.
  if (source.length === 1) return source[0] === target[0];
  // Inisial di sisi roster boleh mewakili kata apa pun pada posisi setelah
  // token pertama (IRWAN DWI C), tetapi pada token pertama hanya bila sumber
  // memang inisial/singkatan pendek — bukan nama panjang (MIFTAHUROHMAN → M).
  if (target.length === 1) {
    if (!allowWideInitial && source.length > 3) return false;
    return source[0] === target[0];
  }

  // Singkatan hanya boleh arah source → target (ARI → ARIF), bukan target
  // pendek yang kebetulan menjadi awalan source (NURSAID → NUR).
  if (target.startsWith(source)) return true;
  if (source.startsWith(target)) return target.length <= 2;
  if (!allowFuzzy) return false;
  if (Math.min(source.length, target.length) < 4) return false;
  return editDistance(source, target) <= 1;
}

/**
 * Versi lebih ketat untuk nama Sprin yang hanya satu kata. Awalan pendek
 * seperti YULI tidak boleh menyerap YULIGIANTORO; hanya exact, inisial, atau
 * nama panjang yang beda satu huruf (MIFTAHUROHMAN/MIFTAHURROHMAN).
 */
function singleTokenMatches(source: string, target: string): boolean {
  if (!source || !target) return false;
  if (source === target) return true;
  if (source.length === 1) return source[0] === target[0];
  if (target.length === 1) return source.length <= 3 && source[0] === target[0];
  if (source.length < 6) return false;
  if (target.startsWith(source)) return true;
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

  // Nama di pos lebih panjang dari roster (AGENG ARIF PRISWANTO → AGENG ARIF):
  // hanya bila seluruh token roster adalah awalan yang cocok dan selisihnya
  // maksimal dua token.
  if (source.length > target.length) {
    if (target.length < 2 || source.length - target.length > 2) return false;
    for (let index = 0; index < target.length; index += 1) {
      if (!tokenMatches(source[index]!, target[index]!, true, true)) return false;
    }
    return true;
  }

  // Abaikan inisial di awal nama roster (mis. D.V. ADI NUGROHO) saat mencari
  // token pertama yang bermakna, tetapi tetap izinkan inisial itu dicocokkan.
  const meaningfulStart = Math.max(
    0,
    target.findIndex((token) => token.length > 3)
  );
  const singleWord = source.length === 1;
  let firstIndex = -1;
  for (let index = 0; index <= meaningfulStart; index += 1) {
    if (
      singleWord
        ? singleTokenMatches(source[0]!, target[index]!)
        : tokenMatches(source[0]!, target[index]!, true, true)
    ) {
      firstIndex = index;
      break;
    }
  }

  let ordered = firstIndex >= 0;
  if (ordered) {
    let targetIndex = firstIndex + 1;
    for (let sourceIndex = 1; sourceIndex < source.length; sourceIndex += 1) {
      let found = false;
      while (targetIndex < target.length) {
        if (tokenMatches(source[sourceIndex]!, target[targetIndex]!, true, true)) {
          found = true;
          targetIndex += 1;
          break;
        }
        targetIndex += 1;
      }
      if (!found) {
        ordered = false;
        break;
      }
    }
  }
  if (ordered) return true;

  // Nama di pos hanya bagian belakang roster (FERI ISWANTO → MUHAMAD FERI
  // ISWANTO). Hanya untuk nama multi-token dan semua token harus cocok.
  if (source.length >= 2 && target.length > source.length) {
    const offset = target.length - source.length;
    for (let index = 0; index < source.length; index += 1) {
      if (!tokenMatches(source[index]!, target[offset + index]!, true, true)) return false;
    }
    return true;
  }

  return false;
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
