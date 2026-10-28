import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  useMultiFileAuthState,
  type WASocket
} from 'baileys';
import type { proto } from 'baileys';
import { paths } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { recordActivity } from '../lib/activity.js';
import { normalizePhone } from '../lib/phone.js';
import { realtime } from '../lib/realtime.js';
import { ensureWhatsAppSessionRow, getBotConfig, isGroupMonitored } from './settings.js';
import { ingestTimemark } from './timemark-service.js';
import { ingestSprin } from './sprin-service.js';
import { ingestLinks } from './link-service.js';
import { TURJAWALI_LABELS } from '../../shared/types.js';
import type { AvailableGroup, WhatsAppStatusDTO } from '../../shared/types.js';

type Status = 'disconnected' | 'connecting' | 'qr' | 'authenticated' | 'connected' | 'mock' | 'error';

/**
 * Driver WhatsApp berbasis protokol WebSocket (Baileys) — tanpa Chromium.
 * Dipakai ketika `whatsapp-web.js` tidak kompatibel lagi dengan WhatsApp Web
 * versi terbaru (gejala: downloadMedia/getChats melempar error `r`).
 */
class BaileysManager {
  private socket: WASocket | null = null;
  private statusValue: Status = 'disconnected';
  private qrDataUrl: string | null = null;
  private qrGeneratedAt: Date | null = null;
  private phone: string | null = null;
  private pushName: string | null = null;
  private lastError: string | null = null;
  private starting = false;
  private groupNames = new Map<string, string>();

  private sessionDir(): string {
    return path.join(paths.waSession, 'baileys');
  }

  getStatus(): WhatsAppStatusDTO {
    return {
      status: this.statusValue,
      driver: 'baileys',
      phone: this.phone,
      pushName: this.pushName,
      lastConnectedAt: null,
      lastError: this.lastError,
      qrDataUrl: this.qrDataUrl,
      qrGeneratedAt: this.qrGeneratedAt?.toISOString() ?? null,
      isMock: false
    } as WhatsAppStatusDTO;
  }

  private async persist(status: Status): Promise<void> {
    await prisma.whatsAppSession
      .upsert({
        where: { id: 'runtime' },
        create: { id: 'runtime', status, driver: 'baileys', phone: this.phone },
        update: { status, driver: 'baileys', phone: this.phone, lastError: this.lastError }
      })
      .catch((error) => logger.warn({ err: error }, 'Gagal menyimpan status WhatsApp'));
  }

  async connect(): Promise<WhatsAppStatusDTO> {
    if (this.starting) return this.getStatus();
    if (this.socket) return this.getStatus();
    this.starting = true;
    this.statusValue = 'connecting';
    this.lastError = null;
    this.qrDataUrl = null;
    await this.persist('connecting');

    try {
      await ensureWhatsAppSessionRow();
      fs.mkdirSync(this.sessionDir(), { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir());

      const socket = makeWASocket({
        auth: state,
        browser: Browsers.ubuntu('SIGAP'),
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false
      });
      this.socket = socket;

      socket.ev.on('creds.update', saveCreds);

      socket.ev.on('connection.update', (update) => {
        void this.handleConnectionUpdate(update as Parameters<typeof this.handleConnectionUpdate>[0]);
      });

      socket.ev.on('messages.upsert', ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const message of messages) {
          void this.handleIncoming(message).catch((error) =>
            logger.error({ err: error }, 'Gagal memproses pesan Baileys')
          );
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menghubungkan WhatsApp.';
      logger.error({ err: error }, 'Baileys connection failed');
      this.statusValue = 'error';
      this.lastError = message;
      this.socket = null;
      await this.persist('error');
    } finally {
      this.starting = false;
    }

    return this.getStatus();
  }

  private async handleConnectionUpdate(update: {
    connection?: string;
    lastDisconnect?: { error?: unknown };
    qr?: string;
  }): Promise<void> {
    if (update.qr) {
      this.statusValue = 'qr';
      this.qrGeneratedAt = new Date();
      try {
        this.qrDataUrl = await QRCode.toDataURL(update.qr, { margin: 1, width: 320 });
      } catch {
        this.qrDataUrl = update.qr;
      }
      await this.persist('qr');
      realtime.publish('wa-status', this.getStatus());
      logger.info('QR WhatsApp (Baileys) dibuat — pindai dari Settings → Koneksi');
    }

    if (update.connection === 'open') {
      this.statusValue = 'connected';
      this.qrDataUrl = null;
      const id = this.socket?.user?.id ?? '';
      this.phone = normalizePhone(id.split(':')[0] ?? '') ?? null;
      this.pushName = this.socket?.user?.name ?? null;
      await this.persist('connected');
      await recordActivity({
        type: 'wa_connected',
        title: 'WhatsApp berhasil terhubung',
        description: `${this.pushName ?? 'Bot'} · ${this.phone ?? '-'} (Baileys)`,
        actor: 'SIGAP'
      });
      logger.info({ phone: this.phone, driver: 'baileys' }, 'WhatsApp client initialized');
    }

    if (update.connection === 'close') {
      const statusCode = (update.lastDisconnect?.error as { output?: { statusCode?: number } })
        ?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      this.socket = null;
      this.qrDataUrl = null;
      this.statusValue = loggedOut ? 'disconnected' : 'error';
      this.lastError = loggedOut ? 'Sesi WhatsApp di-logout.' : 'Koneksi WhatsApp terputus.';
      await this.persist(this.statusValue);
      await recordActivity({
        type: 'wa_disconnected',
        title: 'WhatsApp terputus',
        description: this.lastError,
        actor: 'SIGAP'
      });
    }
  }

  async disconnect(logout = false): Promise<WhatsAppStatusDTO> {
    try {
      if (this.socket) {
        if (logout) await this.socket.logout();
        else this.socket.end(undefined);
      }
    } catch (error) {
      logger.warn({ err: error }, 'Gagal memutus Baileys');
    } finally {
      this.socket = null;
      this.qrDataUrl = null;
      this.statusValue = 'disconnected';
      if (logout) {
        fs.rmSync(this.sessionDir(), { recursive: true, force: true });
        this.phone = null;
        this.pushName = null;
      }
      await this.persist('disconnected');
    }
    return this.getStatus();
  }

  async restart(): Promise<WhatsAppStatusDTO> {
    await this.disconnect(false);
    return this.connect();
  }

  async getGroups(): Promise<AvailableGroup[]> {
    if (!this.socket || this.statusValue !== 'connected') {
      const monitored = await prisma.monitoredGroup.findMany();
      return monitored.map((group) => ({ jid: group.jid, name: group.name, participants: 0 }));
    }
    try {
      const groups = await this.socket.groupFetchAllParticipating();
      const list = Object.values(groups ?? {}).map((group) => {
        this.groupNames.set(group.id, group.subject ?? 'Grup tanpa nama');
        return {
          jid: group.id,
          name: group.subject ?? 'Grup tanpa nama',
          participants: group.participants?.length ?? 0
        };
      });
      return list.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      logger.warn({ err: error }, 'Gagal membaca daftar grup Baileys');
      const monitored = await prisma.monitoredGroup.findMany();
      return monitored.map((group) => ({ jid: group.jid, name: group.name, participants: 0 }));
    }
  }

  async sendMessage(jid: string, text: string): Promise<boolean> {
    if (!this.socket || this.statusValue !== 'connected') return false;
    try {
      await this.socket.sendMessage(jid, { text });
      return true;
    } catch (error) {
      logger.error({ err: error, jid }, 'Gagal mengirim pesan WhatsApp (Baileys)');
      return false;
    }
  }

  private async handleIncoming(message: proto.IWebMessageInfo): Promise<void> {
    const key = message.key;
    if (!key || key.fromMe) return;
    const remoteJid = key.remoteJid ?? '';
    if (!remoteJid || remoteJid === 'status@broadcast') return;

    const isGroup = remoteJid.endsWith('@g.us');
    if (isGroup && !(await isGroupMonitored(remoteJid))) return;

    const senderId = isGroup ? key.participant ?? remoteJid : remoteJid;
    const number = normalizePhone(senderId) ?? senderId;
    const senderName = message.pushName ?? number;
    const groupName = isGroup ? this.groupNames.get(remoteJid) ?? null : null;

    const content = message.message;
    if (!content) return;

    const imageMessage = content.imageMessage ?? content.documentWithCaptionMessage?.message?.documentMessage;
    const documentMessage = content.documentMessage ?? content.documentWithCaptionMessage?.message?.documentMessage;
    const text =
      content.conversation ??
      content.extendedTextMessage?.text ??
      imageMessage?.caption ??
      documentMessage?.caption ??
      '';

    const base = {
      messageId: key.id ?? `baileys-${Date.now()}`,
      senderName,
      senderNumber: number,
      groupName,
      receivedAt: new Date(Number(message.messageTimestamp ?? Date.now() / 1000) * 1000)
    };

    const bot = await getBotConfig();

    if (imageMessage || documentMessage) {
      let buffer: Buffer | null = null;
      let mimeType = imageMessage?.mimetype ?? documentMessage?.mimetype ?? 'application/octet-stream';
      try {
        const media = await downloadMediaMessage(message as never, 'buffer', {});
        buffer = Buffer.isBuffer(media) ? media : null;
      } catch (error) {
        logger.warn({ err: error }, 'Gagal mengunduh media WhatsApp (Baileys)');
      }
      if (!buffer) return;

      if (imageMessage) {
        const dto = await ingestTimemark({
          ...base,
          buffer,
          mimeType,
          caption: imageMessage.caption ?? null,
          source: 'whatsapp'
        });
        await this.reply(remoteJid, bot, senderName,
          dto.status === 'failed'
            ? 'Foto diterima, tetapi watermark belum dapat dibaca. Admin akan meninjau.'
            : `${TURJAWALI_LABELS[dto.turjawaliType]} · ${dto.timeText ?? ''} ${dto.unitName ?? ''} · match ${dto.matchScore}%`.trim()
        );
        return;
      }

      const filename = documentMessage?.fileName ?? `dokumen-${base.messageId}.pdf`;
      const supported =
        filename.toLowerCase().endsWith('.pdf') ||
        filename.toLowerCase().endsWith('.docx') ||
        mimeType === 'application/pdf' ||
        mimeType.includes('wordprocessingml');
      if (!supported) return;

      const result = await ingestSprin({
        buffer,
        filename,
        mimeType,
        source: 'whatsapp',
        senderName,
        senderNumber: number
      });
      await this.reply(remoteJid, bot, senderName,
        `Sprin ${result.sprin.number} diterima · ${result.sprin.personnelCount} personel`
      );
      return;
    }

    if (!text) return;
    const links = await ingestLinks({ text, ...base, source: 'whatsapp' });
    if (links.length === 0) return;
    const platforms = [...new Set(links.map((link) => link.platform))].join(', ');
    await this.reply(remoteJid, bot, senderName, `${links.length} link terekap (${platforms})`);
  }

  private async reply(
    jid: string,
    bot: { autoReplyEnabled: boolean; autoReplyTemplate: string },
    senderName: string,
    summary: string
  ): Promise<void> {
    if (!bot.autoReplyEnabled || !bot.autoReplyTemplate) return;
    const template = bot.autoReplyTemplate
      .replaceAll('{name}', senderName)
      .replaceAll('{summary}', summary)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!template || !this.socket) return;
    try {
      await this.socket.sendMessage(jid, { text: template });
    } catch (error) {
      logger.warn({ err: error }, 'Auto-reply Baileys gagal');
    }
  }
}

export const baileysManager = new BaileysManager();
