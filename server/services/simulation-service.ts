import path from 'node:path';
import fs from 'node:fs/promises';
import { ensureFixtures } from '../../scripts/fixture-generator.js';
import { ingestTimemark } from './timemark-service.js';
import { ingestSprin } from './sprin-service.js';
import { ingestLinks } from './link-service.js';
import type { SimulateKind, SimulatePayload } from '../../shared/types.js';
import { recordActivity } from '../lib/activity.js';

const SENDERS = [
  { name: 'Bripka Marthen Lawe', number: '6281298765432', group: 'Satlantas Polres Sikka' },
  { name: 'Bripda Agustina Lopes', number: '6281355566677', group: 'SIGAP · Grup Laporan Harian' },
  { name: 'Aipda Petrus Bala', number: '6281177788899', group: 'Personel Giat Pengamanan' },
  { name: 'Bripda Rikardus Lewar', number: '6281222233344', group: 'SIGAP · Grup Laporan Harian' }
];

const DEMO_LINKS = [
  {
    platform: 'Instagram',
    url: 'https://www.instagram.com/reel/SimulasiSIGAP/',
    title: 'Simulasi laporan Instagram · Sprin/1806/X/KEP./2026'
  },
  {
    platform: 'TikTok',
    url: 'https://www.tiktok.com/@sigap.sikka/video/7412345678901234567',
    title: 'Simulasi laporan TikTok · Sprin/1833/X/KEP./2026'
  },
  {
    platform: 'YouTube',
    url: 'https://youtu.be/aqz-KE-bpKQ?t=10',
    title: 'Simulasi laporan YouTube · Sprin/1806/X/KEP./2026'
  },
  {
    platform: 'Google Drive',
    url: 'https://drive.google.com/drive/folders/1SimulasiSIGAP',
    title: 'Simulasi folder dokumentasi · Sprin/1833/X/KEP./2026'
  }
];

export interface SimulationResult {
  kind: SimulateKind;
  message: string;
  data: unknown;
}

export async function simulateIncoming(payload: SimulatePayload): Promise<SimulationResult> {
  const fixtures = await ensureFixtures();
  const sender = SENDERS[Math.floor(Math.random() * SENDERS.length)]!;
  const senderName = payload.senderName ?? sender.name;
  const senderNumber = payload.senderNumber ?? sender.number;
  const groupName = payload.groupName ?? sender.group;
  const messageId = `sim-${payload.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  if (payload.kind === 'image') {
    const index = Math.floor(Math.random() * fixtures.images.length);
    const file = fixtures.images[index]!;
    const buffer = await fs.readFile(file);
    const item = await ingestTimemark({
      buffer,
      filename: path.basename(file),
      mimeType: 'image/jpeg',
      senderName,
      senderNumber,
      groupName,
      caption: 'Simulasi pesan foto Timemark masuk.',
      source: 'simulation',
      messageId
    });
    return {
      kind: payload.kind,
      message: `Foto Timemark diproses (${item.timeText ?? 'review'} · confidence ${item.confidence}%).`,
      data: item
    };
  }

  if (payload.kind === 'document') {
    const usePdf = Math.random() > 0.5;
    const file = usePdf ? fixtures.pdf : fixtures.docx;
    const buffer = await fs.readFile(file);
    const result = await ingestSprin({
      buffer,
      filename: path.basename(file),
      mimeType: usePdf
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      source: 'simulation',
      senderName,
      senderNumber
    });
    return {
      kind: payload.kind,
      message: `Dokumen Sprin ${result.sprin.number} diproses · ${result.sprin.personnelCount} personel.`,
      data: result
    };
  }

  const demo = DEMO_LINKS[Math.floor(Math.random() * DEMO_LINKS.length)]!;
  const uniqueUrl = `${demo.url}?sim=${Date.now()}`;
  const text = `${demo.title}\n${uniqueUrl}`;
  const links = await ingestLinks({
    text,
    senderName,
    senderNumber,
    groupName,
    messageId,
    source: 'simulation'
  });
  await recordActivity({
    type: 'simulation',
    title: 'Simulasi pesan tautan diproses',
    description: `${senderName} · ${links.length} link`,
    actor: 'Dashboard'
  });
  return {
    kind: payload.kind,
    message: `${links.length} link ${demo.platform} berhasil direkap dan divalidasi di latar belakang.`,
    data: links
  };
}
