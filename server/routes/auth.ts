import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import {
  createManager,
  deleteManager,
  listManagers,
  loginWithPassword,
  logoutByToken,
  requestOtp,
  resolveSession,
  revokeSessions,
  updateManager,
  verifyOtp,
  type AppUserDTO
} from '../services/auth-service.js';
import { getSessionToken, isBasicAdmin, type AuthContext } from '../lib/auth-guard.js';
import { PERMISSION_KEYS } from '../../shared/permissions.js';

export const authRouter = Router();

const phoneSchema = z.string().min(8).max(20);
const otpSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'Kode OTP harus 6 digit.')
});
const credentialSchema = z.object({
  username: z.string().max(32).nullable().optional(),
  password: z.string().max(200).nullable().optional()
});

/** Pembatas percobaan login per IP+username (in-memory). */
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function loginAttemptKey(req: Request, username: string): string {
  return `${req.ip ?? 'unknown'}|${username.toLowerCase()}`;
}

function assertLoginAllowed(key: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    throw new HttpError(429, 'Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.');
  }
}

function noteFailedLogin(key: string): void {
  const entry = loginAttempts.get(key);
  if (entry && entry.resetAt > Date.now()) entry.count += 1;
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  res.cookie('sigap_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

authRouter.get('/permissions', (_req, res) => {
  res.json({ permissions: PERMISSION_KEYS });
});

authRouter.post('/login', async (req, res) => {
  const body = z
    .object({ username: z.string().min(1).max(32), password: z.string().min(1).max(200) })
    .parse(req.body ?? {});
  const key = loginAttemptKey(req, body.username);
  assertLoginAllowed(key);

  const result = await loginWithPassword(body.username, body.password, {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null
  });
  if (!result) {
    noteFailedLogin(key);
    throw new HttpError(401, 'Username atau password salah.');
  }

  loginAttempts.delete(key);
  setSessionCookie(req, res, result.token);
  res.json({ user: result.user, token: result.token });
});

authRouter.post('/request-otp', async (req, res) => {
  const body = z.object({ phone: phoneSchema }).parse(req.body ?? {});
  const result = await requestOtp(body.phone);
  res.status(result.sent ? 200 : 429).json(result);
});

authRouter.post('/verify-otp', async (req, res) => {
  const body = otpSchema.parse(req.body ?? {});
  const result = await verifyOtp(body.phone, body.code, {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null
  });
  if (!result) throw new HttpError(401, 'Kode salah atau kedaluwarsa.');

  res.cookie('sigap_session', result.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
  res.json({ user: result.user, token: result.token });
});

authRouter.get('/me', async (req, res) => {
  if (isBasicAdmin(req)) {
    res.json({ user: adminUser(), admin: true });
    return;
  }
  const user = await resolveSession(getSessionToken(req));
  if (!user) throw new HttpError(401, 'Belum masuk.');
  res.json({ user, admin: user.role === 'ADMIN' });
});

authRouter.post('/logout', async (req, res) => {
  await logoutByToken(getSessionToken(req));
  res.clearCookie('sigap_session', { path: '/' });
  res.json({ ok: true });
});

function adminUser(): AppUserDTO {
  return {
    id: 'admin',
    name: 'Admin',
    phone: '',
    username: null,
    role: 'ADMIN',
    permissions: [...PERMISSION_KEYS],
    active: true,
    note: 'Akses penuh via kredensial admin',
    lastLoginAt: null,
    createdAt: new Date(0).toISOString()
  };
}

export const managersRouter = Router();

managersRouter.use((req, res, next) => {
  const auth = res.locals.auth as AuthContext | undefined;
  if (isBasicAdmin(req) || auth?.admin) {
    next();
    return;
  }
  // Hanya admin (kredensial admin atau sesi admin) yang boleh mengelola manajer.
  next(new HttpError(403, 'Hanya admin yang dapat mengelola manajer.'));
});

managersRouter.get('/sessions', async (_req, res) => {
  const now = new Date();
  const [sessions, logins] = await Promise.all([
    prisma.appSession.findMany({
      where: { revokedAt: null, expiresAt: { gt: now } },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 50
    }),
    prisma.activity.findMany({
      where: { type: 'manager_login' },
      orderBy: { createdAt: 'desc' },
      take: 30
    })
  ]);

  res.json({
    active: sessions.map((session) => ({
      id: session.id,
      name: session.user.name,
      phone: session.user.phone,
      role: session.user.role,
      ip: session.ip,
      userAgent: session.userAgent,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString()
    })),
    logins: logins.map((row) => ({
      id: row.id,
      description: row.description,
      createdAt: row.createdAt.toISOString()
    }))
  });
});

managersRouter.get('/', async (_req, res) => {
  res.json(await listManagers());
});

managersRouter.post('/', async (req, res) => {
  const body = z
    .object({
      name: z.string().min(2).max(120),
      phone: phoneSchema,
      permissions: z.array(z.string()).default([]),
      note: z.string().max(250).nullable().optional(),
      username: credentialSchema.shape.username,
      password: credentialSchema.shape.password
    })
    .parse(req.body ?? {});
  try {
    res.status(201).json(await createManager(body));
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Gagal menambah manajer.');
  }
});

managersRouter.patch('/:id', async (req, res) => {
  const body = z
    .object({
      name: z.string().min(2).max(120).optional(),
      permissions: z.array(z.string()).optional(),
      active: z.boolean().optional(),
      note: z.string().max(250).nullable().optional(),
      username: credentialSchema.shape.username,
      password: credentialSchema.shape.password
    })
    .parse(req.body ?? {});
  let user;
  try {
    user = await updateManager(String(req.params.id), body);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Gagal menyimpan manajer.');
  }
  if (!user) throw new HttpError(404, 'Manajer tidak ditemukan.');
  res.json(user);
});

managersRouter.post('/:id/revoke', async (req, res) => {
  res.json({ revoked: await revokeSessions(String(req.params.id)) });
});

managersRouter.delete('/:id', async (req, res) => {
  const ok = await deleteManager(String(req.params.id));
  if (!ok) throw new HttpError(404, 'Manajer tidak ditemukan.');
  res.status(204).end();
});
