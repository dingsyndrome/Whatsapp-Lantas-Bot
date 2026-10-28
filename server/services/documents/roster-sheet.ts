import ExcelJS from 'exceljs';
import { normalizePhone } from '../../lib/phone.js';

export const PERWIRA_RANKS = ['IPDA', 'IPTU', 'AKP', 'KOMPOL', 'AKBP'] as const;

export type PersonnelCategory = 'PERWIRA' | 'PJU' | 'ANGGOTA';

export interface RosterRow {
  no: number;
  name: string;
  rank: string | null;
  nrp: string | null;
  jabatan: string | null;
  phone: string | null;
  unit: string | null;
  sandi: string | null;
  category: PersonnelCategory;
}

export interface RosterSheetResult {
  rows: RosterRow[];
  totalRows: number;
  skipped: number;
  warnings: string[];
  sheetName: string;
  mappedColumns: string[];
  counts: { perwira: number; anggota: number };
}

type Key = 'no' | 'name' | 'rank' | 'rankNrp' | 'nrp' | 'jabatan' | 'phone' | 'unit' | 'sandi';

const HEADER_PATTERNS: Array<[Key, RegExp]> = [
  ['no', /^(NO|NOMOR)\b/],
  ['name', /\bNAMA\b/],
  ['rankNrp', /PANGKAT\s*[/\\]\s*NRP/],
  ['rank', /^PANGKAT\b/],
  ['nrp', /^(NRP|NIP)\b/],
  ['jabatan', /\bJABATAN\b/],
  ['phone', /^(NO\s*HP|NOMOR\s*HP|NO\.?\s*HP|HANDPHONE|HAND\s*PHONE|WHATSAPP|WA\b|TELP|TELEPON|PHONE|KONTAK)/],
  ['unit', /\b(SATUAN|UNIT|BAGIAN|SIE|SEKSI)\b/],
  ['sandi', /\bSANDI\b|\bCALL\s*SIGN\b/]
];

const MAX_HEADER_SCAN = 15;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? '').join('');
    }
    if ('result' in value) return cellText((value as { result: ExcelJS.CellValue }).result);
  }
  return '';
}

export function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const sample = clean.slice(0, 4000);
  const delimiter = ([';', ',', '\t'] as const)
    .map((candidate) => ({ candidate, count: (sample.match(new RegExp(`\\${candidate}`, 'g')) ?? []).length }))
    .sort((a, b) => b.count - a.count)[0]?.candidate ?? ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (quoted) {
      if (char === '"') {
        if (clean[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\r') continue;
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function detectHeader(rows: string[][]): { map: Partial<Record<Key, number>>; labels: string[]; index: number } | null {
  for (let index = 0; index < Math.min(rows.length, MAX_HEADER_SCAN); index += 1) {
    const cells = (rows[index] ?? []).map((cell) => String(cell ?? '').replace(/\s+/g, ' ').trim());
    const upper = cells.map((cell) => cell.toUpperCase());
    const hasName = upper.some((cell) => /\bNAMA\b/.test(cell));
    if (!hasName) continue;

    const map: Partial<Record<Key, number>> = {};
    upper.forEach((cell, column) => {
      if (!cell) return;
      for (const [key, pattern] of HEADER_PATTERNS) {
        if (map[key] !== undefined) continue;
        if (pattern.test(cell)) {
          map[key] = column;
          break;
        }
      }
    });
    if (map.name === undefined) continue;
    return { map, labels: cells, index };
  }
  return null;
}

function categoryOf(rank: string | null, jabatan: string | null): PersonnelCategory {
  const rankUpper = (rank ?? '').toUpperCase();
  if ((PERWIRA_RANKS as readonly string[]).includes(rankUpper)) return 'PERWIRA';
  if (/\b(KAPOLRES|WAKA|KABAG|KASAT|KANIT|KAUR|KASI|KABID)\b/.test((jabatan ?? '').toUpperCase())) {
    return 'PJU';
  }
  return 'ANGGOTA';
}

export function isRosterSheet(filename: string, mimeType = ''): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xlsm') ||
    lower.endsWith('.csv') ||
    mimeType.includes('spreadsheetml') ||
    mimeType.includes('text/csv')
  );
}

export async function parseRosterSheet(
  buffer: Buffer,
  filename: string,
  mimeType = ''
): Promise<RosterSheetResult> {
  if (!isRosterSheet(filename, mimeType)) {
    throw new Error('Format berkas personel harus XLSX, XLSM, atau CSV.');
  }

  const lower = filename.toLowerCase();
  const isCsv = lower.endsWith('.csv') || mimeType.includes('text/csv');
  let rows: string[][];
  let sheetName = 'PERSONIL';

  if (isCsv) {
    rows = parseCsvRows(buffer.toString('utf8'));
  } else {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet =
      workbook.worksheets.find((candidate) =>
        candidate
          .getSheetValues()
          .some(
            (row) =>
              Array.isArray(row) &&
              row.some((cell) => typeof cell === 'string' && /NAMA/i.test(cell))
          )
      ) ?? workbook.worksheets[0];
    if (!sheet) throw new Error('Berkas Excel tidak memiliki lembar kerja.');
    sheetName = sheet.name;
    rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let column = 1; column <= Math.max(row.cellCount, 1); column += 1) {
        cells.push(cellText(row.getCell(column).value).replace(/\s+/g, ' ').trim());
      }
      rows.push(cells);
    });
  }

  if (rows.length === 0) throw new Error('Berkas personel kosong.');

  const detected = detectHeader(rows);
  if (!detected) {
    throw new Error(
      'Header kolom tidak dikenali. Pastikan ada baris berisi kolom NAMA (dan PANGKAT/NRP).'
    );
  }

  const warnings: string[] = [];
  const mappedColumns: string[] = [];
  const labelOf: Record<string, string> = {
    no: 'NO',
    name: 'NAMA',
    rank: 'PANGKAT',
    rankNrp: 'PANGKAT/NRP',
    nrp: 'NRP',
    jabatan: 'JABATAN',
    phone: 'NO HP',
    unit: 'SATUAN',
    sandi: 'SANDI'
  };
  for (const [key, column] of Object.entries(detected.map)) {
    if (column !== undefined) mappedColumns.push(labelOf[key] ?? key);
  }
  if (detected.map.phone === undefined) {
    warnings.push('Kolom NO HP tidak ditemukan; pencocokan pengirim WhatsApp hanya lewat nama.');
  }
  if (detected.map.rank === undefined && detected.map.rankNrp === undefined) {
    warnings.push('Kolom PANGKAT tidak ditemukan; status perwira tidak bisa dideteksi.');
  }

  const value = (cells: string[], key: Key): string => {
    const column = detected.map[key];
    return column === undefined ? '' : String(cells[column] ?? '').trim();
  };

  const roster: RosterRow[] = [];
  let skipped = 0;
  let firstSkipped = 0;

  for (let index = detected.index + 1; index < rows.length; index += 1) {
    const cells = (rows[index] ?? []).map((cell) => String(cell ?? '').replace(/\s+/g, ' ').trim());
    if (cells.every((cell) => !cell)) continue;
    const joined = cells.join(' ').toUpperCase();
    if (/\bNAMA\b/.test(joined) && /PANGKAT|NRP/.test(joined)) continue;

    const name = value(cells, 'name');
    if (!name || name.length < 3) {
      skipped += 1;
      if (!firstSkipped) firstSkipped = index + 1;
      continue;
    }

    let rank = value(cells, 'rank') || null;
    let nrp = value(cells, 'nrp') || null;
    const combined = value(cells, 'rankNrp');
    if (combined) {
      const [rankPart, nrpPart] = combined.split(/[/\\]/, 2);
      rank = rank || rankPart?.trim() || null;
      nrp = nrp || nrpPart?.trim() || null;
    }

    const jabatan = value(cells, 'jabatan') || null;
    const rankUpper = rank ? rank.toUpperCase().replace(/\s+/g, ' ') : null;

    roster.push({
      no: Number(value(cells, 'no').match(/\d{1,3}/)?.[0] ?? roster.length + 1) || roster.length + 1,
      name,
      rank: rankUpper,
      nrp: nrp ? nrp.replace(/\D/g, '') || nrp : null,
      jabatan: jabatan ? jabatan.toUpperCase() : null,
      phone: normalizePhone(value(cells, 'phone')),
      unit: value(cells, 'unit') || null,
      sandi: value(cells, 'sandi') ? value(cells, 'sandi').toUpperCase() : null,
      category: categoryOf(rankUpper, jabatan)
    });
  }

  if (roster.length === 0) {
    throw new Error('Tidak ada baris personel yang terbaca (kolom NAMA kosong).');
  }
  if (skipped > 0) {
    warnings.push(`${skipped} baris dilewati karena nama kosong/terlalu pendek (mulai baris ${firstSkipped}).`);
  }

  const perwira = roster.filter((row) => row.category === 'PERWIRA').length;
  return {
    rows: roster,
    totalRows: roster.length,
    skipped,
    warnings,
    sheetName,
    mappedColumns,
    counts: { perwira, anggota: roster.length - perwira }
  };
}
