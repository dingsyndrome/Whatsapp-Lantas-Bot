import * as cheerio from 'cheerio';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { logger } from '../../lib/logger.js';
import { getBotConfig } from '../settings.js';
import { extractDocumentWithAi } from '../ai/client.js';
import {
  dedupePersonnel,
  normalizeDocumentText,
  parseIndonesianDate,
  parsePersonnelCells,
  parsePersonnelLine,
  parseSprinText,
  personnelFromLampiranPages,
  personnelFromTextPages
} from './sprin-parser.js';
import { PAGE_BREAK, type ParsedPersonnel, type ParsedSprinDocument } from './types.js';

function personnelQuality(person: ParsedPersonnel): number {
  let score = 0;
  if (person.name && person.name.length >= 4) score += 10;
  if (/^[A-Z ]+\s*\/\s*\d{4,}$/.test(person.rankNrp ?? '')) score += 30;
  if (person.rank) score += 10;
  if (person.nrp && person.nrp.length >= 5) score += 10;
  if (person.jabatan) score += 8;
  if (person.penugasan && /^(KOORDINATOR|PENDAMPING|PESERTA|UNDANGAN|DRIVER|WASKAT)$/.test(person.penugasan)) {
    score += 16;
  }
  if (person.ket) score += 4;
  if (/\bPENATA$|\bMUDA$/.test(person.name)) score -= 8;
  return score;
}

function chooseBestPersonnel(candidates: ParsedPersonnel[]): ParsedPersonnel[] {
  const byNumber = new Map<number, ParsedPersonnel>();
  for (const candidate of candidates) {
    const current = byNumber.get(candidate.no);
    if (!current || personnelQuality(candidate) > personnelQuality(current)) {
      byNumber.set(candidate.no, candidate);
    }
  }
  return [...byNumber.values()].sort((a, b) =>
    a.page === b.page ? a.no - b.no : a.page - b.page
  );
}

export async function extractPdf(
  buffer: Buffer
): Promise<{ rawText: string; pages: string[]; tablePersonnel: ParsedPersonnel[] }> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const textResult = await parser.getText();
    const pages = textResult.pages.map((page) => normalizeDocumentText(page.text));
    const rawText = pages.map((page) => `${page}${PAGE_BREAK}`).join('');

    const tablePersonnel: ParsedPersonnel[] = [];
    try {
      const tableResult = await parser.getTable();
      for (const page of tableResult.pages) {
        for (const table of page.tables) {
          let headerSeen = false;
          for (const row of table) {
            const cells = row.map((cell) => String(cell ?? '').replace(/\s+/g, ' ').trim());
            if (cells.length === 0) continue;
            if (cells.some((cell) => /NAMA/i.test(cell)) && cells.some((cell) => /PANGKAT|NRP/i.test(cell))) {
              headerSeen = true;
              continue;
            }
            if (!headerSeen) continue;
            const parsed = parsePersonnelCells(cells, page.num, tablePersonnel.length + 1);
            if (parsed) tablePersonnel.push(parsed);
          }
        }
      }
    } catch (error) {
      logger.debug({ err: error }, 'PDF table detection unavailable, falling back to text');
    }

    return { rawText, pages, tablePersonnel: dedupePersonnel(tablePersonnel) };
  } finally {
    await parser.destroy();
  }
}

interface DocxTableData {
  html: string;
  messages: unknown[];
}

async function extractDocx(
  buffer: Buffer
): Promise<{ rawText: string; html: string; tables: DocxTableData[] }> {
  const [htmlResult, rawResult] = await Promise.all([
    mammoth.convertToHtml({ buffer }),
    mammoth.extractRawText({ buffer })
  ]);
  return {
    rawText: rawResult.value,
    html: htmlResult.value,
    tables: [{ html: htmlResult.value, messages: htmlResult.messages }]
  };
}

function personnelFromDocxHtml(html: string): ParsedPersonnel[] {
  const $ = cheerio.load(html);
  const personnel: ParsedPersonnel[] = [];
  const seen = new Set<string>();
  let rowIndex = 0;

  $('table').each((_tableIndex, table) => {
    const rows = $(table).find('tr').toArray();
    let headerMap: Record<string, number> | null = null;

    for (const row of rows) {
      const cellNodes = $(row).find('td,th').toArray();
      const cells = cellNodes.map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());
      if (cells.length === 0) continue;
      const joinedHeader = cells.join(' ').toUpperCase();

      if (
        cells.some((cell) => /NAMA/i.test(cell)) &&
        cells.some((cell) => /PANGKAT|NRP/i.test(cell)) &&
        cells.some((cell) => /JABATAN|PENUGASAN/i.test(cell))
      ) {
        headerMap = {};
        cells.forEach((cell, index) => {
          const value = cell.toUpperCase();
          if (/^NO\b/.test(value)) headerMap!.no = index;
          else if (/NAMA/.test(value)) headerMap!.name = index;
          else if (/PANGKAT|NRP/.test(value)) headerMap!.rankNrp = index;
          else if (/JABATAN/.test(value)) headerMap!.jabatan = index;
          else if (/PENUGASAN/.test(value)) headerMap!.penugasan = index;
          else if (/^KET\b|KETERANGAN/.test(value)) headerMap!.ket = index;
        });
        continue;
      }

      if (!/^\d{1,3}\b/.test(cells[0] ?? '')) continue;
      rowIndex += 1;
      const page = Math.floor((rowIndex - 1) / 18) + 1;
      let normalizedCells: string[];

      if (headerMap) {
        normalizedCells = [
          cells[headerMap.no ?? 0] ?? cells[0],
          cells[headerMap.name ?? 1] ?? cells[1] ?? '',
          cells[headerMap.rankNrp ?? 2] ?? cells[2] ?? '',
          cells[headerMap.jabatan ?? 3] ?? cells[3] ?? '',
          cells[headerMap.penugasan ?? 4] ?? cells[4] ?? '',
          cells[headerMap.ket ?? 5] ?? cells[5] ?? ''
        ];
      } else {
        normalizedCells = cells;
      }

      const parsed = parsePersonnelCells(normalizedCells, page, rowIndex);
      if (!parsed) continue;
      const key = `${parsed.no}::${parsed.name.replace(/\W/g, '')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      personnel.push(parsed);
    }
  });

  return dedupePersonnel(personnel);
}

function mapAiPersonnel(raw: Record<string, unknown>): ParsedPersonnel[] {
  if (!Array.isArray(raw.personnel)) return [];
  return raw.personnel
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const str = (key: string): string | null => {
        const value = row[key];
        return typeof value === 'string' && value.trim() ? value.trim() : null;
      };
      const no = Number(row.no ?? index + 1);
      const name = str('name');
      if (!name || !Number.isFinite(no)) return null;
      const rankNrp = str('rankNrp');
      let rank: string | null = null;
      let nrp: string | null = null;
      if (rankNrp?.includes('/')) {
        const [rankPart, nrpPart] = rankNrp.split('/', 2);
        rank = rankPart?.trim() || null;
        nrp = nrpPart?.replace(/\D/g, '') || null;
      }
      return {
        no,
        name: name.toUpperCase(),
        rankNrp,
        rank,
        nrp,
        jabatan: str('jabatan'),
        penugasan: str('penugasan'),
        ket: str('ket'),
        page: Number(row.page ?? 1),
        rawText: JSON.stringify(row)
      };
    })
    .filter((row): row is ParsedPersonnel => Boolean(row));
}

async function enhanceWithAi(
  parsed: ParsedSprinDocument
): Promise<ParsedSprinDocument> {
  const bot = await getBotConfig();
  if (!bot.aiEnabled) return parsed;
  const needsAi =
    !parsed.number ||
    !parsed.untuk ||
    parsed.personnel.length === 0 ||
    parsed.warnings.length >= 3;
  if (!needsAi) return parsed;

  const aiRaw = await extractDocumentWithAi(
    { enabled: true, baseUrl: bot.aiBaseUrl, apiKey: bot.aiApiKey, model: bot.aiModel },
    bot.documentPrompt,
    parsed.rawText
  );
  if (!aiRaw) return parsed;

  const str = (key: string): string | null => {
    const value = aiRaw[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };
  const aiPersonnel = mapAiPersonnel(aiRaw);
  const mergedPersonnel =
    aiPersonnel.length > parsed.personnel.length ? aiPersonnel : parsed.personnel;

  return {
    ...parsed,
    number: parsed.number ?? str('number'),
    about: parsed.about ?? str('about'),
    dasar: parsed.dasar ?? str('dasar'),
    untuk: parsed.untuk ?? str('untuk'),
    activityDate:
      parsed.activityDate ??
      parseIndonesianDate(str('activityDate') ?? str('date') ?? ''),
    timeText: parsed.timeText ?? str('time'),
    place: parsed.place ?? str('place'),
    signatory: parsed.signatory ?? str('signatory'),
    signatoryRank: parsed.signatoryRank ?? str('signatoryRank'),
    personnel: mergedPersonnel,
    aiUsed: true,
    warnings: parsed.warnings.filter((warning) =>
      aiPersonnel.length > parsed.personnel.length
        ? !warning.toLowerCase().includes('personel')
        : true
    )
  };
}

export async function parseSprinDocument(
  buffer: Buffer,
  filename: string,
  mimeType = ''
): Promise<ParsedSprinDocument> {
  const lower = filename.toLowerCase();
  const isPdf = lower.endsWith('.pdf') || mimeType.includes('pdf');
  const isDocx =
    lower.endsWith('.docx') ||
    mimeType.includes('wordprocessingml') ||
    mimeType === 'application/msword';

  let parsed: ParsedSprinDocument;

  if (isPdf) {
    const { rawText, pages, tablePersonnel } = await extractPdf(buffer);
    const textPersonnel = personnelFromTextPages(pages);
    let personnel = chooseBestPersonnel([...tablePersonnel, ...textPersonnel]);
    if (personnel.length === 0) {
      // Lampiran Polri sering tanpa garis tabel & tanpa kolom NRP.
      personnel = personnelFromLampiranPages(pages);
    }
    parsed = parseSprinText(rawText, pages, personnel, pages.length);
  } else if (isDocx) {
    const { rawText, html } = await extractDocx(buffer);
    let personnel = personnelFromDocxHtml(html);
    if (personnel.length === 0) {
      const lines = normalizeDocumentText(rawText)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        if (!/^\d{1,3}\s*[.)]?\s+/.test(line)) continue;
        const row = parsePersonnelLine(line, 1);
        if (row) personnel.push(row);
      }
      personnel = dedupePersonnel(personnel);
    }
    parsed = parseSprinText(rawText, [rawText], personnel, Math.max(1, Math.ceil(personnel.length / 18)));
  } else {
    throw new Error('Format dokumen tidak didukung. Gunakan PDF atau DOCX.');
  }

  return enhanceWithAi(parsed);
}
