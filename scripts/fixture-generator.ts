import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  PageBreak,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx';
import { paths } from '../server/config.js';

export interface FixtureSet {
  images: string[];
  pdf: string;
  docx: string;
}

const DEMO_PHOTOS = [
  {
    file: 'timemark-1.jpg',
    time: '08:43',
    day: 'Selasa',
    date: '27/10/2026',
    addressLines: ['Jl. Raya Maumere - Ende, Desa Waioti,', 'Kec. Alok Timur, Kab. Sikka,', 'Nusa Tenggara Timur'],
    unit: 'Satlantas Polres Sikka',
    coordinate: '8.619101°S, 122.217334°E',
    palette: ['#0f2027', '#2c5364', '#f9d976', '#264653', '#e9c46a']
  },
  {
    file: 'timemark-2.jpg',
    time: '07:10',
    day: 'Senin',
    date: '26/10/2026',
    addressLines: ['Jl. Diponegoro No. 12, Kel. Kota Uneng,', 'Kec. Alok, Kab. Sikka,', 'Nusa Tenggara Timur'],
    unit: 'Satuan Lalu Lintas Polres Sikka',
    coordinate: '8.621055°S, 122.211156°E',
    palette: ['#1a2a6c', '#b21f1f', '#fdbb2d', '#2a9d8f', '#f4a261']
  },
  {
    file: 'timemark-3.jpg',
    time: '06:47',
    day: 'Minggu',
    date: '04/10/2026',
    addressLines: ['Jl. Soekarno-Hatta, Kel. Madawat,', 'Kec. Alok, Kab. Sikka,', 'Nusa Tenggara Timur'],
    unit: 'Regu Pengatur Satlantas Polres Sikka',
    coordinate: '8.615470°S, 122.220911°E',
    palette: ['#232526', '#414345', '#f7b733', '#2d6a4f', '#95d5b2']
  },
  {
    file: 'timemark-4.jpg',
    time: '09:15',
    day: 'Selasa',
    date: '27/10/2026',
    addressLines: ['Jl. El Tari, Kel. Beru, Kec. Alok Timur,', 'Kab. Sikka, Nusa Tenggara Timur'],
    unit: 'Satuan Sabhara Polres Sikka',
    coordinate: '8.612874°S, 122.226451°E',
    palette: ['#0b132b', '#1c2541', '#ffd166', '#3a506b', '#ef476f']
  }
];

const PERSONNEL = [
  ['1', 'IPDA ANDI SAPUTRA', 'IPDA/850101', 'KANIT TURJAG', 'KOORDINATOR', 'PDU I'],
  ['2', 'AIPTU YOHANES BATA', 'AIPTU/870312', 'BANIT SAMAPTA', 'PENDAMPING', 'PDL TWO TONE'],
  ['3', 'BRIPKA MARTHEN LAWE', 'BRIPKA/880415', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['4', 'BRIPKA FRANSISKUS DUA', 'BRIPKA/890712', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['5', 'BRIPDA YULIANUS KIA', 'BRIPDA/950118', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['6', 'BRIPDA AGUSTINA LOPES', 'BRIPDA/960204', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['7', 'BRIPKA RONALDO DA COSTA', 'BRIPKA/900521', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['8', 'BRIPDA MARIA GORETI', 'BRIPDA/970309', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['9', 'AIPDA PETRUS BALA', 'AIPDA/860218', 'BANIT LANTAS', 'PENDAMPING', 'PDL TWO TONE'],
  ['10', 'BRIPKA YOSEF TANGA', 'BRIPKA/890918', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['11', 'BRIPDA ANGGELA NAHA', 'BRIPDA/960712', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['12', 'BRIPDA RIKARDUS LEWAR', 'BRIPDA/970822', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['13', 'BRIPKA STEPANUS KOPONG', 'BRIPKA/901102', 'BRIGADIR LANTAS', 'DRIVER', 'PDL TWO TONE'],
  ['14', 'BRIPDA THERESIA INA', 'BRIPDA/980413', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['15', 'BRIPKA ALEXANDER OLA', 'BRIPKA/910219', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['16', 'BRIPDA YOHANA BARE', 'BRIPDA/980821', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['17', 'AIPTU MIKAEL RUA', 'AIPTU/870706', 'BANIT LANTAS', 'WASKAT', 'PDL TWO TONE'],
  ['18', 'BRIPKA DOMINIKUS HAYON', 'BRIPKA/900114', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['19', 'BRIPDA SESILIA NANGA', 'BRIPDA/970505', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['20', 'BRIPDA KORNELIUS WODA', 'BRIPDA/981010', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['21', 'BRIPKA YAKOBUS DIMA', 'BRIPKA/910803', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['22', 'BRIPDA HELENA RUT', 'BRIPDA/990122', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['23', 'RUDOLFUS', 'PENATA MUDA/880901', 'STAF ADMINISTRASI', 'UNDANGAN', 'PDU II'],
  ['24', 'BRIPKA SIMON PETRUS', 'BRIPKA/920612', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE']
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function photoSvg(photo: (typeof DEMO_PHOTOS)[number], variant: number): string {
  const [skyA, skyB, sun, hill, accent] = photo.palette;
  const address = photo.addressLines
    .map((line, index) => `<text x="112" y="${440 + index * 48}" class="address">${escapeXml(line)}</text>`)
    .join('');
  const pedestrians = variant % 2 === 0 ? '#0b1220' : '#111827';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${skyA}"/>
      <stop offset="0.55" stop-color="${skyB}"/>
      <stop offset="1" stop-color="${hill}"/>
    </linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000000" stop-opacity="0.82"/>
      <stop offset="0.58" stop-color="#000000" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="road" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#31363e"/>
      <stop offset="1" stop-color="#10141b"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.75"/>
    </filter>
    <filter id="soft"><feGaussianBlur stdDeviation="8"/></filter>
  </defs>
  <rect width="1600" height="1200" fill="url(#sky)"/>
  <circle cx="1240" cy="260" r="95" fill="${sun}" opacity="0.9" filter="url(#soft)"/>
  <circle cx="1240" cy="260" r="58" fill="${sun}" opacity="0.92"/>
  <path d="M0 620 L230 390 L390 510 L610 330 L870 540 L1080 400 L1340 560 L1600 420 L1600 1200 L0 1200 Z" fill="${hill}" opacity="0.72"/>
  <path d="M0 720 L260 540 L470 670 L700 500 L980 690 L1200 560 L1450 710 L1600 620 L1600 1200 L0 1200 Z" fill="${accent}" opacity="0.22"/>
  <path d="M540 1200 L820 690 L900 690 L1180 1200 Z" fill="url(#road)"/>
  <path d="M860 700 L870 700 L884 760 L858 760 Z" fill="#f8fafc" opacity="0.82"/>
  <path d="M880 810 L896 810 L920 940 L852 940 Z" fill="#f8fafc" opacity="0.55"/>
  <path d="M850 1020 L920 1020 L960 1200 L800 1200 Z" fill="#facc15" opacity="0.55"/>
  <g opacity="0.55" fill="#081016">
    <rect x="300" y="730" width="22" height="220" rx="8"/>
    <circle cx="311" cy="700" r="65" fill="#0b3d2e"/>
    <circle cx="260" cy="730" r="48" fill="#0f5132"/>
    <circle cx="360" cy="738" r="52" fill="#14532d"/>
    <rect x="1250" y="760" width="18" height="190" rx="7"/>
    <circle cx="1259" cy="735" r="55" fill="#14532d"/>
  </g>
  <g fill="${pedestrians}" opacity="0.92">
    <circle cx="1050" cy="815" r="20"/>
    <path d="M1026 845 Q1050 830 1074 845 L1081 940 L1058 952 L1044 884 L1032 952 L1008 940 Z"/>
    <path d="M1081 872 L1135 840 L1142 854 L1090 892 Z"/>
    <circle cx="720" cy="845" r="18"/>
    <path d="M699 872 Q720 859 741 872 L746 960 L727 970 L715 908 L704 970 L684 960 Z"/>
  </g>
  <rect width="1600" height="1200" fill="url(#shade)"/>
  <g filter="url(#shadow)">
    <rect x="64" y="66" width="9" height="500" rx="4" fill="#facc15"/>
    <text x="106" y="108" class="brand">TIMEMARK</text>
    <text x="106" y="270" class="time">${photo.time}</text>
    <text x="112" y="350" class="date">${photo.day}, ${photo.date}</text>
    ${address}
    <text x="112" y="${440 + photo.addressLines.length * 48 + 20}" class="unit">${escapeXml(photo.unit)}</text>
    <text x="112" y="${440 + photo.addressLines.length * 48 + 92}" class="coord">${escapeXml(photo.coordinate)}</text>
    <text x="112" y="1130" class="footer">Dokumentasi kegiatan lapangan · SIGAP</text>
  </g>
  <style>
    .brand { font-family: Arial, Helvetica, sans-serif; font-size: 30px; font-weight: 700; fill: #facc15; letter-spacing: 4px; }
    .time { font-family: Arial, Helvetica, sans-serif; font-size: 150px; font-weight: 700; fill: #ffffff; letter-spacing: 3px; }
    .date { font-family: Arial, Helvetica, sans-serif; font-size: 46px; font-weight: 700; fill: #ffffff; }
    .address { font-family: Arial, Helvetica, sans-serif; font-size: 34px; font-weight: 600; fill: #f8fafc; }
    .unit { font-family: Arial, Helvetica, sans-serif; font-size: 36px; font-weight: 700; fill: #facc15; }
    .coord { font-family: Arial, Helvetica, sans-serif; font-size: 29px; font-weight: 600; fill: #e2e8f0; }
    .footer { font-family: Arial, Helvetica, sans-serif; font-size: 22px; fill: #cbd5e1; letter-spacing: 1px; }
  </style>
</svg>`;
}

async function generateImages(): Promise<string[]> {
  const files: string[] = [];
  for (const [index, photo] of DEMO_PHOTOS.entries()) {
    const target = path.join(paths.demo, photo.file);
    const svg = photoSvg(photo, index);
    await sharp(Buffer.from(svg))
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
      .toFile(target);
    files.push(target);
  }
  return files;
}

function drawPdfTable(doc: PDFKit.PDFDocument, rows: string[][], startY: number): number {
  const columns = [40, 78, 235, 315, 390, 492, 552];
  let y = startY;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#111827');
  const headers = ['NO', 'NAMA', 'PANGKAT/NRP', 'JABATAN', 'PENUGASAN', 'KET'];
  headers.forEach((header, index) => {
    doc.text(header, columns[index], y, { width: (columns[index + 1] ?? 560) - columns[index] - 4 });
  });
  y += 14;
  doc.moveTo(40, y - 2).lineTo(555, y - 2).lineWidth(0.6).strokeColor('#94a3b8').stroke();
  doc.font('Courier').fontSize(7.2).fillColor('#0f172a');
  for (const row of rows) {
    const values = row.slice(0, 6);
    values.forEach((value, index) => {
      doc.text(value, columns[index], y, {
        width: (columns[index + 1] ?? 560) - columns[index] - 4,
        ellipsis: true
      });
    });
    y += 17;
    doc.moveTo(40, y - 4).lineTo(555, y - 4).lineWidth(0.25).strokeColor('#e2e8f0').stroke();
  }
  return y;
}

async function generatePdf(): Promise<string> {
  const target = path.join(paths.demo, 'sprin-1806.pdf');
  const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.font('Helvetica-Bold').fontSize(11).text('KEPOLISIAN NEGARA REPUBLIK INDONESIA', { align: 'center' });
  doc.text('DAERAH NUSA TENGGARA TIMUR', { align: 'center' });
  doc.text('RESOR SIKKA', { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(15).text('SURAT PERINTAH', { align: 'center', underline: true });
  doc.font('Helvetica').fontSize(10).text('Nomor: Sprin/1806/X/KEP./2026', { align: 'center' });
  doc.moveDown(1.2);

  doc.fontSize(9.5);
  doc.font('Helvetica-Bold').text('PERTIMBANGAN:', { continued: false });
  doc.font('Helvetica').text(
    'Bahwa untuk menjamin kelancaran, keamanan, dan ketertiban lalu lintas pada kegiatan pelayanan masyarakat di wilayah hukum Polres Sikka, perlu melaksanakan pengaturan dan pengamanan secara terpadu.'
  );
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text('DASAR:');
  doc.font('Helvetica').text(
    '1. Undang-Undang Nomor 2 Tahun 2002 tentang Kepolisian Negara Republik Indonesia;\n2. Undang-Undang Nomor 22 Tahun 2009 tentang Lalu Lintas dan Angkutan Jalan;\n3. Surat Perintah Kapolda Nusa Tenggara Timur Nomor Sprin/1420/X/KEP./2026 tanggal 2 Oktober 2026.'
  );
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text('KEPADA:');
  doc.font('Helvetica').text('Personel Satuan Lalu Lintas Polres Sikka yang namanya tercantum dalam lampiran surat perintah ini.');
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text('UNTUK:');
  doc.font('Helvetica').text(
    '1. Melaksanakan pengaturan lalu lintas dan pengamanan kegiatan pelayanan masyarakat di Jl. Raya Maumere - Ende, Desa Waioti, Kecamatan Alok Timur, Kabupaten Sikka;\n2. Memberikan pelayanan prima, pengawalan, serta pertolongan kepada masyarakat pengguna jalan;\n3. Melaksanakan koordinasi dengan instansi terkait dan melaporkan hasil kegiatan kepada Kapolres Sikka.'
  );
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text('TEMPAT:');
  doc.font('Helvetica').text('Jl. Raya Maumere - Ende, Desa Waioti, Kec. Alok Timur, Kab. Sikka');
  doc.font('Helvetica').text('Koordinat: 8.619101°S, 122.217334°E');
  doc.font('Helvetica-Bold').text('WAKTU:');
  doc.font('Helvetica').text('Pukul 08.00 WITA sampai dengan selesai');
  doc.font('Helvetica-Bold').text('TANGGAL:');
  doc.font('Helvetica').text('27 Oktober 2026');
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').text('Tembusan:');
  doc.font('Helvetica').text('1. Kapolda Nusa Tenggara Timur;\n2. Waka Polres Sikka;\n3. Arsip.');
  doc.moveDown(2);
  doc.text('Dikeluarkan di: Maumere', { align: 'right' });
  doc.text('Pada tanggal: 26 Oktober 2026', { align: 'right' });
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text('KEPALA KEPOLISIAN RESOR SIKKA', { align: 'right' });
  doc.moveDown(2.2);
  doc.fontSize(10).text('AKBP ANDI PRATAMA, S.I.K., M.H.', { align: 'right' });
  doc.fontSize(8).text('NIP. 19800101 200212 1 001', { align: 'right' });

  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(9).text('LAMPIRAN SURAT PERINTAH NOMOR: SPRIN/1806/X/KEP./2026', { align: 'center' });
  doc.font('Helvetica').fontSize(8).text('TANGGAL: 27 OKTOBER 2026', { align: 'center' });
  doc.moveDown(1);
  let y = drawPdfTable(doc, PERSONNEL.slice(0, 12), doc.y);
  doc.font('Helvetica').fontSize(7).fillColor('#64748b').text('Halaman 2 dari 3', 40, 790, { align: 'center', width: 515 });

  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text('LAMPIRAN SURAT PERINTAH NOMOR: SPRIN/1806/X/KEP./2026 (LANJUTAN)', { align: 'center' });
  doc.font('Helvetica').fontSize(8).text('TANGGAL: 27 OKTOBER 2026', { align: 'center' });
  doc.moveDown(1);
  y = drawPdfTable(doc, PERSONNEL.slice(12), doc.y);
  doc.font('Helvetica').fontSize(7).fillColor('#64748b').text('Halaman 3 dari 3', 40, 790, { align: 'center', width: 515 });

  doc.end();
  const buffer = await finished;
  await fs.writeFile(target, buffer);
  return target;
}

const DOCX_PERSONNEL = PERSONNEL.map((row, index) => [
  row[0],
  index === 6 ? 'BRIPKA YOHANES KIA' : row[1],
  row[2],
  index === 6 ? 'BRIGADIR LANTAS' : row[3],
  row[4],
  row[5]
]);

function docxCell(text: string, bold = false, width = 12): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
      left: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
      right: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' }
    },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, bold, size: 13, font: 'Arial' })]
      })
    ]
  });
}

function personnelTable(rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: ['NO', 'NAMA', 'PANGKAT/NRP', 'JABATAN', 'PENUGASAN', 'KET'].map((header) =>
          docxCell(header, true)
        )
      }),
      ...rows.map((row) => new TableRow({ children: row.map((cell, index) => docxCell(cell, index === 1)) }))
    ]
  });
}

async function generateDocx(): Promise<string> {
  const target = path.join(paths.demo, 'sprin-1833.docx');
  const doc = new Document({
    creator: 'SIGAP',
    title: 'Sprin 1833',
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'KEPOLISIAN NEGARA REPUBLIK INDONESIA', bold: true, size: 22 })]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'DAERAH NUSA TENGGARA TIMUR · RESOR SIKKA', bold: true, size: 20 })]
          }),
          new Paragraph({ alignment: AlignmentType.CENTER, text: '' }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: 'SURAT PERINTAH', bold: true, size: 30 })]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Nomor: Sprin/1833/X/KEP./2026', size: 19 })]
          }),
          new Paragraph({ text: '' }),
          new Paragraph({ children: [new TextRun({ text: 'PERTIMBANGAN:', bold: true })] }),
          new Paragraph(
            'Bahwa untuk mendukung kelancaran kegiatan pengamanan dan pelayanan masyarakat di wilayah Kecamatan Alok, perlu menugaskan personel Satuan Lalu Lintas Polres Sikka secara terkoordinasi.'
          ),
          new Paragraph({ children: [new TextRun({ text: 'DASAR:', bold: true })] }),
          new Paragraph(
            'Undang-Undang Nomor 2 Tahun 2002 tentang Kepolisian Negara Republik Indonesia dan Surat Perintah Kapolda NTT Nomor Sprin/1420/X/KEP./2026.'
          ),
          new Paragraph({ children: [new TextRun({ text: 'KEPADA:', bold: true })] }),
          new Paragraph('Personel Satuan Lalu Lintas Polres Sikka sebagaimana tercantum pada lampiran.'),
          new Paragraph({ children: [new TextRun({ text: 'UNTUK:', bold: true })] }),
          new Paragraph(
            '1. Melaksanakan penjagaan pos lalu lintas pada kegiatan pelayanan masyarakat di Jl. Diponegoro, Kelurahan Kota Uneng, Kecamatan Alok, Kabupaten Sikka;'
          ),
          new Paragraph('2. Melaporkan hasil pelaksanaan tugas kepada Kapolres Sikka.'),
          new Paragraph({ children: [new TextRun({ text: 'TEMPAT:', bold: true })] }),
          new Paragraph('Jl. Diponegoro, Kel. Kota Uneng, Kec. Alok, Kab. Sikka'),
          new Paragraph('Koordinat: 8.621055°S, 122.211156°E'),
          new Paragraph({ children: [new TextRun({ text: 'WAKTU:', bold: true })] }),
          new Paragraph('Pukul 07.00 WITA'),
          new Paragraph({ children: [new TextRun({ text: 'TANGGAL:', bold: true })] }),
          new Paragraph('26 Oktober 2026'),
          new Paragraph({ text: '' }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Dikeluarkan di: Maumere', italics: true })] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Pada tanggal: 25 Oktober 2026', italics: true })] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'KEPALA KEPOLISIAN RESOR SIKKA', bold: true })] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, text: '' }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'AKBP ANDI PRATAMA, S.I.K., M.H.', bold: true })] }),
          new Paragraph({ text: '' }),
          new Paragraph({ children: [new PageBreak()] }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'LAMPIRAN SURAT PERINTAH NOMOR: SPRIN/1833/X/KEP./2026', bold: true })]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'TANGGAL: 26 OKTOBER 2026', size: 18 })]
          }),
          new Paragraph({ text: '' }),
          personnelTable(DOCX_PERSONNEL.slice(0, 12)),
          new Paragraph({ children: [new PageBreak()] }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'LAMPIRAN SURAT PERINTAH NOMOR: SPRIN/1833/X/KEP./2026 (LANJUTAN)', bold: true })]
          }),
          new Paragraph({ text: '' }),
          personnelTable(DOCX_PERSONNEL.slice(12))
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(target, buffer);
  return target;
}

export async function ensureFixtures(): Promise<FixtureSet> {
  await fs.mkdir(paths.demo, { recursive: true });
  const images = DEMO_PHOTOS.map((photo) => path.join(paths.demo, photo.file));
  const pdf = path.join(paths.demo, 'sprin-1806.pdf');
  const docx = path.join(paths.demo, 'sprin-1833.docx');

  const missingImages = images.filter((file) => !existsSync(file));
  if (missingImages.length > 0) await generateImages();
  if (!existsSync(pdf)) await generatePdf();
  if (!existsSync(docx)) await generateDocx();
  return { images, pdf, docx };
}

export const fixtureMetadata = DEMO_PHOTOS;
