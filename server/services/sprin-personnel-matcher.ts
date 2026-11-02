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
  byNrp: Map<string, SprinRosterPerson>;
  byName: Map<string, SprinRosterPerson[]>;
}

export type RosterMatchMethod = 'nrp' | 'name';

export interface RosterMatch {
  person: SprinRosterPerson;
  method: RosterMatchMethod;
}

function digits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D+/g, '');
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

  return { byNrp, byName };
}

/**
 * Cocokkan satu baris personel Sprin ke roster.
 *
 * Aturan keamanan:
 * - NRP (bila ada) adalah sumber utama. Bila NRP ada tetapi tidak ditemukan,
 *   JANGAN jatuh ke pencocokan nama; baris dianggap tidak cocok.
 * - Tanpa NRP, hanya nama lengkap yang sama persis setelah normalisasi yang
 *   diterima, dan hanya bila kandidatnya tunggal.
 * - Tidak ada fuzzy match / singkatan / tebakan nama.
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
  const candidates = index.byName.get(name) ?? [];
  if (candidates.length !== 1) return null;
  return { person: candidates[0]!, method: 'name' };
}
