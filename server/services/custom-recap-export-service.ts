import ExcelJS from 'exceljs';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx';
import PDFDocument from 'pdfkit';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { TURJAWALI_LABELS } from '../../shared/types.js';
import { formatRankName } from '../../shared/personnel-name.js';
import type { CustomRecapResult } from './custom-recap-service.js';

export type CustomRecapExportFormat = 'xlsx' | 'docx' | 'pdf';

export interface CustomRecapExportFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

const CONTENT_TYPES: Record<CustomRecapExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf'
};

function categoryLabel(recap: CustomRecapResult): string {
  if (recap.category === 'ALL') return 'Semua Kegiatan';
  if (recap.category === 'POS_PAGI') return 'Pos Pagi';
  return TURJAWALI_LABELS[recap.category] ?? recap.category;
}

function periodLabel(recap: CustomRecapResult): string {
  const fromDate = new Date(`${recap.range.from}T00:00:00`);
  const toDate = new Date(`${recap.range.to}T00:00:00`);
  const dateLabel =
    recap.range.from === recap.range.to
      ? format(fromDate, 'EEEE, dd MMMM yyyy', { locale: localeId })
      : `${format(fromDate, 'dd MMMM yyyy', { locale: localeId })} – ${format(toDate, 'dd MMMM yyyy', { locale: localeId })}`;
  const timeLabel =
    recap.range.startTime || recap.range.endTime
      ? ` · ${recap.range.startTime ?? '00:00'}–${recap.range.endTime ?? '23:59'}`
      : '';
  return `${dateLabel}${timeLabel}`;
}

function generatedLabel(): string {
  return format(new Date(), 'dd MMMM yyyy HH:mm', { locale: localeId });
}

function fileBase(recap: CustomRecapResult): string {
  const range =
    recap.range.from === recap.range.to
      ? recap.range.from
      : `${recap.range.from}_${recap.range.to}`;
  return `SIGAP-Rekap-${recap.category}-${range}`;
}

function timeOf(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : format(date, 'HH:mm');
}

function personTimeRange(firstAt: string, lastAt: string, times: string[]): string {
  if (times.length > 1) return `${times[0]}–${times[times.length - 1]}`;
  if (times.length === 1) return times[0] ?? '-';
  if (firstAt && lastAt) return `${timeOf(firstAt)}–${timeOf(lastAt)}`;
  return '-';
}

function submittedPersonnel(recap: CustomRecapResult) {
  return recap.personnel.submitted.filter((person) => person.category !== 'PERWIRA');
}

function pendingPersonnel(recap: CustomRecapResult) {
  return recap.personnel.notSubmitted.filter((person) => person.category !== 'PERWIRA');
}

function activityRows(recap: CustomRecapResult): Array<Array<string | number>> {
  return [...recap.activities]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((activity, index) => [
      index + 1,
      timeOf(activity.at),
      TURJAWALI_LABELS[activity.category] ?? activity.category,
      activity.address ?? '-',
      activity.unitName ?? '-',
      activity.senderLabel,
      activity.matchStatus,
      formatRankName(activity.supervisorRank, activity.supervisorName) || '-'
    ]);
}

function submittedRows(recap: CustomRecapResult): Array<Array<string | number>> {
  return submittedPersonnel(recap).map((person, index) => [
    index + 1,
    person.displayName,
    person.photos,
    person.links,
    personTimeRange(person.firstAt, person.lastAt, person.times)
  ]);
}

function pendingRows(recap: CustomRecapResult): Array<Array<string | number>> {
  return pendingPersonnel(recap).map((person, index) => [
    index + 1,
    person.displayName,
    person.phone ?? '-'
  ]);
}

function supervisorRows(recap: CustomRecapResult): Array<Array<string | number>> {
  return recap.supervisors.map((person, index) => [
    index + 1,
    person.sandi ?? '-',
    formatRankName(person.rank, person.name),
    person.count,
    person.locations.join(' | ') || '-',
    person.times.length > 1 ? `${person.times[0]}–${person.times[person.times.length - 1]}` : person.times[0] ?? '-'
  ]);
}

function supervisionRows(recap: CustomRecapResult): Array<Array<string | number>> {
  return recap.supervisionEvents.map((event, index) => [
    index + 1,
    event.time,
    event.sandi ?? '-',
    formatRankName(event.rank, event.name),
    event.location,
    TURJAWALI_LABELS[event.turjawaliType as keyof typeof TURJAWALI_LABELS] ?? event.turjawaliType
  ]);
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

function styleHeader(sheet: ExcelJS.Worksheet): void {
  const header = sheet.getRow(1);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF0B1220' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFACC15' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });
  header.height = 24;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
}

function addExcelSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: Array<Array<string | number>>,
  widths: number[]
): void {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = headers.map((header, index) => ({
    header,
    key: `col${index}`,
    width: widths[index] ?? 18
  }));
  rows.forEach((row) => sheet.addRow(row));
  styleHeader(sheet);
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.font = { size: 9 };
    });
  });
}

export async function buildCustomRecapXlsx(recap: CustomRecapResult): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIGAP Command Center';
  workbook.created = new Date();

  const summary = workbook.addWorksheet('Ringkasan');
  summary.columns = [
    { key: 'label', width: 34 },
    { key: 'value', width: 60 }
  ];
  summary.mergeCells('A1:B1');
  summary.getCell('A1').value = `REKAP ${categoryLabel(recap).toUpperCase()}`;
  summary.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF0B1220' } };
  summary.getCell('A1').alignment = { vertical: 'middle' };
  summary.addRow([]);
  summary.addRow(['Periode', periodLabel(recap)]);
  summary.addRow(['Jenis Rekap', categoryLabel(recap)]);
  summary.addRow(['Digenerate', generatedLabel()]);
  summary.addRow(['Foto Timemark', recap.counts.photos]);
  summary.addRow(['Link Anggota', recap.counts.links]);
  summary.addRow(['Kegiatan', recap.counts.activities]);
  summary.addRow(['Perwira Pengawas', recap.counts.supervisors]);
  summary.addRow(['Anggota Sudah Melapor', submittedPersonnel(recap).length]);
  summary.addRow(['Anggota Belum Melapor', pendingPersonnel(recap).length]);
  summary.eachRow((row, index) => {
    if (index === 1) return;
    const first = row.getCell(1);
    first.font = { bold: true, size: 10 };
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true };
    });
  });

  addExcelSheet(
    workbook,
    'Kegiatan',
    ['No', 'Waktu', 'Kategori', 'Lokasi', 'Unit', 'Pengirim', 'Status Match', 'Perwira Pengawas'],
    activityRows(recap),
    [6, 10, 28, 52, 30, 32, 18, 34]
  );
  addExcelSheet(
    workbook,
    'Sudah Melapor',
    ['No', 'Pangkat/Nama', 'Foto', 'Link', 'Waktu Melapor'],
    submittedRows(recap),
    [6, 36, 9, 9, 20]
  );
  addExcelSheet(
    workbook,
    'Belum Melapor',
    ['No', 'Pangkat/Nama', 'No HP'],
    pendingRows(recap),
    [6, 36, 18]
  );
  addExcelSheet(
    workbook,
    'Perwira Pengawas',
    ['No', 'Sandi', 'Pangkat/Nama', 'Jumlah', 'Lokasi', 'Waktu'],
    supervisorRows(recap),
    [6, 12, 38, 10, 52, 24]
  );
  addExcelSheet(
    workbook,
    'Supervisi',
    ['No', 'Waktu', 'Sandi', 'Pangkat/Nama', 'Lokasi', 'Kategori'],
    supervisionRows(recap),
    [6, 10, 12, 38, 52, 28]
  );

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------------

function docCell(text: string, options: { bold?: boolean; header?: boolean } = {}): TableCell {
  return new TableCell({
    shading: options.header ? { fill: 'FACC15' } : undefined,
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({
            text,
            bold: options.bold || options.header,
            size: options.header ? 17 : 16,
            color: options.header ? '0B1220' : '111827'
          })
        ]
      })
    ]
  });
}

function docTable(headers: string[], rows: Array<Array<string | number>>): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((header) => docCell(header, { header: true }))
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: row.map((cell) => docCell(String(cell ?? '-')))
          })
      )
    ]
  });
}

function docSection(title: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 220, after: 100 },
    children: [new TextRun({ text: title, bold: true, size: 22, color: '0B1220' })]
  });
}

export async function buildCustomRecapDocx(recap: CustomRecapResult): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [];
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: `REKAP ${categoryLabel(recap).toUpperCase()}`,
          bold: true,
          size: 30,
          color: '0B1220'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [new TextRun({ text: periodLabel(recap), size: 20, color: '374151' })]
    })
  );

  const summaryRows: Array<Array<string | number>> = [
    ['Foto Timemark', recap.counts.photos],
    ['Link Anggota', recap.counts.links],
    ['Kegiatan', recap.counts.activities],
    ['Perwira Pengawas', recap.counts.supervisors],
    ['Anggota Sudah Melapor', submittedPersonnel(recap).length],
    ['Anggota Belum Melapor', pendingPersonnel(recap).length],
    ['Digenerate', generatedLabel()]
  ];
  children.push(
    new Table({
      width: { size: 70, type: WidthType.PERCENTAGE },
      rows: summaryRows.map(
        ([label, value]) =>
          new TableRow({
            children: [
              docCell(String(label), { bold: true }),
              docCell(String(value))
            ]
          })
      )
    })
  );

  children.push(docSection('Rincian Kegiatan'));
  children.push(
    activityRows(recap).length > 0
      ? docTable(
          ['No', 'Waktu', 'Kategori', 'Lokasi', 'Unit', 'Pengirim', 'Status', 'Pengawas'],
          activityRows(recap)
        )
      : new Paragraph({ children: [new TextRun({ text: 'Tidak ada kegiatan pada rentang ini.', italics: true })] })
  );

  children.push(docSection('Perwira Pengawas'));
  children.push(
    supervisorRows(recap).length > 0
      ? docTable(['No', 'Sandi', 'Pangkat/Nama', 'Jumlah', 'Lokasi', 'Waktu'], supervisorRows(recap))
      : new Paragraph({ children: [new TextRun({ text: 'Tidak ada perwira pengawas terdeteksi.', italics: true })] })
  );

  children.push(docSection('Personel Sudah Melapor'));
  children.push(
    submittedRows(recap).length > 0
      ? docTable(['No', 'Pangkat/Nama', 'Foto', 'Link', 'Waktu Melapor'], submittedRows(recap))
      : new Paragraph({ children: [new TextRun({ text: 'Belum ada anggota yang melapor.', italics: true })] })
  );

  children.push(docSection('Personel Belum Melapor'));
  children.push(
    pendingRows(recap).length > 0
      ? docTable(['No', 'Pangkat/Nama', 'No HP'], pendingRows(recap))
      : new Paragraph({ children: [new TextRun({ text: 'Semua anggota roster sudah melapor.', italics: true })] })
  );

  children.push(docSection('Supervisi Perwira'));
  children.push(
    supervisionRows(recap).length > 0
      ? docTable(['No', 'Waktu', 'Sandi', 'Pangkat/Nama', 'Lokasi', 'Kategori'], supervisionRows(recap))
      : new Paragraph({ children: [new TextRun({ text: 'Belum ada laporan supervisi pada rentang ini.', italics: true })] })
  );

  const document = new Document({
    creator: 'SIGAP Command Center',
    title: `Rekap ${categoryLabel(recap)}`,
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE }
          }
        },
        children
      }
    ]
  });

  return Packer.toBuffer(document);
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

function pdfText(value: string | number): string {
  return String(value ?? '-')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

type PdfColumn = { label: string; width: number };

function drawPdfTable(
  doc: PDFKit.PDFDocument,
  columns: PdfColumn[],
  rows: Array<Array<string | number>>
): void {
  const left = doc.page.margins.left;
  const bottom = doc.page.height - doc.page.margins.bottom;
  const totalWidth = columns.reduce((total, column) => total + column.width, 0);
  const scale = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / totalWidth;
  const widths = columns.map((column) => column.width * scale);

  const drawHeader = (): void => {
    const top = doc.y;
    let x = left;
    const height = 22;
    doc.save().fillColor('#1F2937').rect(left, top, widths.reduce((a, b) => a + b, 0), height).fill().restore();
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#FFFFFF');
    columns.forEach((column, index) => {
      doc.text(pdfText(column.label), x + 4, top + 6, {
        width: widths[index]! - 8,
        align: 'left'
      });
      x += widths[index]!;
    });
    doc.y = top + height;
    doc.fillColor('#111827');
  };

  drawHeader();

  rows.forEach((row, rowIndex) => {
    doc.font('Helvetica').fontSize(7.5);
    const heights = row.map((cell, index) =>
      doc.heightOfString(pdfText(cell), { width: widths[index]! - 8 })
    );
    const rowHeight = Math.max(16, ...heights.map((height) => height + 8));
    if (doc.y + rowHeight > bottom) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      drawHeader();
    }
    const rowTop = doc.y;
    if (rowIndex % 2 === 1) {
      doc.save().fillColor('#F8FAFC').rect(left, rowTop, widths.reduce((a, b) => a + b, 0), rowHeight).fill().restore();
    }
    let x = left;
    row.forEach((cell, index) => {
      doc.fillColor('#111827').text(pdfText(cell), x + 4, rowTop + 4, {
        width: widths[index]! - 8,
        align: 'left'
      });
      x += widths[index]!;
    });
    doc.y = rowTop + rowHeight;
    doc.moveTo(left, doc.y).lineTo(left + widths.reduce((a, b) => a + b, 0), doc.y).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
  });
  doc.y += 8;
}

function pdfSection(doc: PDFKit.PDFDocument, title: string): void {
  if (doc.y + 40 > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0B1220').text(title, doc.page.margins.left, doc.y);
  doc.moveDown(0.35);
  doc.font('Helvetica').fontSize(8).fillColor('#111827');
}

export async function buildCustomRecapPdf(recap: CustomRecapResult): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: 32, bottom: 32, left: 32, right: 32 },
    bufferPages: true,
    info: {
      Title: `Rekap ${categoryLabel(recap)}`,
      Author: 'SIGAP Command Center'
    }
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.font('Helvetica-Bold').fontSize(16).fillColor('#0B1220').text(`REKAP ${categoryLabel(recap).toUpperCase()}`, { align: 'center' });
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(9).fillColor('#374151').text(periodLabel(recap), { align: 'center' });
  doc.moveDown(0.8);

  const summaryLines = [
    `Foto Timemark: ${recap.counts.photos}    Link: ${recap.counts.links}    Kegiatan: ${recap.counts.activities}`,
    `Perwira Pengawas: ${recap.counts.supervisors}    Sudah Melapor: ${submittedPersonnel(recap).length}    Belum Melapor: ${pendingPersonnel(recap).length}`,
    `Digenerate: ${generatedLabel()}`
  ];
  summaryLines.forEach((line) => doc.fontSize(8).fillColor('#374151').text(line));
  doc.moveDown(0.3);

  pdfSection(doc, 'RINCIAN KEGIATAN');
  drawPdfTable(
    doc,
    [
      { label: 'No', width: 24 },
      { label: 'Waktu', width: 36 },
      { label: 'Kategori', width: 76 },
      { label: 'Lokasi', width: 180 },
      { label: 'Unit', width: 110 },
      { label: 'Pengirim', width: 130 },
      { label: 'Status', width: 60 },
      { label: 'Pengawas', width: 130 }
    ],
    activityRows(recap)
  );

  pdfSection(doc, 'PERWIRA PENGAWAS');
  drawPdfTable(
    doc,
    [
      { label: 'No', width: 24 },
      { label: 'Sandi', width: 40 },
      { label: 'Pangkat/Nama', width: 150 },
      { label: 'Jumlah', width: 40 },
      { label: 'Lokasi', width: 250 },
      { label: 'Waktu', width: 100 }
    ],
    supervisorRows(recap)
  );

  pdfSection(doc, 'PERSONEL SUDAH MELAPOR');
  drawPdfTable(
    doc,
    [
      { label: 'No', width: 24 },
      { label: 'Pangkat/Nama', width: 200 },
      { label: 'Foto', width: 40 },
      { label: 'Link', width: 40 },
      { label: 'Waktu Melapor', width: 120 }
    ],
    submittedRows(recap)
  );

  pdfSection(doc, 'PERSONEL BELUM MELAPOR');
  drawPdfTable(
    doc,
    [
      { label: 'No', width: 24 },
      { label: 'Pangkat/Nama', width: 240 },
      { label: 'No HP', width: 100 }
    ],
    pendingRows(recap)
  );

  pdfSection(doc, 'SUPERVISI PERWIRA');
  drawPdfTable(
    doc,
    [
      { label: 'No', width: 24 },
      { label: 'Waktu', width: 36 },
      { label: 'Sandi', width: 42 },
      { label: 'Pangkat/Nama', width: 160 },
      { label: 'Lokasi', width: 250 },
      { label: 'Kategori', width: 100 }
    ],
    supervisionRows(recap)
  );

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    doc.font('Helvetica').fontSize(7).fillColor('#6B7280').text(
      `Halaman ${index + 1} dari ${range.count}`,
      0,
      doc.page.height - 20,
      { align: 'center', width: doc.page.width }
    );
  }

  doc.end();
  return done;
}

export async function buildCustomRecapExport(
  recap: CustomRecapResult,
  format: CustomRecapExportFormat
): Promise<CustomRecapExportFile> {
  const extension = format;
  const buffer =
    format === 'xlsx'
      ? await buildCustomRecapXlsx(recap)
      : format === 'docx'
        ? await buildCustomRecapDocx(recap)
        : await buildCustomRecapPdf(recap);

  return {
    buffer,
    filename: `${fileBase(recap)}.${extension}`,
    contentType: CONTENT_TYPES[format]
  };
}
