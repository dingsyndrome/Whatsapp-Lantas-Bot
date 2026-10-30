import { normalizePhone, samePhone } from '../lib/phone.js';
import {
  cleanPersonnelName,
  formatRankName
} from '../../shared/personnel-name.js';

export interface DirectoryPerson {
  id: string;
  name: string;
  rank: string | null;
  phone: string | null;
  category?: string | null;
  /** Dipakai fitur notifikasi untuk menebak fungsi kepolisian. */
  jabatan?: string | null;
  unit?: string | null;
}

const RANK_PREFIX =
  /^(AKBP|AKP|KOMPOL|IPDA|IPTU|AIPTU|AIPDA|BRIGADIR|BRIGPOL|BRIPKA|BRIPTU|BRIPDA|BHARADA|BHARA|PENATA MUDA|PENATA|PEMBINA|PRATU|PRAKA|BHAYANGKARA)\b\s*/i;

/** Nama untuk pencocokan: tanpa gelar, tanpa pangkat, tanpa tanda baca. */
export function normalizePersonnelName(value: string | null | undefined): string {
  return cleanPersonnelName(value).normalize('NFKC')
    .toUpperCase()
    .replace(RANK_PREFIX, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const IGNORED_TOKENS = new Set([
  'POLDA',
  'POLRES',
  'POLANTAS',
  'SATLANTAS',
  'POLRI',
  'JATIM',
  'INDONESIA',
  'KEPOLISIAN',
  'LALU',
  'LINTAS'
]);

function tokens(value: string): string[] {
  return normalizePersonnelName(value)
    .split(' ')
    .map((token) => token.replace(/\d+/g, ''))
    .filter((token) => token.length > 2 && !IGNORED_TOKENS.has(token));
}

/** Jarak edit sederhana untuk nama yang digabung tanpa spasi. */
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

/** Cocokkan token nama, termasuk singkatan/awalan (mis. FATIQ ↔ FATIQUNNADA). */
function tokenMatches(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length < 4 || right.length < 4) return false;
  if (left.startsWith(right) || right.startsWith(left)) return true;
  // Toleransi ejaan lazim pada nama Indonesia: CHOLIK ~ CHOLIQ, ROHMAN ~ ROCHMAN,
  // HADY ~ HADI, serta SAMSOEL ~ SAMSUL (dua huruf pada nama panjang).
  const limit = Math.min(left.length, right.length) >= 6 ? 2 : 1;
  if (editDistance(left, right) <= limit) return true;
  return false;
}

/**
 * Nama panggilan berupa inisial, mis. "AFV" → AYU FATHIKA VALBIE.
 * Hanya berlaku bila jumlah huruf sama dengan jumlah kata nama roster.
 */
function matchesInitials(nickname: string, personTokens: string[]): boolean {
  if (!/^[A-Z]{2,6}$/.test(nickname)) return false;
  if (personTokens.length !== nickname.length) return false;
  return nickname
    .split('')
    .every((letter, index) => (personTokens[index] ?? '').startsWith(letter));
}



/**
 * Nomor lama sempat menyimpan ID perangkat WhatsApp sebagai digit tambahan
 * (mis. 6285235109972 + device 0 → 62852351099720). Coba juga versi tanpa
 * 1–2 digit terakhir agar data lama tetap dapat dicocokkan ke roster.
 */
function phoneVariants(value: string): string[] {
  const normalized = normalizePhone(value);
  if (!normalized) return [];
  const variants = [normalized];
  if (normalized.startsWith('62') && normalized.length >= 13 && normalized.length <= 15) {
    for (let cut = 1; cut <= 2; cut += 1) {
      const trimmed = normalized.slice(0, -cut);
      if (trimmed.length >= 10) variants.push(trimmed);
    }
  }
  return variants;
}

export class PersonnelDirectory {
  private readonly people: DirectoryPerson[];
  private readonly byId = new Map<string, DirectoryPerson>();
  private readonly byPhone = new Map<string, DirectoryPerson>();
  private readonly byExactName = new Map<string, DirectoryPerson[]>();

  constructor(people: DirectoryPerson[]) {
    this.people = people.filter((person) => Boolean(person.name?.trim()));
    for (const person of this.people) {
      this.byId.set(person.id, person);
      const phone = normalizePhone(person.phone);
      if (phone && !this.byPhone.has(phone)) this.byPhone.set(phone, person);
      const name = normalizePersonnelName(person.name);
      if (!name) continue;
      const list = this.byExactName.get(name) ?? [];
      list.push(person);
      this.byExactName.set(name, list);
    }
  }

  getById(id: string | null | undefined): DirectoryPerson | null {
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  resolve(senderName: string | null | undefined, senderNumber?: string | null): DirectoryPerson | null {
    for (const candidate of [senderNumber, senderName]) {
      if (!candidate) continue;
      for (const variant of phoneVariants(candidate)) {
        const direct = this.byPhone.get(variant);
        if (direct) return direct;
        const tailMatch = this.people.find((person) => samePhone(person.phone, variant));
        if (tailMatch) return tailMatch;
      }
    }

    const sender = normalizePersonnelName(senderName);
    if (!sender) return null;

    const exact = this.byExactName.get(sender);
    if (exact?.length === 1) return exact[0] ?? null;

    const senderTokens = tokens(sender);
    if (senderTokens.length === 0) return null;

    const scored: Array<{ person: DirectoryPerson; score: number }> = [];
    for (const person of this.people) {
      const personNormalized = normalizePersonnelName(person.name);
      if (!personNormalized) continue;
      if (personNormalized === sender) {
        scored.push({ person, score: 120 });
        continue;
      }

      const personTokens = tokens(person.name);
      if (personTokens.length === 0) continue;

      let overlap = 0;
      let senderCovered = true;
      for (const token of senderTokens) {
        if (personTokens.some((candidate) => tokenMatches(token, candidate))) overlap += 1;
        else senderCovered = false;
      }

      let personCovered = true;
      for (const token of personTokens) {
        if (!senderTokens.some((candidate) => tokenMatches(candidate, token))) {
          personCovered = false;
          break;
        }
      }

      let score = 0;
      const nickname = senderTokens.length === 1 ? senderTokens[0] ?? '' : '';
      const nicknameIsFirstName = Boolean(nickname) && tokenMatches(nickname, personTokens[0] ?? '');
      if (senderCovered) {
        // Nama panggilan satu kata yang sama dengan kata pertama roster lebih
        // kuat daripada yang hanya kebetulan muncul di tengah nama.
        score = senderTokens.length >= 2 ? 100 : nicknameIsFirstName ? 70 : 55;
      } else if (personCovered) {
        score = personTokens.length >= 2 ? 90 : 60;
      } else if (senderTokens.length === 1) {
        score = personTokens[0] === senderTokens[0] ? 60 : 0;
      } else if (overlap >= 2) {
        score = 60 + overlap;
      }

      // Nama panggilan berupa inisial: AFV → AYU FATHIKA VALBIE.
      if (nickname && matchesInitials(nickname, personTokens)) {
        score = Math.max(score, 85);
      }

      // Nama WhatsApp sering digabung tanpa spasi dan diberi angka/unit.
      const senderCompact = senderTokens.join('');
      const personCompact = personTokens.join('');
      if (senderTokens.length === 1 && senderCompact.length >= 6) {
        if (personCompact === senderCompact) score = 100;
        else if (personCompact.startsWith(senderCompact)) score = Math.max(score, 80);
      }
      if (score < 55 && senderCompact.length >= 5 && personCompact.length >= 5) {
        if (
          Math.min(senderCompact.length, personCompact.length) >= 6 &&
          (personCompact.startsWith(senderCompact) || senderCompact.startsWith(personCompact))
        ) {
          score = 70;
        } else {
          const limit = Math.min(senderCompact.length, personCompact.length) >= 8 ? 2 : 1;
          if (editDistance(senderCompact, personCompact) <= limit) score = 55;
        }
      }

      // Token pertama yang unik (mis. "Vendhy_Adt" → VENDHY SUPRAYOGA).
      if (score === 0 && senderTokens[0]) {
        const first = senderTokens[0];
        if (personTokens.some((token) => token === first)) score = 50;
      }

      if (score > 0) scored.push({ person, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const runnerUp = scored[1];
    if (!best || best.score < 50) return null;
    // Nama terlalu umum dan dua kandidat sama kuat: jangan menebak pangkat.
    if (runnerUp && runnerUp.score === best.score) return null;
    return best.person;
  }

  label(senderName: string | null | undefined, senderNumber?: string | null): string {
    const person = this.resolve(senderName, senderNumber);
    if (person) return formatRankName(person.rank, person.name);
    return formatRankName(null, senderName);
  }

  labelById(id: string | null | undefined): string | null {
    const person = this.getById(id);
    return person ? formatRankName(person.rank, person.name) : null;
  }
}
