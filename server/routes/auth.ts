import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import {
  createManager,
  deleteManager,
  listManagers,
  logoutByToken,
  requestOtp,
  resolveSession,
  revokeSessions,
  updateManager,
  verifyOtp,
  type AppUserDTO
} from '../services/auth-service.js';
import { getSessionToken, isBasicAdmin } from '../lib/auth-guard.js';
import { PERMISSION_KEYS } from '../../shared/permissions.js';

export const authRouter = Router();

const phoneSchema = z.string().min(8).max(20);
const otpSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'Kode OTP harus 6 digit.')
});

authRouter.get('/permissions', (_req, res) => {
  res.json({ permissions: PERMISSION_KEYS });
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
  if (!isBasicAdmin(req)) {
    // Hanya admin (kredensial admin) yang boleh mengelola manajer.
    next(new HttpError(403, 'Hanya admin yang dapat mengelola manajer.'));
    return;
  }
  void res;
  next();
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
      note: z.string().max(250).nullable().optional()
    })
    .parse(req.body ?? {});
  res.status(201).json(await createManager(body));
});

managersRouter.patch('/:id', async (req, res) => {
  const body = z
    .object({
      name: z.string().min(2).max(120).optional(),
      permissions: z.array(z.string()).optional(),
      active: z.boolean().optional(),
      note: z.string().max(250).nullable().optional()
    })
    .parse(req.body ?? {});
  const user = await updateManager(String(req.params.id), body);
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
