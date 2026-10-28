import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import PQueue from 'p-queue';
import WAWebJS from 'whatsapp-web.js';
import type { AvailableGroup, WhatsAppStatusDTO, WhatsAppStatusValue } from '../../shared/types.js';
import { TURJAWALI_LABELS } from '../../shared/types.js';
import { config, paths } from '../config.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { realtime } from '../lib/realtime.js';
import { recordActivity } from '../lib/activity.js';
import { ensureWhatsAppSessionRow, getBotConfig, isGroupMonitored } from './settings.js';
import { ingestTimemark } from './timemark-service.js';
import { ingestSprin } from './sprin-service.js';
import { ingestLinks } from './link-service.js';

const { Client, LocalAuth } = WAWebJS;
const messageQueue = new PQueue({ concurrency: 2 });

function resolveExecutablePath(): string | undefined {
  if (config.puppeteerExecutablePath) return config.puppeteerExecutablePath;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function normalizePhone(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/@c\.us$/i, '')
    .replace(/@g\.us$/i, '')
    .replace(/@s\.whatsapp\.net$/i, '')
    .replace(/\D/g, '');
}

function statusColor(): { dark: string; light: string } {
  return { dark: '#facc15', light: '#111827' };
}

export class WhatsAppManager {
  private client: WAWebJS.Client | null = null;
  private qrDataUrl: string | null = null;
  private statusValue: WhatsAppStatusValue = 'disconnected';
  private phone: string | null = null;
  private pushName: string | null = null;
  private lastConnectedAt: Date | null = null;
  private lastError: string | null = null;
  private qrGeneratedAt: Date | null = null;
  private starting = false;

  async initialize(): Promise<void> {
    const session = await ensureWhatsAppSessionRow();
    const bot = await getBotConfig();
    this.statusValue = bot.waDriver === 'webjs' ? 'disconnected' : 'mock';
    this.phone = session.phone;
    this.pushName = session.pushName;
    this.lastConnectedAt = session.lastConnectedAt;
    this.lastError = session.lastError;
    await this.persistStatus(bot.waDriver === 'webjs' ? 'disconnected' : 'mock', bot.waDriver);
    if (bot.waDriver === 'webjs') {
      await this.connect();
    }
  }

  get isMock(): boolean {
    return this.statusValue === 'mock';
  }

  getStatus(): WhatsAppStatusDTO {
    return {
      status: this.statusValue,
      driver: this.isMock ? 'mock' : 'webjs',
      phone: this.phone,
      pushName: this.pushName,
      lastConnectedAt: this.lastConnectedAt?.toISOString() ?? null,
      lastError: this.lastError,
      qrDataUrl: this.qrDataUrl,
      qrGeneratedAt: this.qrGeneratedAt?.toISOString() ?? null,
      isMock: this.isMock
    };
  }

  async reflectConfig(): Promise<WhatsAppStatusDTO> {
    const bot = await getBotConfig();
    if (bot.waDriver === 'mock') {
      await this.stopClient();
      this.statusValue = 'mock';
      this.qrDataUrl = null;
      this.qrGeneratedAt = null;
      this.lastError = null;
      this.phone = null;
      this.pushName = null;
      await this.persistStatus('mock', 'mock');
      realtime.publish('wa-status', this.getStatus());
    } else if (this.statusValue === 'mock') {
      this.statusValue = 'disconnected';
      await this.persistStatus('disconnected', 'webjs');
      realtime.publish('wa-status', this.getStatus());
    }
    return this.getStatus();
  }

  private async persistStatus(status: WhatsAppStatusValue, driver: string): Promise<void> {
    try {
      await prisma.whatsAppSession.upsert({
        where: { id: 'runtime' },
        create: {
          id: 'runtime',
          status,
          driver,
          phone: this.phone,
          pushName: this.pushName,
          lastConnectedAt: this.lastConnectedAt,
          lastError: this.lastError,
          qrGeneratedAt: this.qrGeneratedAt
        },
        update: {
          status,
          driver,
          phone: this.phone,
          pushName: this.pushName,
          lastConnectedAt: this.lastConnectedAt,
          lastError: this.lastError,
          qrGeneratedAt: this.qrGeneratedAt
        }
      });
    } catch (error) {
      logger.warn({ err: error }, 'Failed to persist WhatsApp session status');
    }
  }

  private async setStatus(
    status: WhatsAppStatusValue,
    error: string | null = null
  ): Promise<void> {
    this.statusValue = status;
    this.lastError = error;
    if (status === 'connected') {
      this.lastConnectedAt = new Date();
      this.qrDataUrl = null;
    }
    await this.persistStatus(status, 'webjs');
    realtime.publish('wa-status', this.getStatus());
  }

  async connect(): Promise<WhatsAppStatusDTO> {
    if (this.starting) return this.getStatus();
    const bot = await getBotConfig();
    if (bot.waDriver !== 'webjs') {
      await this.stopClient();
      this.statusValue = 'mock';
      this.lastError = null;
      this.qrDataUrl = null;
      await this.persistStatus('mock', 'mock');
      realtime.publish('wa-status', this.getStatus());
      return this.getStatus();
    }

    await this.stopClient();
    this.starting = true;
    this.qrDataUrl = null;
    this.qrGeneratedAt = null;
    this.lastError = null;
    await this.setStatus('connecting');

    try {
      const executablePath = resolveExecutablePath();
      if (!executablePath) {
        throw new Error(
          'Chrome/Chromium tidak ditemukan. Set PUPPETEER_EXECUTABLE_PATH di environment.'
        );
      }
      this.client = new Client({
        authStrategy: new LocalAuth({ clientId: 'sigap', dataPath: paths.waSession }),
        puppeteer: {
          headless: true,
          executablePath,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote'
          ]
        }
      });

      this.client.on('qr', (qr: string) => {
        this.qrDataUrl = qr;
        this.qrGeneratedAt = new Date();
        this.statusValue = 'qr';
        this.persistStatus('qr', 'webjs');
        QRCode.toDataURL(qr, {
          margin: 1,
          width: 360,
          color: statusColor()
        })
          .then((dataUrl) => {
            this.qrDataUrl = dataUrl;
            realtime.publish('wa-qr', this.getStatus());
            realtime.publish('wa-status', this.getStatus());
          })
          .catch((error) => logger.warn({ err: error }, 'Failed to render QR code'));
      });

      this.client.on('authenticated', () => {
        this.statusValue = 'authenticated';
        this.qrDataUrl = null;
        this.persistStatus('authenticated', 'webjs');
        realtime.publish('wa-status', this.getStatus());
      });

      this.client.on('ready', () => {
        const info = this.client?.info;
        this.phone = normalizePhone(info?.wid?.user ?? null);
        this.pushName = info?.pushname ?? null;
        void this.setStatus('connected');
        void recordActivity({
          type: 'wa_connected',
          title: 'WhatsApp berhasil terhubung',
          description: this.pushName ? `${this.pushName} · ${this.phone}` : this.phone ?? 'Perangkat terhubung',
          actor: 'WhatsApp'
        });
      });

      this.client.on('auth_failure', (message: string) => {
        void this.setStatus('error', message || 'Autentikasi WhatsApp gagal.');
      });

      this.client.on('disconnected', (reason: string) => {
        this.client = null;
        this.qrDataUrl = null;
        void this.setStatus('disconnected', reason || 'Koneksi WhatsApp terputus.');
      });

      this.client.on('message', (message: WAWebJS.Message) => {
        void this.handleIncoming(message).catch((error) => {
          logger.error({ err: error }, 'Unhandled WhatsApp message error');
        });
      });

      await this.client.initialize();
      logger.info({ phone: this.phone }, 'WhatsApp client initialized');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menghubungkan WhatsApp.';
      logger.error({ err: error }, 'WhatsApp connection failed');
      await this.setStatus('error', message);
      this.client = null;
    } finally {
      this.starting = false;
    }

    return this.getStatus();
  }

  private async stopClient(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.destroy();
    } catch (error) {
      logger.debug({ err: error }, 'Error while destroying WhatsApp client');
    }
    this.client = null;
  }

  async restart(): Promise<WhatsAppStatusDTO> {
    await this.stopClient();
    return this.connect();
  }

  async disconnect(logout = false): Promise<WhatsAppStatusDTO> {
    if (this.client) {
      try {
        if (logout) await this.client.logout();
      } catch (error) {
        logger.warn({ err: error }, 'WhatsApp logout failed');
      }
      await this.stopClient();
    }
    this.qrDataUrl = null;
    this.qrGeneratedAt = null;
    this.phone = null;
    this.pushName = null;
    await this.setStatus('disconnected');
    await recordActivity({
      type: 'wa_disconnected',
      title: logout ? 'Sesi WhatsApp di-logout' : 'WhatsApp diputuskan',
      description: 'Koneksi perangkat WhatsApp dihentikan dari dashboard.',
      actor: 'Dashboard'
    });
    return this.getStatus();
  }

  async getGroups(): Promise<AvailableGroup[]> {
    if (!this.client || this.statusValue !== 'connected') {
      const monitored = await prisma.monitoredGroup.findMany();
      if (monitored.length > 0) {
        return monitored.map((group) => ({ jid: group.jid, name: group.name, participants: 0 }));
      }
      return [
        { jid: '120363000000001@g.us', name: 'SIGAP · Grup Laporan Harian', participants: 42 },
        { jid: '120363000000002@g.us', name: 'Satlantas Polres Sikka', participants: 28 },
        { jid: '120363000000003@g.us', name: 'Personel Giat Pengamanan', participants: 16 }
      ];
    }
    const chats = await this.client.getChats();
    return chats
      .filter((chat): chat is WAWebJS.GroupChat => chat.isGroup)
      .map((chat) => ({
        jid: chat.id._serialized,
        name: chat.name || 'Grup tanpa nama',
        participants: chat.participants?.length ?? 0
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async sendMessage(jid: string, text: string): Promise<boolean> {
    if (this.isMock) {
      logger.info({ jid, preview: text.slice(0, 160) }, 'Mock WhatsApp send');
      await recordActivity({
        type: 'wa_mock_send',
        title: 'Pesan rekap (mode simulasi)',
        description: `Tujuan ${jid} · ${text.split('\n')[0]?.slice(0, 120) ?? ''}`,
        actor: 'SIGAP'
      });
      return true;
    }
    if (!this.client || this.statusValue !== 'connected') return false;
    try {
      await this.client.sendMessage(jid, text);
      return true;
    } catch (error) {
      logger.error({ err: error, jid }, 'Failed to send WhatsApp message');
      return false;
    }
  }

  private enqueue(label: string, task: () => Promise<void>): void {
    void messageQueue.add(task).catch((error) => {
      logger.error({ err: error, label }, 'WhatsApp background job failed');
      void recordActivity({
        type: 'message_failed',
        title: 'Pemrosesan pesan WhatsApp gagal',
        description: error instanceof Error ? error.message : 'Kesalahan tidak diketahui.',
        actor: 'SIGAP'
      });
    });
  }

  private async handleIncoming(message: WAWebJS.Message): Promise<void> {
    if (message.fromMe) return;
    if (message.from === 'status@broadcast' || message.to === 'status@broadcast') return;

    const isGroup = message.from.endsWith('@g.us');
    if (isGroup && !(await isGroupMonitored(message.from))) return;

    const senderId = isGroup ? message.author ?? message.from : message.from;
    const number = normalizePhone(senderId);
    let senderName = number;
    try {
      const contact = await message.getContact();
      senderName = contact.pushname || contact.name || contact.shortName || number;
    } catch {
      // Contact lookup can fail for unknown numbers.
    }

    let groupName: string | null = null;
    if (isGroup) {
      try {
        const chat = await message.getChat();
        groupName = chat.name ?? null;
      } catch {
        groupName = null;
      }
    }

    const messageId = message.id._serialized;
    const receivedAt = new Date((message.timestamp || Date.now() / 1000) * 1000);
    const bot = await getBotConfig();
    const base = { senderName, senderNumber: number, groupName, messageId, receivedAt };

    if (message.hasMedia && (message.type === 'image' || message.type === 'document')) {
      let media: WAWebJS.MessageMedia | null = null;
      try {
        media = await message.downloadMedia();
      } catch (error) {
        logger.warn({ err: error }, 'Failed to download WhatsApp media');
      }
      if (!media?.data) return;
      const buffer = Buffer.from(media.data, 'base64');
      if (buffer.byteLength > config.maxUploadBytes) {
        await recordActivity({
          type: 'message_rejected',
          title: 'Media WhatsApp terlalu besar',
          description: `${senderName} mengirim ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB (maks ${config.maxUploadMb} MB).`,
          actor: senderName
        });
        return;
      }

      if (message.type === 'image') {
        this.enqueue('timemark', async () => {
          const dto = await ingestTimemark({
            ...base,
            buffer,
            mimeType: media?.mimetype ?? 'image/jpeg',
            caption: message.body || null,
            source: 'whatsapp'
          });
          await this.autoReply(
            message,
            senderName,
            dto.status === 'failed'
              ? 'Foto diterima, tetapi watermark belum dapat dibaca. Admin akan meninjau.'
              : `${TURJAWALI_LABELS[dto.turjawaliType]} · ${dto.timeText ?? ''} ${dto.unitName ?? ''} · match ${dto.matchScore}%`.trim()
          );
        });
        return;
      }

      const filename = media.filename ?? `dokumen-${messageId}.pdf`;
      const supported =
        filename.toLowerCase().endsWith('.pdf') ||
        filename.toLowerCase().endsWith('.docx') ||
        media.mimetype === 'application/pdf' ||
        media.mimetype.includes('wordprocessingml');
      if (!supported) return;

      this.enqueue('sprin-document', async () => {
        const result = await ingestSprin({
          buffer,
          filename,
          mimeType: media?.mimetype ?? '',
          source: 'whatsapp',
          senderName,
          senderNumber: number
        });
        await this.autoReply(
          message,
          senderName,
          `Sprin ${result.sprin.number} diterima · ${result.sprin.personnelCount} personel`
        );
      });
      return;
    }
    const body = message.body?.trim();
    if (!body || !/https?:\/\//i.test(body)) return;

    this.enqueue('links', async () => {
      const links = await ingestLinks({
        text: body,
        ...base,
        source: 'whatsapp'
      });
      if (links.length === 0) return;
      const platforms = [...new Set(links.map((link) => link.platform))].join(', ');
      await this.autoReply(message, senderName, `${links.length} link terekap (${platforms})`);
    });
  }

  private async autoReply(
    message: WAWebJS.Message,
    senderName: string,
    summary: string
  ): Promise<void> {
    const bot = await getBotConfig();
    if (!bot.autoReplyEnabled || !bot.autoReplyTemplate) return;
    const template = bot.autoReplyTemplate
      .replaceAll('{name}', senderName)
      .replaceAll('{summary}', summary)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!template) return;
    try {
      await message.reply(template);
    } catch (error) {
      logger.warn({ err: error }, 'Auto-reply failed');
    }
  }
}

export const whatsappManager = new WhatsAppManager();
