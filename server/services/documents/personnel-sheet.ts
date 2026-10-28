import ExcelJS from 'exceljs';
import { dedupePersonnel, parsePersonnelCells } from './sprin-parser.js';
import type { ParsedPersonnel } from './types.js';

export type PersonnelSheetFormat = 'xlsx' | 'csv';

export interface PersonnelSheetResult {
  personnel: ParsedPersonnel[];
  /** Jumlah baris data yang tidak kosong. */
  rows: number;
  /** Baris yang tidak bisa dipetakan menjadi personel. */
  skipped: number;
  /** Peringatan yang layak ditampilkan ke operator. */
  warnings: string[];
  sheetName: string;
  /** Kolom yang berhasil dipetakan, untuk ditampilkan di UI. */
  mappedColumns: string[];
}

const ROWS_PER_PAGE = 18;
const MAX_HEADER_SCAN = 15;

type ColumnKey = 'no' | 'name' | 'rankNrp' | 'rank' | 'nrp' | 'jabatan' | 'penugasan' | 'ket';

interface HeaderMap {
  index: Partial<Record<ColumnKey, number>>;
  labels: string[];
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) {
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${value.getFullYear()}`;
  }
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? '').join('');
    }
    if ('result' in value) return cellText((value as { result: ExcelJS.CellValue }).result);
    if ('error' in value) return '';
  }
  return String(value);
}

/** Parser CSV sederhana yang mendukung tanda kutip ganda dan baris multiline. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(clean);
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
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
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
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

function detectDelimiter(text: string): string {
  const sample = text.slice(0, 4000);
  const counts: Record<string, number> = {
    ';': (sample.match(/;/g) ?? []).length,
    ',': (sample.match(/,/g) ?? []).length,
    '\t': (sample.match(/\t/g) ?? []).length
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ',';
}

function findHeader(rows: string[][]): { header: HeaderMap; dataStart: number } | null {
  for (let index = 0; index < Math.min(rows.length, MAX_HEADER_SCAN); index += 1) {
    const cells = (rows[index] ?? []).map((cell) => cell.replace(/\s+/g, ' ').trim());
    const upper = cells.map((cell) => cell.toUpperCase());
    const hasName = upper.some((cell) => /\bNAMA\b/.test(cell));
    const hasRank = upper.some((cell) => /PANGKAT|NRP/.test(cell));
    if (!hasName || !hasRank) continue;

    const map: HeaderMap = { index: {}, labels: cells };
    upper.forEach((cell, column) => {
      const put = (key: ColumnKey) => {
        if (map.index[key] === undefined) map.index[key] = column;
      };
      if (/^(NO|NOMOR)\b/.test(cell)) put('no');
      if (/\bNAMA\b/.test(cell)) put('name');
      if (/PANGKAT\s*\/\s*NRP|PANGKAT\/NRP/.test(cell)) put('rankNrp');
      else if (/^PANGKAT\b/.test(cell)) put('rank');
      else if (/^NRP\b/.test(cell)) put('nrp');
      if (/\bJABATAN\b/.test(cell)) put('jabatan');
      if (/\bPENUGASAN\b|\bTUGAS\b/.test(cell)) put('penugasan');
      if (/^(KET|KETERANGAN)\b/.test(cell)) put('ket');
    });
    if (map.index.name === undefined) continue;
    return { header: map, dataStart: index + 1 };
  }
  return null;
}

function rowCells(cells: string[], header: HeaderMap | null, fallbackNo: number): string[] {
  const value = (key: ColumnKey): string => {
    const index = header?.index[key];
    return index === undefined ? '' : (cells[index] ?? '').trim();
  };

  if (!header) {
    return cells.map((cell) => cell.trim());
  }

  const no = value('no') || String(fallbackNo);
  const name = value('name') || cells[header.index.name ?? 1] || '';
  const rankNrp =
    value('rankNrp') ||
    [value('rank'), value('nrp')].filter(Boolean).join('/') ||
    '';
  return [no, name, rankNrp, value('jabatan'), value('penugasan'), value('ket')];
}

export function isPersonnelSheet(filename: string, mimeType = ''): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xlsm') ||
    lower.endsWith('.csv') ||
    mimeType.includes('spreadsheetml') ||
    mimeType.includes('text/csv')
  );
}

export async function parsePersonnelSheet(
  buffer: Buffer,
  filename: string,
  mimeType = ''
): Promise<PersonnelSheetResult> {
  const lower = filename.toLowerCase();
  const isCsv = lower.endsWith('.csv') || mimeType.includes('text/csv');
  if (!isCsv && !isPersonnelSheet(filename, mimeType)) {
    throw new Error('Format berkas harus XLSX atau CSV.');
  }

  let rows: string[][];
  let sheetName = 'Sheet1';

  if (isCsv) {
    rows = parseCsv(buffer.toString('utf8'));
  } else {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet =
      workbook.worksheets.find((candidate) =>
        candidate.getSheetValues().some((row) =>
          Array.isArray(row) && row.some((cell) => typeof cell === 'string' && /NAMA/i.test(cell))
        )
      ) ?? workbook.worksheets[0];
    if (!sheet) throw new Error('Berkas Excel tidak memiliki lembar kerja.');
    sheetName = sheet.name;
    rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      const width = Math.max(row.cellCount, 1);
      for (let column = 1; column <= width; column += 1) {
        cells.push(cellText(row.getCell(column).value).trim());
      }
      rows.push(cells);
    });
  }

  if (rows.length === 0) {
    throw new Error('Berkas tidak berisi data.');
  }

  const detected = findHeader(rows);
  const warnings: string[] = [];
  const mappedColumns: string[] = [];

  if (!detected) {
    warnings.push(
      'Baris header (NAMA, PANGKAT/NRP, …) tidak ditemukan — kolom dibaca berurutan: NO, NAMA, PANGKAT/NRP, JABATAN, PENUGASAN, KET.'
    );
  } else {
    const { index } = detected.header;
    const pairs: Array<[ColumnKey, string]> = [
      ['no', 'NO'],
      ['name', 'NAMA'],
      ['rankNrp', 'PANGKAT/NRP'],
      ['rank', 'PANGKAT'],
      ['nrp', 'NRP'],
      ['jabatan', 'JABATAN'],
      ['penugasan', 'PENUGASAN'],
      ['ket', 'KET']
    ];
    for (const [key, label] of pairs) {
      if (index[key] !== undefined) mappedColumns.push(label);
    }
    if (index.name !== undefined && index.rankNrp === undefined && index.rank === undefined && index.nrp === undefined) {
      warnings.push('Kolom PANGKAT/NRP tidak ditemukan; personel tetap diimpor tanpa pangkat/NRP.');
    }
    if (index.penugasan === undefined) {
      warnings.push('Kolom PENUGASAN tidak ditemukan; semua personel akan dianggap "PESERTA".');
    }
  }

  const dataStart = detected?.dataStart ?? 0;
  const personnel: ParsedPersonnel[] = [];
  let rowsSeen = 0;
  let skipped = 0;
  let firstSkippedRow = 0;

  for (let index = dataStart; index < rows.length; index += 1) {
    const cells = (rows[index] ?? []).map((cell) => String(cell ?? '').trim());
    if (cells.every((cell) => cell === '')) continue;
    const joined = cells.join(' ').toUpperCase();
    if (/\bNAMA\b/.test(joined) && /PANGKAT|NRP/.test(joined)) continue; // header berulang

    rowsSeen += 1;
    const page = Math.floor((personnel.length) / ROWS_PER_PAGE) + 1;
    const parsed = parsePersonnelCells(rowCells(cells, detected?.header ?? null, index + 1), page, index + 1);
    if (parsed) {
      personnel.push(parsed);
    } else {
      skipped += 1;
      if (!firstSkippedRow) firstSkippedRow = index + 1;
    }
  }

  if (skipped > 0) {
    warnings.push(
      `${skipped} baris dilewati karena nama/nomor tidak terbaca (mulai baris ${firstSkippedRow}).`
    );
  }
  if (personnel.length === 0) {
    throw new Error(
      'Tidak ada baris personel yang terbaca. Pastikan ada kolom NAMA dan minimal satu baris berisi nama personel.'
    );
  }

  const deduped = dedupePersonnel(personnel);
  const duplicates = personnel.length - deduped.length;
  if (duplicates > 0) {
    warnings.push(`${duplicates} baris duplikat digabung (nomor + nama sama).`);
  }

  return {
    personnel: deduped,
    rows: rowsSeen,
    skipped,
    warnings,
    sheetName,
    mappedColumns
  };
}
