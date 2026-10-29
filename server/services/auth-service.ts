import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { normalizePhone } from '../lib/phone.js';
import { recordActivity } from '../lib/activity.js';
import { whatsappManager } from './whatsapp-manager.js';
import {
  hasPermission,
  parsePermissions,
  serializePermissions,
  type AppRole,
  type Permission
} from '../../shared/permissions.js';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 3;
const OTP_WINDOW_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface AppUserDTO {
  id: string;
  name: string;
  phone: string;
  role: AppRole;
  permissions: Permission[];
  active: boolean;
  note: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

function serializeUser(user: {
  id: string;
  name: string;
  phone: string;
  role: string;
  permissions: string;
  active: boolean;
  note: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}): AppUserDTO {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role as AppRole,
    permissions: parsePermissions(user.permissions),
    active: user.active,
    note: user.note,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString()
  };
}

export async function listManagers(): Promise<AppUserDTO[]> {
  const users = await prisma.appUser.findMany({ orderBy: { createdAt: 'asc' } });
  return users.map(serializeUser);
}

export async function createManager(input: {
  name: string;
  phone: string;
  permissions: string[];
  note?: string | null;
}): Promise<AppUserDTO> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error('Nomor HP tidak valid.');
  const existing = await prisma.appUser.findUnique({ where: { phone } });
  if (existing) throw new Error('Nomor ini sudah terdaftar.');

  const user = await prisma.appUser.create({
    data: {
      name: input.name.trim(),
      phone,
      role: 'MANAGER',
      permissions: serializePermissions(input.permissions),
      note: input.note?.trim() || null
    }
  });
  await recordActivity({
    type: 'manager_created',
    title: 'Manajer aplikasi ditambahkan',
    description: `${user.name} · ${phone} · izin: ${parsePermissions(user.permissions).join(', ') || 'tanpa izin tambahan'}`,
    actor: 'Admin',
    entityType: 'app_user',
    entityId: user.id
  });
  return serializeUser(user);
}

export async function updateManager(
  id: string,
  input: { name?: string; permissions?: string[]; active?: boolean; note?: string | null }
): Promise<AppUserDTO | null> {
  const existing = await prisma.appUser.findUnique({ where: { id } });
  if (!existing) return null;
  if (existing.role === 'ADMIN') throw new Error('Akun admin tidak dapat diubah dari sini.');

  const user = await prisma.appUser.update({
    where: { id },
    data: {
      name: input.name?.trim() ?? existing.name,
      permissions:
        input.permissions !== undefined
          ? serializePermissions(input.permissions)
          : existing.permissions,
      active: input.active ?? existing.active,
      note: input.note !== undefined ? input.note?.trim() || null : existing.note
    }
  });

  if (input.active === false) await revokeSessions(user.id);

  await recordActivity({
    type: 'manager_updated',
    title: 'Manajer aplikasi diperbarui',
    description: `${user.name} · ${user.active ? 'aktif' : 'nonaktif'} · izin: ${parsePermissions(user.permissions).join(', ') || '-'}`,
    actor: 'Admin',
    entityType: 'app_user',
    entityId: user.id
  });
  return serializeUser(user);
}

export async function revokeSessions(userId: string): Promise<number> {
  const result = await prisma.appSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
  return result.count;
}

export async function deleteManager(id: string): Promise<boolean> {
  const existing = await prisma.appUser.findUnique({ where: { id } });
  if (!existing) return false;
  if (existing.role === 'ADMIN') throw new Error('Akun admin tidak dapat dihapus.');
  await prisma.appUser.delete({ where: { id } });
  await recordActivity({
    type: 'manager_deleted',
    title: 'Manajer aplikasi dihapus',
    description: `${existing.name} · ${existing.phone}`,
    actor: 'Admin'
  });
  return true;
}

/** Buat OTP 6 digit dan kirim via WhatsApp. */
export async function requestOtp(rawPhone: string): Promise<{
  sent: boolean;
  reason?: string;
}> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { sent: false, reason: 'Nomor HP tidak valid.' };

  const user = await prisma.appUser.findUnique({ where: { phone } });
  if (!user || !user.active) {
    // Jangan bocorkan apakah nomor terdaftar.
    return { sent: false, reason: 'Nomor tidak memiliki akses. Hubungi admin.' };
  }

  const since = new Date(Date.now() - OTP_WINDOW_MS);
  const recent = await prisma.otpCode.count({ where: { phone, createdAt: { gte: since } } });
  if (recent >= OTP_MAX_ATTEMPTS) {
    return { sent: false, reason: 'Terlalu banyak permintaan kode. Coba lagi 15 menit lagi.' };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.otpCode.create({
    data: {
      userId: user.id,
      phone,
      codeHash: sha256(`${phone}:${code}`),
      expiresAt: new Date(Date.now() + OTP_TTL_MS)
    }
  });

  const text = [
    '*SIGAP Command Center*',
    `Kode masuk Anda: *${code}*`,
    '',
    'Berlaku 5 menit. Jangan bagikan kode ini kepada siapa pun.',
    '_Jika Anda tidak meminta kode ini, abaikan pesan ini._'
  ].join('\n');

  const ok = await whatsappManager
    .sendMessage(`${phone}@c.us`, text)
    .catch((error) => {
      logger.warn({ err: error, phone }, 'Gagal mengirim OTP WhatsApp');
      return false;
    });

  if (!ok) return { sent: false, reason: 'Kode gagal dikirim via WhatsApp. Hubungi admin.' };
  return { sent: true };
}

export interface LoginResult {
  token: string;
  user: AppUserDTO;
}

export async function verifyOtp(
  rawPhone: string,
  code: string,
  meta: { ip?: string | null; userAgent?: string | null } = {}
): Promise<LoginResult | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;

  const record = await prisma.otpCode.findFirst({
    where: { phone, usedAt: null },
    orderBy: { createdAt: 'desc' }
  });
  if (!record) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;
  if (record.attempts >= OTP_MAX_ATTEMPTS) return null;

  const matches = safeEqual(record.codeHash, sha256(`${phone}:${code.trim()}`));
  if (!matches) {
    await prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } }
    });
    return null;
  }

  await prisma.otpCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  const user = await prisma.appUser.findUnique({ where: { phone } });
  if (!user || !user.active) return null;

  const token = randomBytes(32).toString('base64url');
  await prisma.appSession.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 250) ?? null
    }
  });
  await prisma.appUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });
  await recordActivity({
    type: 'manager_login',
    title: 'Manajer masuk aplikasi',
    description: `${user.name} · ${phone}`,
    actor: 'Manajer',
    entityType: 'app_user',
    entityId: user.id
  });

  return { token, user: serializeUser(user) };
}

export async function resolveSession(token: string | null | undefined): Promise<AppUserDTO | null> {
  if (!token) return null;
  const session = await prisma.appSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true }
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  if (!session.user.active) return null;
  return serializeUser(session.user);
}

export async function logoutByToken(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await prisma.appSession.updateMany({
    where: { tokenHash: sha256(token), revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export { hasPermission, parsePermissions };
