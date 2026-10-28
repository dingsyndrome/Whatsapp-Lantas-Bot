import { cleanField, clamp } from '../ocr/text-utils.js';
import { parseCoordinate } from '../ocr/timemark-parser.js';
import type { ParsedPersonnel, ParsedSprinDocument } from './types.js';
import { PAGE_BREAK } from './types.js';

const MONTHS: Record<string, number> = {
  januari: 1,
  februari: 2,
  maret: 3,
  april: 4,
  mei: 5,
  juni: 6,
  juli: 7,
  agustus: 8,
  september: 9,
  oktober: 10,
  november: 11,
  desember: 12
};

const RANKS = [
  'KOMJEN',
  'KOMBES',
  'AKBP',
  'AKP',
  'IPDA',
  'IPTU',
  'AIPTU',
  'AIPDA',
  'BRIPTU',
  'BRPTU',
  'BRIPKA',
  'BRIGPOL',
  'BRIPDA',
  'BRIGADIR',
  'BHARADA',
  'BHARATU',
  'PENATA MUDA TK I',
  'PENATA MUDA',
  'PENATA',
  'PENGATUR TK I',
  'PENGATUR',
  'PEMBINA TK I',
  'PEMBINA',
  'PAMA',
  'PAMEN',
  'PATI',
  'SERKA',
  'SERTU',
  'KOPKA',
  'KOPTU',
  'PRAKA',
  'PRATU',
  'PRAJURIT',
  'LETKOL',
  'LETNAN',
  'KAPTEN',
  'MAYOR',
  'SERSAN'
];

const RANK_RE = new RegExp(
  `\\b(${RANKS.map((rank) => rank.replace(/ /g, '\\s+')).join('|')})\\s*(?:\\/|NRP\\s*[:.]?)\\s*([0-9][0-9 .]{4,22}[0-9])\\b`,
  'i'
);

const PENUGASAN_RE =
  /\b(KOORDINATOR|PENDAMPING|PESERTA|UNDANGAN|DRIVER|WASKAT|PENGAWAS|PENGAMANAN|DOKUMENTASI|HUMAS|MEDIS)\b/i;

const KET_RE =
  /\b(PDU\s*(?:I|II|III|IV)?|PDL\s*(?:TWO\s*TONE|TWO-TONE|TNI|POLRI|HITAM|COKLAT)?|SERAGAM\s*[A-Z ]+|PAKAIAN\s*[A-Z ]+|ATRIBUT\s*[A-Z ]+|TANPA\s+SENJATA|BERSENJATA|KHUSUS)\b/i;

export function normalizeDocumentText(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function splitDocumentPages(text: string): string[] {
  return text
    .split(PAGE_BREAK)
    .map((page) => normalizeDocumentText(page))
    .filter((page) => page.length > 0);
}

function sectionBetween(text: string, start: RegExp, endMarkers: RegExp[]): string | null {
  const match = start.exec(text);
  if (!match) return null;
  const startIndex = match.index + match[0].length;
  const remainder = text.slice(startIndex);
  let endIndex = remainder.length;
  for (const marker of endMarkers) {
    const end = marker.exec(remainder);
    if (end && end.index < endIndex) endIndex = end.index;
  }
  const section = remainder.slice(0, endIndex);
  const cleaned = section
    .split('\n')
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleanField(cleaned);
}

export function parseIndonesianDate(value: string): Date | null {
  const flat = value.replace(/\s+/g, ' ').trim();
  const named = flat.match(
    /(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})/i
  );
  if (named) {
    const day = Number(named[1]);
    const month = MONTHS[named[2].toLowerCase()];
    const year = Number(named[3]);
    if (day >= 1 && day <= 31 && month && year >= 2000 && year <= 2100) {
      const date = new Date(year, month - 1, day);
      if (date.getDate() === day) return date;
    }
  }
  const numeric = flat.match(/(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = Number(numeric[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
      const date = new Date(year, month - 1, day);
      if (date.getDate() === day) return date;
    }
  }
  const iso = flat.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function formatIndonesianDate(date: Date | null): string | null {
  if (!date) return null;
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember'
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function extractNumber(text: string): string | null {
  const matches = [
    ...text.matchAll(/Sprin\s*\/\s*[A-Za-z0-9.]+(?:\s*\/\s*[A-Za-z0-9.]+){1,6}/gi)
  ].map((match) => match[0].replace(/\s*\/\s*/g, '/').replace(/[.,;:]$/, ''));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

function extractSignatory(text: string): { name: string | null; rank: string | null } {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const lampiranIndex = lines.findIndex((line) => /^LAMPIRAN\b/i.test(line));
  const bodyLines = lampiranIndex > 0 ? lines.slice(0, lampiranIndex) : lines;
  const tail = bodyLines.slice(-40);

  const explicitName = [...tail].reverse().find((line) => /^(?:Nama|a\.n\.)\s*:/i.test(line));
  if (explicitName) {
    const name = cleanField(explicitName.replace(/^(?:Nama|a\.n\.)\s*:\s*/i, ''));
    if (name) return { name, rank: null };
  }

  const leaderIndex = bodyLines.findIndex((line) =>
    /^(?:KEPALA\s+KEPOLISIAN|KAPOLRES|KEPALA\s+SAT|KEPALA\s+KEPOLISIAN\s+RESOR)/i.test(line)
  );
  const searchBlock =
    leaderIndex >= 0 ? bodyLines.slice(leaderIndex, leaderIndex + 12) : tail;
  const rankPattern = new RegExp(`^(${RANKS.join('|')})\\b`, 'i');
  const rankLine = [...searchBlock]
    .reverse()
    .find((line) => rankPattern.test(line) && line.replace(rankPattern, '').trim().length > 3);

  if (rankLine) {
    const rankMatch = rankLine.match(rankPattern);
    const rank = rankMatch?.[1] ?? null;
    const name = cleanField(rankLine.replace(rankPattern, ''));
    if (name) return { name, rank };
  }

  // Gaya Polri: "IVAN DANARA OKTAVIAN, S.Tr.K." diikuti
  // "AJUN KOMISARIS POLISI NRP 94101244".
  const nrpIndex = bodyLines.findIndex((line) => /\bNRP\s*[:.]?\s*\d{4,}/i.test(line));
  if (nrpIndex > 0) {
    const nrpLine = bodyLines[nrpIndex];
    const longRank = nrpLine.match(
      /^(AJUN\s+KOMISARIS\s+BESAR\s+POLISI|AJUN\s+KOMISARIS\s+POLISI|KOMISARIS\s+BESAR\s+POLISI|KOMISARIS\s+POLISI|BRIGADIR\s+JENDERAL(?:\s+POLISI)?|INSPEKTUR\s+JENDERAL(?:\s+POLISI)?|INSPEKTUR\s+POLISI)/i
    );
    const rankMap: Record<string, string> = {
      'AJUN KOMISARIS BESAR POLISI': 'AKBP',
      'AJUN KOMISARIS POLISI': 'AKP',
      'KOMISARIS BESAR POLISI': 'KOMBES',
      'KOMISARIS POLISI': 'KOMPOL',
      'BRIGADIR JENDERAL': 'BRIGJEN',
      'INSPEKTUR JENDERAL': 'IRJEN',
      'INSPEKTUR POLISI': 'IP'
    };
    const candidate = bodyLines[nrpIndex - 1]?.trim() ?? '';
    const looksLikeName =
      /^[A-Z][A-Za-z.,'\- ]{4,}$/.test(candidate) &&
      !/^(KASAT|KANIT|KAUR|KEPALA|KAPOLRES|WAKA|KABAG|KASI)\b/i.test(candidate);
    if (looksLikeName) {
      const key = longRank?.[1]?.toUpperCase().replace(/\s+/g, ' ') ?? '';
      return {
        name: cleanField(candidate),
        rank: longRank ? (rankMap[key] ?? key) : null
      };
    }
  }

  const leader = [...tail].reverse().find((line) => /^(?:KEPALA\s+KEPOLISIAN|KAPOLRES|KEPALA\s+SAT)/i.test(line));
  return { name: leader ? cleanField(leader) : null, rank: null };
}

function normalizeRank(raw: string | null): { rank: string | null; nrp: string | null; rankNrp: string | null } {
  if (!raw) return { rank: null, nrp: null, rankNrp: null };
  const match = raw.match(RANK_RE);
  if (match) {
    const rank = match[1].toUpperCase().replace(/\s+/g, ' ');
    const nrp = match[2].replace(/[^\d]/g, '');
    return { rank, nrp, rankNrp: `${rank}/${nrp}` };
  }
  const nrpOnly = raw.match(/(?:NRP\s*[:.]?\s*)?(\d{6,20})/i);
  return {
    rank: null,
    nrp: nrpOnly?.[1] ?? null,
    rankNrp: cleanField(raw)
  };
}

export function parsePersonnelCells(
  cells: string[],
  page: number,
  fallbackNo: number
): ParsedPersonnel | null {
  const cleaned = cells.map((cell) => cleanField(cell.replace(/\s+/g, ' ')) ?? '');
  if (cleaned.length === 0) return null;
  if (cleaned.some((cell) => /^NAMA$/i.test(cell)) && cleaned.some((cell) => /PANGKAT|NRP/i.test(cell))) {
    return null;
  }

  const no = Number(cleaned[0]?.match(/\d{1,3}/)?.[0] ?? fallbackNo);
  if (!Number.isFinite(no) || no < 1) return null;
  let name = cleaned[1] ?? '';
  let rankNrpRaw = cleaned[2] ?? '';
  let jabatan = cleaned[3] ?? '';
  let penugasan = cleaned[4] ?? '';
  let ket = cleaned.slice(5).join(' ').trim();

  if (cleaned.length < 5) {
    const joined = cleaned.slice(1).join('  ');
    const parsed = parsePersonnelLine(`${no}  ${joined}`, page);
    return parsed;
  }

  if (!name || /^(NO|NAMA)$/i.test(name)) return null;
  if (penugasan && !PENUGASAN_RE.test(penugasan)) {
    ket = `${penugasan} ${ket}`.trim();
    penugasan = '';
  }
  if (!penugasan) {
    const penMatch = `${jabatan} ${ket}`.match(PENUGASAN_RE);
    if (penMatch) {
      penugasan = penMatch[1];
      const at = `${jabatan} ${ket}`.indexOf(penMatch[0]);
      const before = `${jabatan} ${ket}`.slice(0, at).trim();
      const after = `${jabatan} ${ket}`.slice(at + penMatch[0].length).trim();
      jabatan = before;
      ket = after;
    }
  }

  const rankInfo = normalizeRank(rankNrpRaw);
  return {
    no,
    name: name.toUpperCase(),
    rankNrp: rankInfo.rankNrp,
    rank: rankInfo.rank,
    nrp: rankInfo.nrp,
    jabatan: cleanField(jabatan),
    penugasan: cleanField(penugasan)?.toUpperCase() ?? null,
    ket: cleanField(ket)?.toUpperCase() ?? null,
    page,
    rawText: cleaned.join(' | ')
  };
}

export function parsePersonnelLine(line: string, page: number): ParsedPersonnel | null {
  const rawText = line.replace(/\s+/g, ' ').trim();
  const numberMatch = rawText.match(/^(\d{1,3})\s*[.)]?\s+(.+)$/);
  if (!numberMatch) return null;
  const no = Number(numberMatch[1]);
  const body = numberMatch[2].trim();
  if (!body || /^(NAMA|PANGKAT)/i.test(body)) return null;

  const rankMatch = body.match(RANK_RE);
  let name = '';
  let rankNrpRaw = '';
  let remainder = '';

  if (rankMatch && rankMatch.index !== undefined) {
    name = cleanField(body.slice(0, rankMatch.index)) ?? '';
    rankNrpRaw = rankMatch[0];
    remainder = body.slice(rankMatch.index + rankMatch[0].length).trim();
  } else {
    const columns = line
      .trim()
      .replace(/^\d{1,3}\s*[.)]?\s+/, '')
      .split(/\s{2,}|\t+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (columns.length >= 4) {
      name = columns[0] ?? '';
      rankNrpRaw = columns[1] ?? '';
      remainder = columns.slice(2).join(' ');
    } else {
      return null;
    }
  }

  name = name
    .replace(/^[,;.\s]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!name || name.length < 2 || /^(NAMA|NO)$/i.test(name)) return null;

  let penugasan: string | null = null;
  let jabatanPart = remainder;
  let ketPart = '';
  const penMatch = remainder.match(PENUGASAN_RE);
  if (penMatch && penMatch.index !== undefined) {
    jabatanPart = remainder.slice(0, penMatch.index).trim();
    penugasan = penMatch[1].toUpperCase();
    ketPart = remainder.slice(penMatch.index + penMatch[0].length).trim();
  } else {
    const ketMatch = remainder.match(KET_RE);
    if (ketMatch && ketMatch.index !== undefined) {
      jabatanPart = remainder.slice(0, ketMatch.index).trim();
      ketPart = remainder.slice(ketMatch.index).trim();
    }
  }

  let ket = ketPart;
  const rankInfo = normalizeRank(rankNrpRaw);
  return {
    no,
    name: name.toUpperCase(),
    rankNrp: rankInfo.rankNrp,
    rank: rankInfo.rank,
    nrp: rankInfo.nrp,
    jabatan: cleanField(jabatanPart)?.toUpperCase() ?? null,
    penugasan,
    ket: cleanField(ket)?.toUpperCase() ?? null,
    page,
    rawText
  };
}

function ketMatchOnly(value: string): boolean {
  return KET_RE.test(value);
}

export function personnelFromTextPages(pages: string[]): ParsedPersonnel[] {
  const personnel: ParsedPersonnel[] = [];
  const seen = new Set<string>();
  let fallbackNo = 1;

  pages.forEach((pageText, pageIndex) => {
    const pageNumber = pageIndex + 1;
    const pageHasTable =
      /PENUGASAN/i.test(pageText) &&
      /NAMA/i.test(pageText) &&
      (/PANGKAT\s*\/?\s*NRP/i.test(pageText) || /NRP/i.test(pageText));
    const pageHasLampiran = /LAMPIRAN/i.test(pageText) && /(?:NO|NAMA)/i.test(pageText);
    if (!pageHasTable && !pageHasLampiran) return;

    const lines = pageText.split('\n').map((line) => line.trim()).filter(Boolean);
    const blocks: string[] = [];
    let current = '';
    for (const line of lines) {
      if (/^(NO|NAMA|PANGKAT|JABATAN|PENUGASAN|KET|LAMPIRAN|HALAMAN)\b/i.test(line)) {
        continue;
      }
      if (/^\d{1,3}\s*[.)]?\s+/.test(line)) {
        if (current) blocks.push(current);
        current = line;
      } else if (current && line.length < 220) {
        current += ` ${line}`;
      }
    }
    if (current) blocks.push(current);

    for (const block of blocks) {
      const parsed = parsePersonnelLine(block, pageNumber);
      if (!parsed) continue;
      if (parsed.no > 300) continue;
      const key = `${parsed.no}::${parsed.name.replace(/\W/g, '')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      personnel.push(parsed);
      fallbackNo = Math.max(fallbackNo, parsed.no + 1);
    }
  });

  return personnel.sort((a, b) => (a.page === b.page ? a.no - b.no : a.page - b.page));
}

export function dedupePersonnel(personnel: ParsedPersonnel[]): ParsedPersonnel[] {
  const seen = new Set<string>();
  return personnel.filter((person) => {
    const key = `${person.no}::${person.name.replace(/\W/g, '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Urutkan pangkat terpanjang dulu agar "PENATA MUDA TK I" tidak terbaca "PENATA". */
const LAMPIRAN_RANK_RE = new RegExp(
  `\\b(${[...RANKS]
    .sort((a, b) => b.length - a.length)
    .map((rank) => rank.replace(/ /g, '\\s+'))
    .join('|')})\\b`,
  'i'
);

/**
 * Baris lampiran gaya "26. ANDI SISCA AIPDA BA SATLANTAS SIMP 3 GOLDEN":
 * nomor, nama, pangkat (tanpa NRP), lalu jabatan/penugasan/ket.
 */
export function parseLampiranRow(line: string, page: number): ParsedPersonnel | null {
  const match = /^\s*(\d{1,3})\s*[.)]\s+(.+)$/.exec(line);
  if (!match) return null;
  const no = Number(match[1]);
  if (!Number.isFinite(no) || no < 1 || no > 2000) return null;

  const body = match[2].replace(/\s+/g, ' ').trim();
  const rankMatch = LAMPIRAN_RANK_RE.exec(body);
  if (!rankMatch) return null;

  const name = body.slice(0, rankMatch.index).trim().replace(/[,\s]+$/, '');
  if (name.length < 3) return null;

  const rank = rankMatch[1].toUpperCase().replace(/\s+/g, ' ');
  const rest = body.slice(rankMatch.index + rankMatch[0].length).trim();
  const penMatch = rest.match(PENUGASAN_RE);
  const ketMatch = rest.match(KET_RE);

  const jabatan = cleanField(
    rest.replace(PENUGASAN_RE, ' ').replace(KET_RE, ' ').replace(/\s+/g, ' ')
  );

  return {
    no,
    name: name.toUpperCase(),
    rankNrp: null,
    rank,
    nrp: null,
    jabatan: jabatan ? jabatan.toUpperCase() : null,
    penugasan: penMatch ? penMatch[1].toUpperCase() : null,
    ket: ketMatch ? ketMatch[0].toUpperCase() : null,
    page,
    rawText: body
  };
}

/**
 * Ekstraksi cadangan untuk lampiran tanpa garis tabel (umum pada PDF Polri):
 * baris bernomor + pangkat, tanpa kolom NRP. Hanya dipakai bila parser utama
 * tidak menemukan personel sama sekali.
 */
export function personnelFromLampiranPages(pages: string[]): ParsedPersonnel[] {
  const rows: Array<{ text: string; page: number }> = [];

  pages.forEach((pageText, pageIndex) => {
    if (!/LAMPIRAN|DAFTAR PERSONEL|NO\.?\s*NAMA/i.test(pageText)) return;
    const lines = pageText.split('\n').map((line) => line.trim()).filter(Boolean);

    for (const line of lines) {
      if (/^(NO|NAMA|PANGKAT|JABATAN|PENUGASAN|KET|LAMPIRAN|TANGGAL|NOMOR|HALAMAN)\b/i.test(line)) {
        continue;
      }
      if (/^\d[\d\s.]*$/.test(line)) continue; // nomor halaman / indeks kolom
      if (/^\s*\d{1,3}\s*[.)]\s+/.test(line)) {
        rows.push({ text: line, page: pageIndex + 1 });
        continue;
      }
      // Teks hasil wrap milik baris sebelumnya.
      if (rows.length > 0 && line.length < 160) {
        rows[rows.length - 1].text = `${rows[rows.length - 1].text} ${line}`;
      }
    }
  });

  const personnel: ParsedPersonnel[] = [];
  for (const row of rows) {
    const parsed = parseLampiranRow(row.text, row.page);
    if (parsed) personnel.push(parsed);
  }
  return dedupePersonnel(personnel).sort((a, b) =>
    a.page === b.page ? a.no - b.no : a.page - b.page
  );
}

export function parseSprinText(
  rawText: string,
  pages: string[],
  personnel: ParsedPersonnel[],
  pageCount = pages.length
): ParsedSprinDocument {
  const text = normalizeDocumentText(rawText);
  const warnings: string[] = [];

  const number = extractNumber(text);
  const untukSection =
    sectionBetween(text, /^\s*Untuk\s*:/im, [
      /^\s*Tembusan\s*:/im,
      /^\s*Dikeluarkan\s+di/im,
      /^\s*KEPALA\s+KEPOLISIAN/im,
      /^\s*KAPOLRES/im
    ]) ?? null;
  const about =
    cleanField(text.match(/^\s*(?:Perihal|Tentang)\s*:\s*([^\n]+)/im)?.[1] ?? '') ??
    (untukSection
      ? cleanField(untukSection.split(/;\s/)[0] ?? untukSection)?.slice(0, 260) ?? null
      : null);
  const dasar =
    sectionBetween(text, /^\s*(?:Dasar|Menimbang|Pertimbangan)\s*:/im, [
      /^\s*Kepada\s*:/im,
      /^\s*Untuk\s*:/im,
      /^\s*Tembusan\s*:/im
    ]) ?? null;
  const untuk = untukSection;

  const explicitDate =
    text.match(/\n\s*TANGGAL\s*:\s*\n?\s*([^\n]+)/i)?.[1] ??
    text.match(/\n\s*Pada\s+Tanggal\s*:\s*([^\n]+)/i)?.[1] ??
    text.match(/\n\s*Tanggal\s+Pelaksanaan\s*:\s*([^\n]+)/i)?.[1];
  let dateText = cleanField(explicitDate ?? '') ?? null;
  const dateFromText = dateText ? parseIndonesianDate(dateText) : null;
  let activityDate = dateFromText;
  if (!activityDate) {
    const inline = text.match(
      /\b(\d{1,2}\s+(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4})\b/i
    )?.[1];
    activityDate = inline ? parseIndonesianDate(inline) : null;
    if (!dateText && inline) dateText = inline;
  }
  if (!activityDate) {
    const numeric = text.match(/\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4})\b/)?.[1];
    activityDate = numeric ? parseIndonesianDate(numeric) : null;
    if (!dateText && numeric) dateText = numeric;
  }

  const timeMatch = text.match(/(?:Pukul|Waktu)\s*:?\s*(\d{1,2})\s*[.:]\s*(\d{2})/i);
  const timeText = timeMatch
    ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
    : null;

  const place =
    cleanField(text.match(/(?:Tempat|Lokasi)\s*:?\s*([^\n]+)/i)?.[1] ?? '') ??
    cleanField(text.match(/Dikeluarkan\s+di\s*:?\s*([^\n]+)/i)?.[1] ?? '') ??
    null;
  const coordinates = parseCoordinate(text);
  const signatory = extractSignatory(text);

  if (!number) warnings.push('Nomor Sprin tidak terdeteksi.');
  if (!activityDate) warnings.push('Tanggal pelaksanaan tidak terdeteksi.');
  if (personnel.length === 0) warnings.push('Tabel personel tidak terdeteksi.');
  if (!untuk) warnings.push('Uraian tugas bagian "Untuk" tidak terdeteksi.');

  return {
    number,
    about,
    dasar,
    untuk,
    activityDate,
    dateText: dateText ?? formatIndonesianDate(activityDate),
    timeText,
    place,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    signatory: signatory.name,
    signatoryRank: signatory.rank,
    personnel: dedupePersonnel(personnel),
    rawText: text,
    pageCount,
    warnings,
    aiUsed: false
  };
}

export function personnelQualityScore(doc: ParsedSprinDocument): number {
  const fields = [doc.number, doc.about, doc.untuk, doc.activityDate, doc.place, doc.signatory];
  const filled = fields.filter(Boolean).length / fields.length;
  const rows = clamp(doc.personnel.length / 10, 0, 1);
  return Math.round(filled * 65 + rows * 35);
}
