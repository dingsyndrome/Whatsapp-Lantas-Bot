import { samePhone } from '../../lib/phone.js';
import { prisma } from '../../lib/prisma.js';
import { resolveSandiAssignments } from '../personnel-service.js';
import { findSandiCodes } from '../sandi-config.js';

export const PERWIRA_RANKS = ['IPDA', 'IPTU', 'AKP', 'KOMPOL', 'AKBP'] as const;

export interface SupervisionPerson {
  id: string;
  name: string;
  rank: string | null;
  phone: string | null;
  jabatan?: string | null;
}

export interface SandiAssignment {
  id: string;
  name: string;
  rank: string | null;
  sandi: string;
}

export interface SupervisionAnalyzeInput {
  caption?: string | null;
  ocrText?: string | null;
  senderName: string;
  senderNumber?: string | null;
  personnel: SupervisionPerson[];
  sandi: Record<string, SandiAssignment>;
}

export interface SupervisionOutcome {
  isSupervision: boolean;
  sandi: string | null;
  personnelId: string | null;
  name: string | null;
  rank: string | null;
  reasons: string[];
}

const SUPERVISION_KEYWORDS =
  /supervisi|supervise|pengawasan|mengawasi|pengecekan|pengecek|cek\s*(langsung|on\s*the\s*spot|lokasi)|sidak|monitoring|pantau|memantau|peninjauan|meninjau|kontrol|kunjungan\s*kerja|inspeksi/i;

/** Urut panjang dulu supaya "AKBP" tidak tertangkap sebagai "AKP". */
const RANK_TOKEN = /\b(AKBP|KOMPOL|IPTU|IPDA|AKP)\b/g;

function normalizeName(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPerwira(rank: string | null | undefined): boolean {
  return Boolean(rank) && (PERWIRA_RANKS as readonly string[]).includes((rank ?? '').toUpperCase());
}

function findPersonByName(people: SupervisionPerson[], text: string): SupervisionPerson | null {
  const haystack = normalizeName(text);
  if (!haystack) return null;
  const hayTokens = new Set(haystack.split(' ').filter((token) => token.length > 2));

  let best: SupervisionPerson | null = null;
  let bestScore = 0;

  for (const person of people) {
    const name = normalizeName(person.name);
    if (!name) continue;
    // Nama lengkap muncul utuh → langsung cocok.
    if (haystack.includes(name)) return person;

    const tokens = name.split(' ').filter((token) => token.length > 2);
    if (tokens.length === 0) continue;

    const overlap = tokens.filter((token) => hayTokens.has(token)).length;
    const tail = tokens.slice(-2).join(' ');
    const tailHit = tail.length >= 6 && haystack.includes(tail);
    // Caption lapangan jarang menulis nama lengkap; dua kata yang sama sudah cukup.
    if (overlap < 2 && !tailHit) continue;

    const score = overlap + (tailHit ? 1 : 0);
    if (score > bestScore) {
      best = person;
      bestScore = score;
    }
  }
  return best;
}

export function analyzeSupervision(input: SupervisionAnalyzeInput): SupervisionOutcome {
  const text = [input.caption ?? '', input.ocrText ?? ''].filter(Boolean).join('\n');
  const reasons: string[] = [];

  const sandiCodes = findSandiCodes(text);
  const sandiHits = sandiCodes
    .map((code) => input.sandi[code])
    .filter((hit): hit is SandiAssignment => Boolean(hit));

  const senderPerson =
    input.personnel.find((person) => samePhone(person.phone, input.senderNumber)) ??
    findPersonByName(input.personnel, input.senderName) ??
    null;

  const textPerson = findPersonByName(input.personnel, text);
  const rankMentions = [...new Set([...text.matchAll(RANK_TOKEN)].map((match) => match[1]))];
  const keywordHit = SUPERVISION_KEYWORDS.test(text);

  const senderIsPerwira = Boolean(senderPerson && isPerwira(senderPerson.rank));
  const textMentionsPerwira = rankMentions.length > 0;

  if (sandiHits.length > 0) {
    reasons.push(`Sandi ${sandiCodes.join(', ')} terdeteksi pada caption/OCR.`);
  }
  if (senderIsPerwira) {
    reasons.push(`Pengirim adalah perwira (${senderPerson!.rank} ${senderPerson!.name}).`);
  }
  if (textMentionsPerwira && keywordHit) {
    reasons.push(`Caption menyebut ${rankMentions.join('/')} dengan kata kunci supervisi/pengecekan.`);
  } else if (keywordHit) {
    reasons.push('Kata kunci supervisi/pengecekan terdeteksi pada caption.');
  }

  const isSupervision =
    sandiHits.length > 0 || senderIsPerwira || (textMentionsPerwira && keywordHit);

  if (!isSupervision) {
    return { isSupervision: false, sandi: null, personnelId: null, name: null, rank: null, reasons };
  }

  const primary = sandiHits[0];
  if (primary) {
    return {
      isSupervision: true,
      sandi: primary.sandi,
      personnelId: primary.id,
      name: primary.name,
      rank: primary.rank,
      reasons
    };
  }
  if (senderIsPerwira && senderPerson) {
    return {
      isSupervision: true,
      sandi: null,
      personnelId: senderPerson.id,
      name: senderPerson.name,
      rank: senderPerson.rank,
      reasons
    };
  }
  if (textPerson) {
    return {
      isSupervision: true,
      sandi: null,
      personnelId: textPerson.id,
      name: textPerson.name,
      rank: textPerson.rank ?? rankMentions[0] ?? null,
      reasons
    };
  }
  return {
    isSupervision: true,
    sandi: null,
    personnelId: null,
    name: null,
    rank: rankMentions[0] ?? null,
    reasons
  };
}

/** Versi siap pakai: memuat roster personel + peta sandi dari database. */
export async function detectSupervision(input: {
  caption?: string | null;
  ocrText?: string | null;
  senderName: string;
  senderNumber?: string | null;
}): Promise<SupervisionOutcome> {
  const [people, sandi] = await Promise.all([
    prisma.personnel.findMany({
      where: { active: true },
      select: { id: true, name: true, rank: true, phone: true, jabatan: true },
      take: 1000
    }),
    resolveSandiAssignments()
  ]);

  return analyzeSupervision({
    caption: input.caption,
    ocrText: input.ocrText,
    senderName: input.senderName,
    senderNumber: input.senderNumber,
    personnel: people,
    sandi
  });
}
