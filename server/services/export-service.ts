import ExcelJS from 'exceljs';
import { endOfDay, format, startOfDay } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import type {
  DailyReport,
  LinkDTO,
  SprinDTO,
  TimemarkDTO,
  TurjawaliRecap
} from '../../shared/types.js';
import {
  MATCH_STATUS_LABELS,
  TURJAWALI_LABELS
} from '../../shared/types.js';
import { prisma } from '../lib/prisma.js';
import { serializeLink, serializeSprin, serializeTimemark, type LinkWithSprin, type SprinWithPersonnel, type TimemarkWithSprin } from '../lib/serializers.js';
import { getTurjawaliRecap } from './turjawali-recap-service.js';

export type ExportFormat = 'xlsx' | 'csv' | 'txt';

export interface DailyBundle extends DailyReport {
  personnel: Array<{
    sprinNumber: string;
    no: number;
    name: string;
    rankNrp: string | null;
    jabatan: string | null;
    penugasan: string | null;
    ket: string | null;
    page: number;
  }>;
}

export function reportDate(value?: string | null): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export async function getDailyBundle(dateInput?: string | null): Promise<DailyBundle> {
  const day = reportDate(dateInput);
  const start = startOfDay(day);
  const end = endOfDay(day);

  const [timemarks, links, sprins, turjawali] = await Promise.all([
    prisma.timemarkPhoto.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: {
        sprin: { select: { number: true } },
        matchedPersonnel: { select: { id: true, name: true, rankNrp: true, penugasan: true } }
      },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.linkSubmission.findMany({
      where: { receivedAt: { gte: start, lte: end } },
      include: { sprin: { select: { number: true } } },
      orderBy: { receivedAt: 'asc' }
    }),
    prisma.sprin.findMany({
      where: {
        OR: [
          { activityDate: { gte: start, lte: end } },
          { createdAt: { gte: start, lte: end } }
        ]
      },
      include: {
        _count: { select: { personnel: true, links: true, timemarks: true } },
        personnel: { orderBy: [{ page: 'asc' }, { no: 'asc' }] }
      },
      orderBy: { createdAt: 'asc' }
    }),
    getTurjawaliRecap({ period: 'daily', date: format(day, 'yyyy-MM-dd') })
  ]);

  const timemarkDtos = timemarks.map((row) => serializeTimemark(row as TimemarkWithSprin));
  const linkDtos = links.map((row) => serializeLink(row as LinkWithSprin));
  const sprinDtos = sprins.map((row) => serializeSprin(row as SprinWithPersonnel));

  const personnel = sprins.flatMap((sprin) =>
    sprin.personnel.map((person) => ({
      sprinNumber: sprin.number,
      no: person.no,
      name: person.name,
      rankNrp: person.rankNrp,
      jabatan: person.jabatan,
      penugasan: person.penugasan,
      ket: person.ket,
      page: person.page
    }))
  );

  return {
    date: format(day, 'yyyy-MM-dd'),
    title: format(day, "EEEE, dd MMMM yyyy", { locale: localeId }),
    text: '',
    counts: {
      timemark: timemarkDtos.length,
      links: linkDtos.length,
      sprin: sprinDtos.length,
      personnel: personnel.length
    },
    timemarks: timemarkDtos,
    links: linkDtos,
    sprins: sprinDtos,
    turjawali,
    personnel
  };
}

function waDate(value: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return format(d, 'dd/MM HH:mm');
}

export function buildWaText(bundle: DailyBundle): string {
  const lines: string[] = [];
  lines.push('*SIGAP COMMAND CENTER*');
  lines.push(`*REKAP HARIAN — ${bundle.title.toUpperCase()}*`);
  lines.push('');
  lines.push(`📸 Foto Timemark : *${bundle.counts.timemark}*`);
  lines.push(`📄 Sprin          : *${bundle.counts.sprin}*`);
  lines.push(`🔗 Link Anggota   : *${bundle.counts.links}*`);
  lines.push(`👮 Personel        : *${bundle.counts.personnel}*`);
  lines.push('');

  lines.push('┌──────────────────────');
  lines.push('│ *REKAP TURJAWALI POLANTAS*');
  lines.push('└──────────────────────');
  bundle.turjawali.categories.forEach((category, index) => {
    lines.push(
      `${index + 1}. *${TURJAWALI_LABELS[category.type].toUpperCase()}* — ${category.photoCount} foto (${category.matchedCount} matched / ${category.partialCount} partial / ${category.unmatchedCount} unmatched)`
    );
    lines.push(
      `   👮 Melapor: ${category.personnelReported}${category.personnelAssigned > 0 ? `/${category.personnelAssigned}` : ''} personel`
    );
    if (category.locations[0]) {
      const top = category.locations[0];
      lines.push(
        `   📍 ${top.address}${top.count > 1 ? ` (+${top.count - 1} foto)` : ''}`
      );
    }
  });
  lines.push(
    `✅ Total: ${bundle.turjawali.matchedPhotos} matched · ${bundle.turjawali.partialPhotos} partial · ${bundle.turjawali.unmatchedPhotos} unmatched`
  );
  lines.push(
    `👥 Personel aktif: ${bundle.turjawali.personnel.reported}/${bundle.turjawali.personnel.active} sudah melapor`
  );
  lines.push('──────────────────────');
  lines.push('');

  lines.push('┌──────────────────────');
  lines.push('│ *SUPERVISI PERWIRA*');
  lines.push('└──────────────────────');
  if (bundle.turjawali.supervisions.total === 0) {
    lines.push('_Belum ada supervisi/pengecekan perwira terdeteksi._');
  } else {
    lines.push(
      `👁️ ${bundle.turjawali.supervisions.total} laporan supervisi dari ${bundle.turjawali.supervisions.uniqueOfficers} perwira`
    );
    bundle.turjawali.supervisions.items.slice(0, 10).forEach((item, index) => {
      const who = [item.rank, item.name].filter(Boolean).join(' ') || item.senderName;
      lines.push(
        `${index + 1}. ${item.sandi ? `[${item.sandi}] ` : ''}*${who}* · ${TURJAWALI_LABELS[item.turjawaliType as keyof typeof TURJAWALI_LABELS] ?? item.turjawaliType}`
      );
      if (item.address) lines.push(`   📍 ${item.address}`);
    });
  }
  lines.push('──────────────────────');
  lines.push('');

  lines.push('┌──────────────────────');
  lines.push('│ *FOTO TIMEMARK*');
  lines.push('└──────────────────────');
  if (bundle.timemarks.length === 0) {
    lines.push('_Belum ada foto masuk._');
  } else {
    bundle.timemarks.slice(0, 30).forEach((photo, index) => {
      lines.push(
        `${index + 1}. *${photo.timeText ?? '--:--'}* · ${TURJAWALI_LABELS[photo.turjawaliType]} · ${photo.unitName ?? photo.senderName}`
      );
      if (photo.address) lines.push(`   📍 ${photo.address}`);
      if (photo.coordinateText) lines.push(`   🗺️ ${photo.coordinateText}`);
      lines.push(
        `   👤 ${photo.senderName}${photo.matchedPersonnelName ? ` · ${photo.matchedPersonnelName}` : ''} · ${MATCH_STATUS_LABELS[photo.matchStatus]} ${photo.matchScore}%`
      );
    });
    if (bundle.timemarks.length > 30) lines.push(`_+${bundle.timemarks.length - 30} foto lainnya di dashboard._`);
  }
  lines.push('');

  lines.push('┌──────────────────────');
  lines.push('│ *LINK ANGGOTA*');
  lines.push('└──────────────────────');
  if (bundle.links.length === 0) {
    lines.push('_Belum ada link masuk._');
  } else {
    bundle.links.slice(0, 30).forEach((link, index) => {
      lines.push(`${index + 1}. [${link.platform}] ${link.senderName} — ${waDate(link.receivedAt)}`);
      lines.push(`   ${link.normalizedUrl}`);
    });
    if (bundle.links.length > 30) lines.push(`_+${bundle.links.length - 30} link lainnya di dashboard._`);
  }
  lines.push('');

  lines.push('┌──────────────────────');
  lines.push('│ *SURAT PERINTAH*');
  lines.push('└──────────────────────');
  if (bundle.sprins.length === 0) {
    lines.push('_Tidak ada Sprin pada tanggal ini._');
  } else {
    bundle.sprins.forEach((sprin, index) => {
      lines.push(`${index + 1}. *${sprin.number}*`);
      if (sprin.about) lines.push(`   ${sprin.about.slice(0, 140)}`);
      lines.push(`   👥 ${sprin.personnelCount} personel · ${sprin.reportedLinks} link terkait`);
    });
  }
  lines.push('');
  lines.push('_Dikirim otomatis oleh SIGAP · WhatsApp Bot Listener_');
  return lines.join('\n');
}

export function buildCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const escape = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(/"/g, '""');
    return /[",\n\r]/.test(text) ? `"${text}"` : text;
  };
  return [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\r\n');
}

export function linksCsv(links: LinkDTO[]): string {
  return buildCsv(
    ['No', 'Waktu', 'Nama', 'Nomor WA', 'Grup', 'Platform', 'Kategori', 'URL', 'Status', 'Sprin', 'Keterangan'],
    links.map((link, index) => [
      index + 1,
      format(new Date(link.receivedAt), 'yyyy-MM-dd HH:mm'),
      link.senderName,
      link.senderNumber,
      link.groupName,
      link.platform,
      link.category,
      link.normalizedUrl,
      link.status,
      link.sprinNumber,
      link.title
    ])
  );
}

export function timemarkCsv(items: TimemarkDTO[]): string {
  return buildCsv(
    [
      'No',
      'Waktu Kirim',
      'Jam Giat',
      'Tanggal Giat',
      'Satuan',
      'Alamat',
      'Desa/Kelurahan',
      'Kecamatan',
      'Kabupaten',
      'Provinsi',
      'Koordinat',
      'Latitude',
      'Longitude',
      'Pengirim',
      'Nomor WA',
      'Grup',
      'Turjawali',
      'Status Matching',
      'Skor Matching',
      'Personel Cocok',
      'Sprin',
      'Caption WA',
      'Catatan Match',
      'Confidence',
      'Status'
    ],
    items.map((item, index) => [
      index + 1,
      format(new Date(item.createdAt), 'yyyy-MM-dd HH:mm'),
      item.timeText,
      item.dateText,
      item.unitName,
      item.address,
      item.village,
      item.district,
      item.regency,
      item.province,
      item.coordinateText,
      item.latitude,
      item.longitude,
      item.senderName,
      item.senderNumber,
      item.groupName,
      TURJAWALI_LABELS[item.turjawaliType],
      MATCH_STATUS_LABELS[item.matchStatus],
      item.matchScore,
      item.matchedPersonnelName,
      item.sprinNumber,
      item.senderCaption,
      item.matchNotes,
      item.confidence,
      item.status
    ])
  );
}

export function turjawaliCsv(turjawali: TurjawaliRecap): string {
  return buildCsv(
    [
      'Kategori',
      'Jumlah Foto',
      'Matched',
      'Partial',
      'Unmatched',
      'Personel Melapor',
      'Personel Ditugaskan',
      'Lokasi Teratas'
    ],
    turjawali.categories.map((category) => [
      TURJAWALI_LABELS[category.type],
      category.photoCount,
      category.matchedCount,
      category.partialCount,
      category.unmatchedCount,
      category.personnelReported,
      category.personnelAssigned,
      category.locations.map((location) => `${location.address} (${location.count})`).join(' | ')
    ])
  );
}

export function sprinCsv(bundle: DailyBundle): string {
  return buildCsv(
    [
      'Nomor Sprin',
      'Turjawali',
      'Perihal',
      'Tanggal Giat',
      'Tempat',
      'No',
      'Nama',
      'Pangkat/NRP',
      'Jabatan',
      'Penugasan',
      'KET',
      'Halaman'
    ],
    bundle.personnel.map((person) => [
      person.sprinNumber,
      TURJAWALI_LABELS[
        bundle.sprins.find((sprin) => sprin.number === person.sprinNumber)?.turjawaliType ??
          'LAINNYA'
      ],
      bundle.sprins.find((sprin) => sprin.number === person.sprinNumber)?.about,
      bundle.sprins.find((sprin) => sprin.number === person.sprinNumber)?.activityDate,
      bundle.sprins.find((sprin) => sprin.number === person.sprinNumber)?.place,
      person.no,
      person.name,
      person.rankNrp,
      person.jabatan,
      person.penugasan,
      person.ket,
      person.page
    ])
  );
}

function styleSheet(sheet: ExcelJS.Worksheet): void {
  const header = sheet.getRow(1);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF0B1220' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFACC15' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });
  header.height = 24;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
}

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  widths: number[]
): void {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = headers.map((header, index) => ({
    header,
    key: `col${index}`,
    width: widths[index] ?? 18
  }));
  rows.forEach((row) => sheet.addRow(row));
  styleSheet(sheet);
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.font = { size: 9, ...(cell.font ?? {}) };
    });
  });
}

export async function buildDailyXlsx(bundle: DailyBundle): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIGAP Command Center';
  workbook.created = new Date();

  const summary = workbook.addWorksheet('Ringkasan');
  summary.columns = [
    { header: 'Metrik', key: 'metric', width: 34 },
    { header: 'Nilai', key: 'value', width: 26 }
  ];
  summary.addRows([
    ['Tanggal Rekap', bundle.title],
    ['Foto Timemark', bundle.counts.timemark],
    ['Turjawali Matched', bundle.turjawali.matchedPhotos],
    ['Turjawali Partial', bundle.turjawali.partialPhotos],
    ['Turjawali Unmatched', bundle.turjawali.unmatchedPhotos],
    ['Personel Melapor', `${bundle.turjawali.personnel.reported}/${bundle.turjawali.personnel.active}`],
    ['Sprin Terkait', bundle.counts.sprin],
    ['Link Anggota', bundle.counts.links],
    ['Personel Terlibat', bundle.counts.personnel],
    ['Digenerate', new Date().toLocaleString('id-ID')]
  ]);
  styleSheet(summary);
  summary.getColumn(1).font = { bold: true };

  addSheet(
    workbook,
    'Rekap Turjawali',
    [
      'Kategori',
      'Jumlah Foto',
      'Matched',
      'Partial',
      'Unmatched',
      'Personel Melapor',
      'Personel Ditugaskan',
      'Lokasi Teratas'
    ],
    bundle.turjawali.categories.map((category) => [
      TURJAWALI_LABELS[category.type],
      category.photoCount,
      category.matchedCount,
      category.partialCount,
      category.unmatchedCount,
      category.personnelReported,
      category.personnelAssigned,
      category.locations.map((location) => `${location.address} (${location.count})`).join(' | ')
    ]),
    [28, 11, 10, 9, 10, 17, 19, 64]
  );

  addSheet(
    workbook,
    'Personel Turjawali',
    ['Nama', 'Pangkat/NRP', 'Jabatan', 'Penugasan', 'Sprin', 'Status Laporan', 'Jumlah Foto', 'Kategori', 'Terakhir Melapor'],
    bundle.turjawali.personnel.details.map((person) => [
      person.name,
      person.rankNrp,
      person.jabatan,
      person.penugasan,
      person.sprinNumber,
      person.reported ? 'Sudah melapor' : 'Belum melapor',
      person.photoCount,
      person.turjawaliTypes.map((type) => TURJAWALI_LABELS[type]).join(', '),
      person.lastReportAt ? format(new Date(person.lastReportAt), 'dd/MM/yyyy HH:mm') : null
    ]),
    [30, 20, 26, 16, 28, 16, 10, 34, 18]
  );

  addSheet(
    workbook,
    'Supervisi Perwira',
    ['No', 'Sandi', 'Pangkat', 'Nama Perwira', 'Kategori', 'Alamat', 'Waktu Foto', 'Pengirim', 'No WA'],
    bundle.turjawali.supervisions.items.map((item, index) => [
      index + 1,
      item.sandi,
      item.rank,
      item.name,
      TURJAWALI_LABELS[item.turjawaliType as keyof typeof TURJAWALI_LABELS] ?? item.turjawaliType,
      item.address,
      item.capturedAt ? format(new Date(item.capturedAt), 'dd/MM/yyyy HH:mm') : null,
      item.senderName,
      item.senderNumber
    ]),
    [6, 12, 10, 32, 18, 50, 18, 24, 16]
  );

  addSheet(
    workbook,
    'Foto Timemark',
    [
      'No',
      'Waktu',
      'Jam',
      'Tanggal',
      'Turjawali',
      'Match',
      'Skor',
      'Personel Cocok',
      'Satuan',
      'Alamat',
      'Koordinat',
      'Lat/Lng',
      'Pengirim',
      'WA',
      'Caption',
      'Supervisi',
      'Sandi',
      'Confidence',
      'Status'
    ],
    bundle.timemarks.map((item, index) => [
      index + 1,
      format(new Date(item.createdAt), 'dd/MM/yyyy HH:mm'),
      item.timeText,
      item.dateText,
      TURJAWALI_LABELS[item.turjawaliType],
      MATCH_STATUS_LABELS[item.matchStatus],
      item.matchScore,
      item.matchedPersonnelName,
      item.unitName,
      item.address,
      item.coordinateText,
      item.latitude !== null && item.longitude !== null ? `${item.latitude}, ${item.longitude}` : null,
      item.senderName,
      item.senderNumber,
      item.senderCaption,
      item.isSupervision ? 'Ya' : 'Tidak',
      item.supervisorSandi,
      item.confidence,
      item.status
    ]),
    [5, 16, 8, 16, 24, 11, 7, 26, 30, 48, 26, 22, 22, 16, 44, 10, 10, 11, 11]
  );

  addSheet(
    workbook,
    'Surat Perintah',
    ['Nomor Sprin', 'Turjawali', 'Perihal', 'Tanggal', 'Waktu', 'Tempat', 'Penandatangan', 'Personel', 'Link', 'Status'],
    bundle.sprins.map((sprin) => [
      sprin.number,
      TURJAWALI_LABELS[sprin.turjawaliType],
      sprin.about,
      sprin.activityDate ? format(new Date(sprin.activityDate), 'dd/MM/yyyy') : null,
      sprin.timeText,
      sprin.place,
      [sprin.signatoryRank, sprin.signatory].filter(Boolean).join(' '),
      sprin.personnelCount,
      sprin.reportedLinks,
      sprin.status
    ]),
    [28, 24, 52, 12, 9, 28, 32, 10, 8, 12]
  );

  addSheet(
    workbook,
    'Personel',
    ['No', 'Nama', 'Pangkat/NRP', 'Jabatan', 'Penugasan', 'KET', 'Hal.', 'Sprin'],
    bundle.personnel.map((person) => [
      person.no,
      person.name,
      person.rankNrp,
      person.jabatan,
      person.penugasan,
      person.ket,
      person.page,
      person.sprinNumber
    ]),
    [6, 30, 20, 28, 16, 20, 7, 28]
  );

  addSheet(
    workbook,
    'Link Anggota',
    ['No', 'Waktu', 'Nama', 'Nomor WA', 'Grup', 'Platform', 'Kategori', 'URL', 'Status', 'Sprin'],
    bundle.links.map((link, index) => [
      index + 1,
      format(new Date(link.receivedAt), 'dd/MM/yyyy HH:mm'),
      link.senderName,
      link.senderNumber,
      link.groupName,
      link.platform,
      link.category,
      link.normalizedUrl,
      link.status,
      link.sprinNumber
    ]),
    [5, 16, 24, 18, 26, 16, 18, 52, 12, 26]
  );

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
