import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
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

/** Id baris AppUser khusus admin. Kredensialnya tetap berasal dari APP_USER/APP_PASS. */
const ADMIN_ID = 'admin';
const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;
const PASSWORD_MIN_LENGTH = 8;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Hash password memakai scrypt: `scrypt$<salt>$<hash>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function validateCredentials(username: string | null, password: string | null): void {
  if (username && !USERNAME_RE.test(username)) {
    throw new Error('Username 3–32 karakter: huruf, angka, titik, garis bawah, atau strip.');
  }
  if (password && password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password minimal ${PASSWORD_MIN_LENGTH} karakter.`);
  }
}

/** Pastikan baris admin ada agar sesi admin bisa disimpan di AppSession. */
async function ensureAdminUser() {
  return prisma.appUser.upsert({
    where: { id: ADMIN_ID },
    update: { role: 'ADMIN', active: true },
    create: {
      id: ADMIN_ID,
      name: 'Admin',
      phone: '',
      role: 'ADMIN',
      permissions: '',
      active: true
    }
  });
}

async function issueSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {}
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.appSession.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 250) ?? null
    }
  });
  await prisma.appUser.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  return token;
}

export interface AppUserDTO {
  id: string;
  name: string;
  phone: string;
  username: string | null;
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
  username: string | null;
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
    username: user.username,
    role: user.role as AppRole,
    permissions: parsePermissions(user.permissions),
    active: user.active,
    note: user.note,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString()
  };
}

export async function listManagers(): Promise<AppUserDTO[]> {
  const users = await prisma.appUser.findMany({
    where: { role: { not: 'ADMIN' } },
    orderBy: { createdAt: 'asc' }
  });
  return users.map(serializeUser);
}

export async function createManager(input: {
  name: string;
  phone: string;
  permissions: string[];
  note?: string | null;
  username?: string | null;
  password?: string | null;
}): Promise<AppUserDTO> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error('Nomor HP tidak valid.');
  const existing = await prisma.appUser.findUnique({ where: { phone } });
  if (existing) throw new Error('Nomor ini sudah terdaftar.');

  const username = input.username?.trim() || null;
  const password = input.password || null;
  validateCredentials(username, password);
  if (username) {
    const taken = await prisma.appUser.findUnique({ where: { username } });
    if (taken) throw new Error('Username sudah dipakai.');
  }

  const user = await prisma.appUser.create({
    data: {
      name: input.name.trim(),
      phone,
      username,
      passwordHash: password ? hashPassword(password) : null,
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
  input: {
    name?: string;
    permissions?: string[];
    active?: boolean;
    note?: string | null;
    username?: string | null;
    password?: string | null;
  }
): Promise<AppUserDTO | null> {
  const existing = await prisma.appUser.findUnique({ where: { id } });
  if (!existing) return null;
  if (existing.role === 'ADMIN') throw new Error('Akun admin tidak dapat diubah dari sini.');

  const username =
    input.username !== undefined ? input.username?.trim() || null : existing.username;
  const password = input.password || null;
  validateCredentials(username, password);
  if (username && username !== existing.username) {
    const taken = await prisma.appUser.findUnique({ where: { username } });
    if (taken && taken.id !== id) throw new Error('Username sudah dipakai.');
  }

  const user = await prisma.appUser.update({
    where: { id },
    data: {
      name: input.name?.trim() ?? existing.name,
      username,
      passwordHash: password ? hashPassword(password) : existing.passwordHash,
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

/**
 * Login memakai username + password.
 * - `APP_USER`/`APP_PASS` di environment berlaku sebagai akun admin.
 * - Manajer memakai kolom `username`/`passwordHash` di AppUser.
 */
export async function loginWithPassword(
  rawUsername: string,
  password: string,
  meta: { ip?: string | null; userAgent?: string | null } = {}
): Promise<LoginResult | null> {
  const username = rawUsername.trim();
  if (!username || !password) return null;

  if (
    config.appUser &&
    config.appPass &&
    username.toLowerCase() === config.appUser.toLowerCase() &&
    safeEqual(password, config.appPass)
  ) {
    const admin = await ensureAdminUser();
    const token = await issueSession(admin.id, meta);
    await recordActivity({
      type: 'admin_login',
      title: 'Admin masuk aplikasi',
      description: 'Login username/password (kredensial admin)',
      actor: 'Admin',
      entityType: 'app_user',
      entityId: admin.id
    });
    return { token, user: serializeUser(admin) };
  }

  const user = await prisma.appUser.findUnique({ where: { username } });
  if (!user || !user.active || !user.passwordHash) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;

  const token = await issueSession(user.id, meta);
  await recordActivity({
    type: 'manager_login',
    title: 'Manajer masuk aplikasi',
    description: `${user.name} · ${user.phone}`,
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
