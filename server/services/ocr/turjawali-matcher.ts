import { differenceInCalendarDays, startOfDay } from 'date-fns';
import type {
  TurjawaliActivityType,
  TurjawaliMatchStatus,
  TurjawaliRuleSettings,
  TurjawaliType
} from '../../../shared/types.js';
import {
  DEFAULT_TURJAWALI_RULES,
  TURJAWALI_TYPES,
  TURJAWALI_LABELS
} from '../../../shared/types.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { extractDocumentWithAi } from '../ai/client.js';
import { getBotConfig, getTurjawaliRules } from '../settings.js';
import { clamp } from './text-utils.js';

export interface TurjawaliOcrSnapshot {
  timeText?: string | null;
  dateText?: string | null;
  capturedAt?: Date | null;
  address?: string | null;
  village?: string | null;
  district?: string | null;
  regency?: string | null;
  province?: string | null;
  unitName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  rawText?: string | null;
}

export interface TurjawaliClassifyInput {
  caption?: string | null;
  ocr?: TurjawaliOcrSnapshot | null;
  sprinText?: string | null;
  rules?: TurjawaliRuleSettings;
}

export interface TurjawaliClassificationResult {
  type: TurjawaliType;
  score: number;
  confidence: number;
  scores: Record<TurjawaliType, number>;
  keywordHits: string[];
  reasons: string[];
  ambiguous: boolean;
}

export interface TurjawaliSprinCandidate {
  id: string;
  number: string;
  about: string | null;
  untuk: string | null;
  place: string | null;
  latitude: number | null;
  longitude: number | null;
  activityDate: Date | null;
  timeText: string | null;
  turjawaliType: TurjawaliType;
  personnel: Array<{
    id: string;
    name: string;
    rankNrp: string | null;
    jabatan: string | null;
    penugasan: string | null;
  }>;
}

export interface TurjawaliMatchInput {
  ocr: TurjawaliOcrSnapshot;
  senderName: string;
  senderNumber?: string | null;
  caption?: string | null;
  receivedAt?: Date;
  forcedType?: TurjawaliType;
}

export interface TurjawaliMatchBreakdown {
  date: number;
  time: number;
  location: number;
  type: number;
  personnel: number;
}

export interface TurjawaliMatchOutcome {
  classification: TurjawaliClassificationResult;
  matchStatus: TurjawaliMatchStatus;
  matchScore: number;
  sprinId: string | null;
  sprinNumber: string | null;
  matchedPersonnelId: string | null;
  matchedPersonnelName: string | null;
  matchNotes: string;
  aiUsed: boolean;
  breakdown: TurjawaliMatchBreakdown;
}

const ACTIVE_TYPES: TurjawaliActivityType[] = [
  'PENGATURAN',
  'PENJAGAAN',
  'PENGAWALAN',
  'PATROLI',
  'PENEGAKKAN',
  'REGIDENT'
];

const STOPWORDS = new Set([
  'jl',
  'jalan',
  'no',
  'nomor',
  'kel',
  'kelurahan',
  'desa',
  'kec',
  'kecamatan',
  'kab',
  'kabupaten',
  'kota',
  'provinsi',
  'prov',
  'depan',
  'dalam',
  'luar',
  'raya',
  'gang',
  'simpang',
  'pertigaan',
  'perempatan',
  'polres',
  'polsek',
  'polri',
  'satlantas',
  'satuan',
  'unit',
  'regu'
]);

const RANK_WORDS = new Set([
  'akbp',
  'akp',
  'ipda',
  'iptu',
  'aiptu',
  'aipda',
  'bripka',
  'brigpol',
  'bripda',
  'bharada',
  'bharatu',
  'penata',
  'muda',
  'pengatur',
  'pembina',
  'serka',
  'sertu',
  'kopka',
  'koptu',
  'praka',
  'pratu'
]);

function emptyScores(): Record<TurjawaliType, number> {
  return {
    PENGATURAN: 0,
    PENJAGAAN: 0,
    PENGAWALAN: 0,
    PATROLI: 0,
    PENEGAKKAN: 0,
    REGIDENT: 0,
    LAINNYA: 0
  };
}

export function normalizeTurjawaliText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keywordRegex(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'i');
}

function containsKeyword(text: string, keyword: string): boolean {
  const normalizedKeyword = normalizeTurjawaliText(keyword);
  if (!normalizedKeyword) return false;
  if (normalizedKeyword.includes(' ')) return text.includes(normalizedKeyword);
  return keywordRegex(normalizedKeyword).test(text);
}

export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2})[.:](\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function timeToLabel(value: string | null | undefined): string {
  return value && parseClock(value) !== null ? value : '--:--';
}

export function isTimeInRange(
  minutes: number,
  start: string,
  end: string
): boolean {
  const startMinutes = parseClock(start);
  const endMinutes = parseClock(end);
  if (startMinutes === null || endMinutes === null) return false;
  if (startMinutes <= endMinutes) {
    return minutes >= startMinutes && minutes <= endMinutes;
  }
  // Overnight range, contoh Patroli Malam 21:00–04:00.
  return minutes >= startMinutes || minutes <= endMinutes;
}

function timeWindowText(start: string, end: string): string {
  return `${timeToLabel(start)}–${timeToLabel(end)}`;
}

function addKeywords(
  scores: Record<TurjawaliType, number>,
  keywordHits: string[],
  reasons: string[],
  text: string,
  type: TurjawaliActivityType,
  keywords: string[],
  sourceLabel: string,
  sourceWeight: number
): void {
  for (const keyword of keywords) {
    if (!containsKeyword(text, keyword)) continue;
    const weight = (keyword.includes(' ') ? 1.25 : 1) * sourceWeight;
    scores[type] += weight;
    keywordHits.push(keyword);
    reasons.push(`Kata kunci “${keyword}” terdeteksi pada ${sourceLabel}.`);
  }
}

function locationText(input: TurjawaliClassifyInput): string {
  const ocr = input.ocr;
  return normalizeTurjawaliText(
    [ocr?.address, ocr?.village, ocr?.district, ocr?.regency, ocr?.province]
      .filter(Boolean)
      .join(' ')
  );
}

/**
 * Klasifikasi murni (tanpa database) agar mudah diuji dan dipakai untuk
 * mengklasifikasikan teks Sprin sebelum pencocokan.
 */
export function classifyTurjawaliActivity(
  input: TurjawaliClassifyInput
): TurjawaliClassificationResult {
  const rules = input.rules ?? DEFAULT_TURJAWALI_RULES;
  const captionText = normalizeTurjawaliText(input.caption);
  const ocrText = normalizeTurjawaliText(
    [
      input.ocr?.address,
      input.ocr?.village,
      input.ocr?.district,
      input.ocr?.regency,
      input.ocr?.province,
      input.ocr?.unitName,
      input.ocr?.rawText
    ]
      .filter(Boolean)
      .join(' ')
  );
  const sprinText = normalizeTurjawaliText(input.sprinText);
  const scores = emptyScores();
  const keywordHits: string[] = [];
  const reasons: string[] = [];

  for (const type of ACTIVE_TYPES) {
    const keywords = rules.keywords[type] ?? [];
    if (captionText) {
      addKeywords(scores, keywordHits, reasons, captionText, type, keywords, 'caption WhatsApp', 2.8);
    }
    if (ocrText) {
      addKeywords(scores, keywordHits, reasons, ocrText, type, keywords, 'teks OCR/alamat Timemark', 1.1);
    }
    if (sprinText) {
      addKeywords(scores, keywordHits, reasons, sprinText, type, keywords, 'dokumen Sprin', 2.8);
    }
  }

  const timeMinutes = parseClock(input.ocr?.timeText);
  const hasLocation = Boolean(locationText(input));
  if (timeMinutes !== null) {
    const morning = isTimeInRange(
      timeMinutes,
      rules.gaturMorningStart,
      rules.gaturMorningEnd
    );
    const evening = isTimeInRange(
      timeMinutes,
      rules.gaturEveningStart,
      rules.gaturEveningEnd
    );
    if (morning || evening) {
      const window = morning
        ? timeWindowText(rules.gaturMorningStart, rules.gaturMorningEnd)
        : timeWindowText(rules.gaturEveningStart, rules.gaturEveningEnd);
      scores.PENGATURAN += hasLocation ? 4.2 : 1.4;
      reasons.push(
        `Jam ${input.ocr?.timeText} berada dalam rentang Gatur ${morning ? 'Pagi' : 'Sore'} ${window}${hasLocation ? ' dan terdapat titik lokasi pada Timemark' : ''}.`
      );
    }
    if (isTimeInRange(timeMinutes, rules.patrolNightStart, rules.patrolNightEnd)) {
      scores.PATROLI += 3.4;
      reasons.push(
        `Jam ${input.ocr?.timeText} berada dalam rentang Patroli Malam ${timeWindowText(rules.patrolNightStart, rules.patrolNightEnd)}.`
      );
    }
  }

  const location = locationText(input);
  if (/\b(simpang|pertigaan|perempatan|tkk|sekolah|pasar|penyeberangan)\b/.test(location)) {
    scores.PENGATURAN += 1.1;
  }
  if (/\b(pos|mako|piket|objek vital|strong point)\b/.test(location)) {
    scores.PENJAGAAN += 1.1;
  }

  const ranked = (Object.entries(scores) as Array<[TurjawaliType, number]>)
    .filter(([type]) => type !== 'LAINNYA')
    .sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = ranked[0] ?? ['LAINNYA', 0];
  const secondScore = ranked[1]?.[1] ?? 0;
  const margin = topScore - secondScore;
  const ambiguous = topScore > 0 && margin < 1.5;

  let type: TurjawaliType = topScore >= 2.6 && (margin >= 0.7 || topScore >= 5) ? topType : 'LAINNYA';
  const total = ranked.reduce((sum, [, value]) => sum + value, 0);
  const share = total > 0 ? topScore / total : 0;
  let confidence =
    topScore <= 0
      ? 25
      : clamp(
          Math.round(32 + topScore * 5.2 + margin * 3.2 + share * 12),
          38,
          98
        );
  if (type === 'LAINNYA') confidence = Math.min(confidence, 42);

  if (type !== 'LAINNYA' && ambiguous) {
    reasons.push(
      `Klasifikasi ambigu: ${TURJAWALI_LABELS[topType]} (${topScore.toFixed(1)}) vs ${TURJAWALI_LABELS[ranked[1]?.[0] ?? 'LAINNYA']} (${secondScore.toFixed(1)}).`
    );
  }

  return {
    type,
    score: Number(topScore.toFixed(2)),
    confidence,
    scores: Object.fromEntries(
      Object.entries(scores).map(([key, value]) => [key, Number(value.toFixed(2))])
    ) as Record<TurjawaliType, number>,
    keywordHits: [...new Set(keywordHits)],
    reasons: [...new Set(reasons)],
    ambiguous
  };
}

function normalizeName(value: string): string {
  return normalizeTurjawaliText(value)
    .split(' ')
    .filter((token) => token.length > 1 && !RANK_WORDS.has(token) && !/^\d+$/.test(token))
    .join(' ');
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeTurjawaliText(value)
      .split(' ')
      .filter((token) => token.length > 2 && !STOPWORDS.has(token))
  );
}

function overlapScore(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap;
}

function personnelMatch(
  senderName: string,
  caption: string,
  personnel: TurjawaliSprinCandidate['personnel']
): { score: number; person: TurjawaliSprinCandidate['personnel'][number] | null } {
  const sender = normalizeName(senderName);
  const captionNorm = normalizeName(caption);
  let best: TurjawaliSprinCandidate['personnel'][number] | null = null;
  let bestScore = 0;

  for (const person of personnel) {
    const personName = normalizeName(person.name);
    if (!personName) continue;
    const personTokens = tokenSet(personName);
    const senderTokens = tokenSet(sender);
    const captionTokens = tokenSet(captionNorm);
    const senderOverlap = overlapScore(personTokens, senderTokens);
    const captionOverlap = Math.max(
      overlapScore(personTokens, captionTokens),
      captionNorm.includes(personName) ? personTokens.size : 0
    );
    const exact = sender === personName || sender.includes(personName) || personName.includes(sender);
    const score = exact
      ? 1
      : Math.max(
          senderOverlap / Math.max(1, personTokens.size),
          captionOverlap / Math.max(1, personTokens.size)
        );
    if (score > bestScore) {
      bestScore = score;
      best = person;
    }
  }

  return { score: Number(bestScore.toFixed(2)), person: best };
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const radius = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}

function locationMatch(
  input: TurjawaliOcrSnapshot,
  sprin: TurjawaliSprinCandidate,
  radiusMeters: number
): { score: number; reason: string | null } {
  if (
    input.latitude !== null &&
    input.latitude !== undefined &&
    input.longitude !== null &&
    input.longitude !== undefined &&
    sprin.latitude !== null &&
    sprin.longitude !== null
  ) {
    const distance = haversineMeters(
      input.latitude,
      input.longitude,
      sprin.latitude,
      sprin.longitude
    );
    if (distance <= radiusMeters) {
      return {
        score: 25,
        reason: `GPS dalam radius ${Math.round(distance)} m dari titik Sprin (toleransi ${radiusMeters} m).`
      };
    }
    if (distance <= radiusMeters * 2) {
      return {
        score: 12,
        reason: `GPS ${Math.round(distance)} m dari titik Sprin, melebihi radius utama namun masih dalam 2× toleransi.`
      };
    }
    return { score: 0, reason: `GPS ${Math.round(distance)} m dari titik Sprin, di luar toleransi.` };
  }

  const addressTokens = tokenSet(
    [
      input.address,
      input.village,
      input.district,
      input.regency,
      input.province
    ]
      .filter(Boolean)
      .join(' ')
  );
  const placeTokens = tokenSet(sprin.place ?? '');
  if (placeTokens.size === 0) return { score: 4, reason: null };
  const overlap = overlapScore(addressTokens, placeTokens);
  if (overlap === 0) return { score: 0, reason: null };
  const score = Math.min(25, overlap * 7 + (overlap >= 3 ? 4 : 0));
  return {
    score,
    reason: `Alamat cocok pada ${overlap} token lokasi dengan tempat Sprin.`
  };
}

function timeMatch(
  photoTime: string | null | undefined,
  sprinTime: string | null | undefined,
  toleranceMinutes: number
): { score: number; reason: string | null } {
  const photo = parseClock(photoTime);
  const sprin = parseClock(sprinTime);
  if (photo === null || sprin === null) {
    return { score: 7, reason: null };
  }
  const rawDiff = Math.abs(photo - sprin);
  // Tangani jadwal yang melewati tengah malam (23:50 vs 00:10 = 20 menit).
  const diff = Math.min(rawDiff, 24 * 60 - rawDiff);
  if (diff <= toleranceMinutes) {
    return {
      score: 22,
      reason: `Jam ${photoTime} berada ${diff} menit dari jadwal Sprin ${sprinTime} (toleransi ${toleranceMinutes} menit).`
    };
  }
  if (diff <= toleranceMinutes * 1.5) {
    return {
      score: 11,
      reason: `Jam ${photoTime} berjarak ${diff} menit dari Sprin ${sprinTime}, mendekati batas toleransi.`
    };
  }
  return {
    score: 0,
    reason: `Jam ${photoTime} berjarak ${diff} menit dari Sprin ${sprinTime}, di luar toleransi.`
  };
}

export interface ScoredTurjawaliCandidate {
  sprin: TurjawaliSprinCandidate;
  score: number;
  breakdown: TurjawaliMatchBreakdown;
  reasons: string[];
  matchedPersonnelId: string | null;
  matchedPersonnelName: string | null;
  typeMismatch: boolean;
}

export function scoreTurjawaliCandidate(
  input: TurjawaliMatchInput,
  classification: TurjawaliClassificationResult,
  sprin: TurjawaliSprinCandidate,
  rules: TurjawaliRuleSettings
): ScoredTurjawaliCandidate {
  const reasons: string[] = [];
  let dateScore = 5;
  if (input.ocr.capturedAt && sprin.activityDate) {
    const diff = Math.abs(
      differenceInCalendarDays(startOfDay(input.ocr.capturedAt), startOfDay(sprin.activityDate))
    );
    if (diff === 0) {
      dateScore = 30;
      reasons.push('Tanggal pelaksanaan sama dengan Sprin.');
    } else if (diff === 1) {
      dateScore = 18;
      reasons.push('Tanggal foto berjarak 1 hari dari Sprin.');
    } else if (diff === 2) {
      dateScore = 8;
    } else {
      dateScore = 0;
    }
  }

  const time = timeMatch(
    input.ocr.timeText,
    sprin.timeText,
    rules.matchTimeToleranceMinutes
  );
  if (time.reason) reasons.push(time.reason);

  const location = locationMatch(input.ocr, sprin, rules.matchLocationRadiusMeters);
  if (location.reason) reasons.push(location.reason);

  const typeMismatch =
    classification.type !== 'LAINNYA' &&
    sprin.turjawaliType !== 'LAINNYA' &&
    classification.type !== sprin.turjawaliType;
  const typeScore = typeMismatch
    ? 0
    : sprin.turjawaliType === classification.type
      ? 18
      : sprin.turjawaliType === 'LAINNYA'
        ? 5
        : 0;
  if (typeScore === 18) reasons.push('Kategori Turjawali sesuai dengan Sprin.');
  if (typeMismatch) reasons.push('Kategori foto berbeda dengan kategori Sprin (partial match).');

  const person = personnelMatch(input.senderName, input.caption ?? '', sprin.personnel);
  const personnelScore = person.score >= 0.75 ? 18 : person.score >= 0.5 ? 10 : 0;
  if (person.person && personnelScore > 0) {
    reasons.push(`Pengirim cocok dengan personel ${person.person.name}.`);
  }

  let total =
    dateScore + time.score + location.score + typeScore + personnelScore;
  if (typeMismatch && total >= 75) total = 70;
  total = Math.min(100, Math.round(total));

  return {
    sprin,
    score: total,
    breakdown: {
      date: dateScore,
      time: time.score,
      location: location.score,
      type: typeScore,
      personnel: personnelScore
    },
    reasons,
    matchedPersonnelId: person.person?.id ?? null,
    matchedPersonnelName: person.person?.name ?? null,
    typeMismatch
  };
}

function toCandidate(sprin: {
  id: string;
  number: string;
  about: string | null;
  untuk: string | null;
  place: string | null;
  latitude: number | null;
  longitude: number | null;
  activityDate: Date | null;
  timeText: string | null;
  turjawaliType: string;
  personnel: Array<{
    id: string;
    name: string;
    rankNrp: string | null;
    jabatan: string | null;
    penugasan: string | null;
  }>;
}): TurjawaliSprinCandidate {
  return {
    id: sprin.id,
    number: sprin.number,
    about: sprin.about,
    untuk: sprin.untuk,
    place: sprin.place,
    latitude: sprin.latitude,
    longitude: sprin.longitude,
    activityDate: sprin.activityDate,
    timeText: sprin.timeText,
    turjawaliType: TURJAWALI_TYPES.includes(sprin.turjawaliType as TurjawaliType)
      ? (sprin.turjawaliType as TurjawaliType)
      : 'LAINNYA',
    personnel: sprin.personnel
  };
}

function aiResult(
  raw: Record<string, unknown> | null,
  fallback: TurjawaliClassificationResult
): TurjawaliClassificationResult | null {
  if (!raw) return null;
  const candidate = String(
    raw.turjawaliType ?? raw.category ?? raw.type ?? ''
  ).toUpperCase();
  if (!TURJAWALI_TYPES.includes(candidate as TurjawaliType)) return null;
  const type = candidate as TurjawaliType;
  if (type === 'LAINNYA') return null;
  const confidence = clamp(Number(raw.confidence ?? 82), 0, 100);
  const reason = typeof raw.reason === 'string' ? raw.reason : null;
  return {
    ...fallback,
    type,
    confidence: Math.max(confidence, fallback.confidence),
    reasons: [
      ...fallback.reasons,
      `AI fallback mengklasifikasikan sebagai ${TURJAWALI_LABELS[type]}${reason ? `: ${reason}` : ''}.`
    ]
  };
}

async function classifyWithAiFallback(
  input: TurjawaliMatchInput,
  rules: TurjawaliRuleSettings,
  classification: TurjawaliClassificationResult,
  aiEnabled: boolean
): Promise<{ classification: TurjawaliClassificationResult; aiUsed: boolean }> {
  if (!aiEnabled) return { classification, aiUsed: false };
  if (
    classification.type !== 'LAINNYA' &&
    classification.confidence >= 60 &&
    !classification.ambiguous
  ) {
    return { classification, aiUsed: false };
  }
  const bot = await getBotConfig();
  if (!bot.aiEnabled) return { classification, aiUsed: false };
  const text = [
    `Caption WhatsApp: ${input.caption ?? '-'}`,
    `Jam Timemark: ${input.ocr.timeText ?? '-'}`,
    `Alamat: ${input.ocr.address ?? '-'}`,
    `Satuan: ${input.ocr.unitName ?? '-'}`,
    `Pengirim: ${input.senderName}`,
    `Teks OCR: ${input.ocr.rawText ?? '-'}`
  ].join('\n');
  const raw = await extractDocumentWithAi(
    {
      enabled: true,
      baseUrl: bot.aiBaseUrl,
      apiKey: bot.aiApiKey,
      model: bot.aiModel
    },
    `Klasifikasikan laporan Timemark Polantas ke salah satu kategori Turjawali:
PENGATURAN, PENJAGAAN, PENGAWALAN, PATROLI, atau LAINNYA.
Pertimbangkan caption, waktu, alamat, satuan, dan pengirim.
Balas hanya JSON: {"turjawaliType":"PENGATURAN","confidence":0,"reason":"..."}`,
    text
  );
  const parsed = raw;
  const enhanced = aiResult(parsed, classification);
  return enhanced
    ? { classification: enhanced, aiUsed: true }
    : { classification, aiUsed: false };
}

export async function matchTurjawali(
  input: TurjawaliMatchInput,
  options: { rules?: TurjawaliRuleSettings; aiEnabled?: boolean } = {}
): Promise<TurjawaliMatchOutcome> {
  const bot = await getBotConfig();
  const rules = options.rules ?? getTurjawaliRules(bot);
  let preliminary = classifyTurjawaliActivity({
    caption: input.caption,
    ocr: input.ocr,
    rules
  });

  if (input.forcedType) {
    preliminary = {
      ...preliminary,
      type: input.forcedType,
      confidence: 100,
      reasons: [
        ...preliminary.reasons,
        `Kategori dikoreksi manual menjadi ${TURJAWALI_LABELS[input.forcedType]}.`
      ]
    };
  }

  const ai = input.forcedType
    ? { classification: preliminary, aiUsed: false }
    : await classifyWithAiFallback(
        input,
        rules,
        preliminary,
        options.aiEnabled ?? bot.aiEnabled
      );
  const classification = ai.classification;

  if (!bot.turjawaliMatchingEnabled) {
    return {
      classification,
      matchStatus: 'UNMATCHED',
      matchScore: 0,
      sprinId: null,
      sprinNumber: null,
      matchedPersonnelId: null,
      matchedPersonnelName: null,
      matchNotes: 'Pencocokan otomatis dinonaktifkan. Kategori tetap diklasifikasikan dari caption/OCR.',
      aiUsed: ai.aiUsed,
      breakdown: { date: 0, time: 0, location: 0, type: 0, personnel: 0 }
    };
  }

  const dateWindowStart = input.ocr.capturedAt
    ? new Date(input.ocr.capturedAt.getTime() - 7 * 24 * 60 * 60 * 1000)
    : null;
  const dateWindowEnd = input.ocr.capturedAt
    ? new Date(input.ocr.capturedAt.getTime() + 7 * 24 * 60 * 60 * 1000)
    : null;

  const rows = await prisma.sprin.findMany({
    where: {
      status: 'active',
      ...(dateWindowStart && dateWindowEnd
        ? {
            OR: [
              { activityDate: { gte: dateWindowStart, lte: dateWindowEnd } },
              { activityDate: null }
            ]
          }
        : {})
    },
    include: {
      personnel: {
        select: {
          id: true,
          name: true,
          rankNrp: true,
          jabatan: true,
          penugasan: true
        },
        orderBy: { no: 'asc' }
      }
    },
    orderBy: [{ activityDate: 'desc' }, { createdAt: 'desc' }],
    take: 50
  });

  const candidates = rows.map(toCandidate);
  let best: ScoredTurjawaliCandidate | null = null;
  for (const candidate of candidates) {
    const scored = scoreTurjawaliCandidate(input, classification, candidate, rules);
    if (!best || scored.score > best.score) best = scored;
  }

  if (
    best &&
    (classification.type === 'LAINNYA' || classification.confidence < 50) &&
    best.sprin.turjawaliType !== 'LAINNYA'
  ) {
    const adopted: TurjawaliClassificationResult = {
      ...classification,
      type: best.sprin.turjawaliType,
      confidence: Math.max(classification.confidence, 58),
      reasons: [
        ...classification.reasons,
        `Kategori diadopsi dari Sprin ${best.sprin.number} karena klasifikasi awal belum kuat.`
      ]
    };
    const rescored = scoreTurjawaliCandidate(input, adopted, best.sprin, rules);
    best = rescored;
    preliminary = adopted;
  }

  const finalClassification = preliminary;
  if (!best) {
    return {
      classification: finalClassification,
      matchStatus: 'UNMATCHED',
      matchScore: 0,
      sprinId: null,
      sprinNumber: null,
      matchedPersonnelId: null,
      matchedPersonnelName: null,
      matchNotes: [
        ...finalClassification.reasons,
        'Tidak ada Sprin aktif yang dapat dicocokkan.'
      ].join(' '),
      aiUsed: ai.aiUsed,
      breakdown: { date: 0, time: 0, location: 0, type: 0, personnel: 0 }
    };
  }

  const matchStatus: TurjawaliMatchStatus =
    best.score >= 75 ? 'MATCHED' : best.score >= 45 ? 'PARTIAL_MATCH' : 'UNMATCHED';
  const matched = matchStatus !== 'UNMATCHED';
  const notes = [
    ...finalClassification.reasons,
    ...best.reasons,
    best.score >= 75
      ? 'Kecocokan kuat dengan Sprin dan/atau personel.'
      : best.score >= 45
        ? 'Kecocokan parsial; operator disarankan memverifikasi.'
        : 'Belum ada kecocokan Sprin yang cukup kuat.'
  ];

  return {
    classification: finalClassification,
    matchStatus,
    matchScore: best.score,
    sprinId: matched ? best.sprin.id : null,
    sprinNumber: matched ? best.sprin.number : null,
    matchedPersonnelId: matched ? best.matchedPersonnelId : null,
    matchedPersonnelName: matched ? best.matchedPersonnelName : null,
    matchNotes: notes.join(' '),
    aiUsed: ai.aiUsed,
    breakdown: best.breakdown
  };
}

/** Klasifikasi teks Sprin saat dokumen diingest. */
export function classifySprinTurjawali(
  parsed: { about: string | null; untuk: string | null; dasar: string | null },
  rules: TurjawaliRuleSettings = DEFAULT_TURJAWALI_RULES
): TurjawaliClassificationResult {
  return classifyTurjawaliActivity({
    sprinText: [parsed.about, parsed.untuk, parsed.dasar].filter(Boolean).join(' '),
    rules
  });
}

/**
 * Jalankan ulang matching untuk satu foto (mis. setelah operator override
 * atau setelah Sprin baru masuk).
 */
export async function rematchTimemark(
  photoId: string,
  forcedType?: TurjawaliType
): Promise<TurjawaliMatchOutcome | null> {
  const photo = await prisma.timemarkPhoto.findUnique({ where: { id: photoId } });
  if (!photo) return null;
  const bot = await getBotConfig();
  const rules = getTurjawaliRules(bot);
  const outcome = await matchTurjawali(
    {
      ocr: {
        timeText: photo.timeText,
        dateText: photo.dateText,
        capturedAt: photo.capturedAt,
        address: photo.address,
        village: photo.village,
        district: photo.district,
        regency: photo.regency,
        province: photo.province,
        unitName: photo.unitName,
        latitude: photo.latitude,
        longitude: photo.longitude,
        rawText: photo.rawText
      },
      senderName: photo.senderName,
      senderNumber: photo.senderNumber,
      caption: photo.senderCaption ?? photo.caption,
      receivedAt: photo.createdAt,
      forcedType
    },
    { rules }
  );

  const updated = await prisma.timemarkPhoto.update({
    where: { id: photoId },
    data: {
      turjawaliType: outcome.classification.type,
      matchStatus: outcome.matchStatus,
      matchScore: outcome.matchScore,
      matchedPersonnelId: outcome.matchedPersonnelId,
      matchNotes: outcome.matchNotes,
      sprinId: outcome.sprinId
    },
    include: {
      sprin: { select: { number: true } },
      matchedPersonnel: { select: { id: true, name: true, rankNrp: true, penugasan: true } }
    }
  });
  logger.info(
    {
      photoId,
      type: outcome.classification.type,
      status: outcome.matchStatus,
      score: outcome.matchScore
    },
    'Timemark rematched'
  );
  return { ...outcome, sprinNumber: updated.sprin?.number ?? null };
}

export interface RematchSummary {
  processed: number;
  matched: number;
  partial: number;
  unmatched: number;
  failed: number;
}

/**
 * Cocokkan ulang foto yang belum cocok/parsial. Berguna setelah aturan
 * Settings atau Sprin baru ditambahkan tanpa menyentuh override manual
 * yang sudah MATCHED.
 */
export async function rematchPendingTimemarks(options: {
  scope?: 'unmatched' | 'partial' | 'both';
  limit?: number;
} = {}): Promise<RematchSummary> {
  const scope = options.scope ?? 'both';
  const statuses: TurjawaliMatchStatus[] =
    scope === 'unmatched'
      ? ['UNMATCHED']
      : scope === 'partial'
        ? ['PARTIAL_MATCH']
        : ['UNMATCHED', 'PARTIAL_MATCH'];
  const photos = await prisma.timemarkPhoto.findMany({
    where: { matchStatus: { in: statuses } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: Math.min(200, Math.max(1, options.limit ?? 100))
  });

  const summary: RematchSummary = {
    processed: 0,
    matched: 0,
    partial: 0,
    unmatched: 0,
    failed: 0
  };

  for (const photo of photos) {
    try {
      const outcome = await rematchTimemark(photo.id);
      summary.processed += 1;
      if (!outcome || outcome.matchStatus === 'UNMATCHED') summary.unmatched += 1;
      else if (outcome.matchStatus === 'MATCHED') summary.matched += 1;
      else summary.partial += 1;
    } catch (error) {
      summary.failed += 1;
      logger.warn({ err: error, photoId: photo.id }, 'Rematch failed');
    }
  }

  return summary;
}
