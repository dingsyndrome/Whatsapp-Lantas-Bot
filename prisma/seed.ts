import { addMinutes, format, subHours, subMinutes } from 'date-fns';
import { prisma } from '../server/lib/prisma.js';
import { ensureRuntimeDirectories } from '../server/config.js';
import { parseTimemarkText } from '../server/services/ocr/timemark-parser.js';
import { matchTurjawali } from '../server/services/ocr/turjawali-matcher.js';
import { ingestSprin } from '../server/services/sprin-service.js';
import {
  DEFAULT_AUTO_REPLY,
  DEFAULT_DOCUMENT_PROMPT,
  DEFAULT_SPRIN_NOTIFY_TEMPLATE,
  DEFAULT_TIMEMARK_PROMPT,
  DEFAULT_TURJAWALI_KEYWORDS
} from '../shared/types.js';
import { ensureFixtures } from '../scripts/fixture-generator.js';
import fs from 'node:fs/promises';

ensureRuntimeDirectories();
const fixtures = await ensureFixtures();

const now = new Date();

const groups = [
  { jid: '120363000000001@g.us', name: 'SIGAP · Grup Laporan Harian' },
  { jid: '120363000000002@g.us', name: 'Satlantas Polres Sikka' },
  { jid: '120363000000003@g.us', name: 'Personel Giat Pengamanan' }
];

for (const group of groups) {
  await prisma.monitoredGroup.upsert({
    where: { jid: group.jid },
    create: { ...group, active: true },
    update: { name: group.name, active: true }
  });
}

await prisma.botConfig.upsert({
  where: { id: 'singleton' },
  create: {
    id: 'singleton',
    botName: 'SIGAP Command Center',
    waDriver: 'mock',
    autoReplyEnabled: true,
    autoReplyTemplate: DEFAULT_AUTO_REPLY,
    timemarkPrompt: DEFAULT_TIMEMARK_PROMPT,
    documentPrompt: DEFAULT_DOCUMENT_PROMPT,
    aiEnabled: false,
    aiBaseUrl: 'https://api.openai.com/v1',
    aiModel: 'gpt-4o-mini',
    scheduleEnabled: false,
    scheduleTime: '17:00',
    scheduleTimezone: 'Asia/Jakarta',
    scheduleGroupJid: groups[0]!.jid,
    scheduleGroupName: groups[0]!.name,
    minOcrConfidence: 35,
    turjawaliMatchingEnabled: true,
    turjawaliKeywords: JSON.stringify(DEFAULT_TURJAWALI_KEYWORDS),
    gaturMorningStart: '06:00',
    gaturMorningEnd: '08:00',
    gaturEveningStart: '16:00',
    gaturEveningEnd: '17:30',
    patrolNightStart: '21:00',
    patrolNightEnd: '04:00',
    matchTimeToleranceMinutes: 60,
    matchLocationRadiusMeters: 500,
    sprinNotifyMode: 'review',
    sprinNotifyDefaultFunctions: JSON.stringify(['SATLANTAS']),
    sprinNotifyExcludePerwira: true,
    sprinNotifyTemplate: DEFAULT_SPRIN_NOTIFY_TEMPLATE
  },
  update: {
    botName: 'SIGAP Command Center',
    waDriver: 'mock',
    autoReplyEnabled: true,
    autoReplyTemplate: DEFAULT_AUTO_REPLY,
    timemarkPrompt: DEFAULT_TIMEMARK_PROMPT,
    documentPrompt: DEFAULT_DOCUMENT_PROMPT,
    scheduleGroupJid: groups[0]!.jid,
    scheduleGroupName: groups[0]!.name,
    turjawaliMatchingEnabled: true,
    turjawaliKeywords: JSON.stringify(DEFAULT_TURJAWALI_KEYWORDS),
    gaturMorningStart: '06:00',
    gaturMorningEnd: '08:00',
    gaturEveningStart: '16:00',
    gaturEveningEnd: '17:30',
    patrolNightStart: '21:00',
    patrolNightEnd: '04:00',
    matchTimeToleranceMinutes: 60,
    matchLocationRadiusMeters: 500,
    sprinNotifyMode: 'review',
    sprinNotifyDefaultFunctions: JSON.stringify(['SATLANTAS']),
    sprinNotifyExcludePerwira: true,
    sprinNotifyTemplate: DEFAULT_SPRIN_NOTIFY_TEMPLATE
  }
});

await prisma.notificationFunction.upsert({
  where: { code: 'SATLANTAS' },
  create: {
    code: 'SATLANTAS',
    name: 'Satlantas',
    keywords: JSON.stringify(['SATLANTAS', 'TURJAGWALI', 'REGIDENT', 'KAMSEL', 'GAKKUM', 'PATWAL']),
    excludePerwira: true,
    active: true,
    sortOrder: 10
  },
  update: {}
});

await prisma.whatsAppSession.upsert({
  where: { id: 'runtime' },
  create: { id: 'runtime', status: 'mock', driver: 'mock' },
  update: { status: 'mock', driver: 'mock', lastError: null, phone: null, pushName: null }
});

const pdfBuffer = await fs.readFile(fixtures.pdf);
const docxBuffer = await fs.readFile(fixtures.docx);
const sprinPdf = await ingestSprin({
  buffer: pdfBuffer,
  filename: 'Sprin-1806-Pengaturan-Lalu-Lintas.pdf',
  mimeType: 'application/pdf',
  source: 'seed',
  senderName: 'Bagian Ops Polres Sikka',
  senderNumber: '6281234567890'
});
const sprinDocx = await ingestSprin({
  buffer: docxBuffer,
  filename: 'Sprin-1833-Pengamanan-Kegiatan.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  source: 'seed',
  senderName: 'Bagian Ops Polres Sikka',
  senderNumber: '6281234567890'
});

const timemarkSeeds = [
  {
    messageId: 'seed-timemark-1',
    image: fixtures.images[0]!,
    senderName: 'Bripka Marthen Lawe',
    senderNumber: '6281298765432',
    groupName: 'Satlantas Polres Sikka',
    caption: 'Izin komandan, melaporkan giat gatur pagi simpang TKK Bhayangkari Polres, situasi lancar.',
    raw: `TIMEMARK
08:43
Selasa, 27/10/2026
Jl. Raya Maumere - Ende, Desa Waioti,
Kec. Alok Timur, Kab. Sikka,
Nusa Tenggara Timur
Satlantas Polres Sikka
8.619101°S, 122.217334°E`,
    engineConfidence: 94,
    sprinNumber: 'Sprin/1806/X/KEP./2026'
  },
  {
    messageId: 'seed-timemark-2',
    image: fixtures.images[1]!,
    senderName: 'Bripda Agustina Lopes',
    senderNumber: '6281355566677',
    groupName: 'SIGAP · Grup Laporan Harian',
    caption: 'Laporan penjagaan pos lantas depan Mako Polres Sikka, situasi aman.',
    raw: `TIMEMARK
07:10
Senin, 26/10/2026
Jl. Diponegoro No. 12, Kel. Kota Uneng,
Kec. Alok, Kab. Sikka,
Nusa Tenggara Timur
Satuan Lalu Lintas Polres Sikka
8.621055°S, 122.211156°E`,
    engineConfidence: 95,
    sprinNumber: 'Sprin/1833/X/KEP./2026'
  },
  {
    messageId: 'seed-timemark-3',
    image: fixtures.images[2]!,
    senderName: 'Bripda Rikardus Lewar',
    senderNumber: '6281222233344',
    groupName: 'Personel Giat Pengamanan',
    caption: 'Patroli blue light patrol rawan laka Jl. Soekarno-Hatta, situasi lancar.',
    raw: `TIMEMARK
06:47
Minggu, 04/10/2026
Jl. Soekarno-Hatta, Kel. Madawat,
Kec. Alok, Kab. Sikka,
Nusa Tenggara Timur
Regu Pengatur Satlantas Polres Sikka
8.615470°S, 122.220911°E`,
    engineConfidence: 94,
    sprinNumber: null
  },
  {
    messageId: 'seed-timemark-4',
    image: fixtures.images[3]!,
    senderName: 'Aipda Petrus Bala',
    senderNumber: '6281177788899',
    groupName: 'SIGAP · Grup Laporan Harian',
    caption: 'Pengawalan konvoi VVIP menuju Maumere, situasi kondusif.',
    raw: `TIMEMARK
09:15
Selasa, 27/10/2026
Jl. El Tari, Kel. Beru, Kec. Alok Timur,
Kab. Sikka, Nusa Tenggara Timur
Satuan Sabhara Polres Sikka
8.612874°S, 122.226451°E`,
    engineConfidence: 94,
    sprinNumber: 'Sprin/1806/X/KEP./2026'
  }
];

for (const [index, item] of timemarkSeeds.entries()) {
  const parsed = parseTimemarkText(item.raw, item.engineConfidence);
  const relativeImage = `demo/${item.image.split(/[\\/]/).pop()}`;
  const capturedAt = parsed.capturedAt ?? subHours(now, 2);
  const reportReceivedAt = subMinutes(now, 45 + index * 17);
  const match = await matchTurjawali({
    ocr: parsed,
    senderName: item.senderName,
    senderNumber: item.senderNumber,
    caption: item.caption,
    receivedAt: reportReceivedAt
  });
  await prisma.timemarkPhoto.upsert({
    where: { messageId: item.messageId },
    create: {
      messageId: item.messageId,
      source: 'seed',
      senderName: item.senderName,
      senderNumber: item.senderNumber,
      groupName: item.groupName,
      imagePath: relativeImage,
      thumbnailPath: relativeImage,
      mimeType: 'image/jpeg',
      caption: item.caption,
      senderCaption: item.caption,
      capturedAt,
      timeText: parsed.timeText,
      dateText: parsed.dateText,
      address: parsed.address,
      village: parsed.village,
      district: parsed.district,
      regency: parsed.regency,
      province: parsed.province,
      unitName: parsed.unitName,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      coordinateText: parsed.coordinateText,
      rawText: parsed.rawText,
      confidence: parsed.confidence,
      aiUsed: false,
      status: 'parsed',
      turjawaliType: match.classification.type,
      matchStatus: match.matchStatus,
      matchScore: match.matchScore,
      matchedPersonnelId: match.matchedPersonnelId,
      matchNotes: match.matchNotes,
      sprinId: match.sprinId,
      createdAt: reportReceivedAt
    },
    update: {
      senderName: item.senderName,
      senderNumber: item.senderNumber,
      groupName: item.groupName,
      imagePath: relativeImage,
      thumbnailPath: relativeImage,
      caption: item.caption,
      senderCaption: item.caption,
      capturedAt,
      timeText: parsed.timeText,
      dateText: parsed.dateText,
      address: parsed.address,
      village: parsed.village,
      district: parsed.district,
      regency: parsed.regency,
      province: parsed.province,
      unitName: parsed.unitName,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      coordinateText: parsed.coordinateText,
      rawText: parsed.rawText,
      confidence: parsed.confidence,
      status: 'parsed',
      turjawaliType: match.classification.type,
      matchStatus: match.matchStatus,
      matchScore: match.matchScore,
      matchedPersonnelId: match.matchedPersonnelId,
      matchNotes: match.matchNotes,
      sprinId: match.sprinId,
      createdAt: reportReceivedAt
    }
  });
  console.log(
    `  · ${item.senderName}: ${match.classification.type} / ${match.matchStatus} / ${match.matchScore}%`
  );
}

await prisma.linkSubmission.deleteMany({ where: { messageId: { startsWith: 'seed-link-' } } });

const linkSeeds = [
  {
    senderName: 'Bripka Marthen Lawe',
    senderNumber: '6281298765432',
    platform: 'Instagram',
    category: 'Media Sosial',
    url: 'https://www.instagram.com/reel/C7DemoSikka/',
    title: 'Dokumentasi pengaturan lalu lintas pagi · Sprin/1806/X/KEP./2026',
    status: 'valid',
    httpStatus: 200,
    minutesAgo: 12,
    sprinNumber: 'Sprin/1806/X/KEP./2026'
  },
  {
    senderName: 'Bripda Agustina Lopes',
    senderNumber: '6281355566677',
    platform: 'TikTok',
    category: 'Media Sosial',
    url: 'https://www.tiktok.com/@sigap.sikka/video/7412345678901234567',
    title: 'Giat pengaturan simpang Kota Uneng',
    status: 'valid',
    httpStatus: 200,
    minutesAgo: 28,
    sprinNumber: 'Sprin/1833/X/KEP./2026'
  },
  {
    senderName: 'Bripka Ronaldo Da Costa',
    senderNumber: '6281276543210',
    platform: 'Facebook',
    category: 'Media Sosial',
    url: 'https://www.facebook.com/satlantas.sikka/posts/1234567890',
    title: 'Pelayanan masyarakat di Jl. Raya Maumere - Ende',
    status: 'restricted',
    httpStatus: 403,
    minutesAgo: 47,
    sprinNumber: 'Sprin/1806/X/KEP./2026'
  },
  {
    senderName: 'Bripda Maria Goreti',
    senderNumber: '6281388899900',
    platform: 'YouTube',
    category: 'Media Sosial',
    url: 'https://youtu.be/aqz-KE-bpKQ',
    title: 'Video giat pengaturan lalu lintas Satlantas Sikka',
    status: 'valid',
    httpStatus: 200,
    minutesAgo: 63,
    sprinNumber: 'Sprin/1806/X/KEP./2026'
  },
  {
    senderName: 'Aipda Petrus Bala',
    senderNumber: '6281177788899',
    platform: 'Google Drive',
    category: 'Penyimpanan',
    url: 'https://drive.google.com/drive/folders/1DemoSikkaDocuments',
    title: 'Folder dokumentasi kegiatan dan absensi personel',
    status: 'valid',
    httpStatus: 200,
    minutesAgo: 95,
    sprinNumber: 'Sprin/1833/X/KEP./2026'
  },
  {
    senderName: 'Bripka Yosef Tanga',
    senderNumber: '6281255544433',
    platform: 'X / Twitter',
    category: 'Media Sosial',
    url: 'https://x.com/satlantas_sikka/status/1234567890123456789',
    title: 'Thread laporan pengaturan lalu lintas',
    status: 'unchecked',
    httpStatus: null,
    minutesAgo: 130,
    sprinNumber: 'Sprin/1806/X/KEP./2026'
  },
  {
    senderName: 'Bripda Theresia Ina',
    senderNumber: '6281366677788',
    platform: 'Portal Berita',
    category: 'Berita',
    url: 'https://www.antaranews.com/berita/1234567/satlantas-sikka-atur-lalu-lintas',
    title: 'Berita kegiatan Satlantas Polres Sikka',
    status: 'valid',
    httpStatus: 200,
    minutesAgo: 160,
    sprinNumber: 'Sprin/1833/X/KEP./2026'
  },
  {
    senderName: 'Bripda Kornelius Woda',
    senderNumber: '6281399900011',
    platform: 'Google Maps',
    category: 'Lokasi',
    url: 'https://maps.app.goo.gl/DemoSikkaMap',
    title: 'Titik lokasi kegiatan pengaturan',
    status: 'valid',
    httpStatus: 200,
    minutesAgo: 210,
    sprinNumber: 'Sprin/1806/X/KEP./2026'
  }
];

const sprinRecords = await prisma.sprin.findMany({ select: { id: true, number: true } });
for (const [index, link] of linkSeeds.entries()) {
  const sprin = link.sprinNumber
    ? sprinRecords.find((record) => record.number === link.sprinNumber)
    : null;
  const receivedAt = subMinutes(now, link.minutesAgo);
  await prisma.linkSubmission.create({
    data: {
      messageId: `seed-link-${index + 1}`,
      senderName: link.senderName,
      senderNumber: link.senderNumber,
      groupName: 'SIGAP · Grup Laporan Harian',
      url: link.url,
      normalizedUrl: link.url,
      platform: link.platform,
      category: link.category,
      title: link.title,
      receivedAt,
      status: link.status,
      httpStatus: link.httpStatus,
      verifiedAt: link.status === 'unchecked' ? null : subMinutes(now, link.minutesAgo - 2),
      sprinId: sprin?.id ?? null
    }
  });
}

await prisma.activity.deleteMany();
const activitySeeds = [
  {
    type: 'timemark',
    title: 'Foto Timemark berhasil diverifikasi',
    description: 'Satlantas Polres Sikka · 08:43 · Jl. Raya Maumere - Ende',
    actor: 'Bripka Marthen Lawe',
    minutesAgo: 12
  },
  {
    type: 'link',
    title: '3 link anggota terekap',
    description: 'Bripka Marthen Lawe · Instagram, TikTok',
    actor: 'Bripka Marthen Lawe',
    minutesAgo: 14
  },
  {
    type: 'sprin',
    title: 'Surat Perintah baru diproses',
    description: 'Sprin/1806/X/KEP./2026 · 24 personel',
    actor: 'Bagian Ops Polres Sikka',
    minutesAgo: 48
  },
  {
    type: 'wa_connected',
    title: 'Bot WhatsApp aktif (mode simulasi)',
    description: 'Listener siap menerima pesan gambar, dokumen, dan tautan.',
    actor: 'SIGAP',
    minutesAgo: 170
  },
  {
    type: 'report',
    title: 'Rekap harian berhasil dibuat',
    description: 'Ringkasan harian siap dikirim ke grup laporan.',
    actor: 'Scheduler',
    minutesAgo: 300
  },
  {
    type: 'link',
    title: 'Link portal berita terekap',
    description: 'Bripda Theresia Ina · Portal Berita',
    actor: 'Bripda Theresia Ina',
    minutesAgo: 320
  }
];

for (const seed of activitySeeds) {
  await prisma.activity.create({
    data: {
      type: seed.type,
      title: seed.title,
      description: seed.description,
      actor: seed.actor,
      metadata: '{}',
      createdAt: subMinutes(now, seed.minutesAgo)
    }
  });
}

const [photoCount, linkCount, personnelCount] = await Promise.all([
  prisma.timemarkPhoto.count(),
  prisma.linkSubmission.count(),
  prisma.sprinPersonnel.count()
]);

console.log(
  `Seed selesai: ${photoCount} foto, ${linkCount} link, ${sprinPdf.sprin.personnelCount + sprinDocx.sprin.personnelCount} baris personel (${personnelCount} total), 2 Sprin.`
);
console.log(`Tanggal seed: ${format(addMinutes(now, 0), 'yyyy-MM-dd HH:mm')}`);

await prisma.$disconnect();
