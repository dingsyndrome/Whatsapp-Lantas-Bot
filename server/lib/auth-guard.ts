import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { HttpError } from './http-error.js';
import { resolveSession, type AppUserDTO } from '../services/auth-service.js';
import { hasPermission, type Permission } from '../../shared/permissions.js';

export const SESSION_COOKIE = 'sigap_session';

export function getSessionToken(req: Request): string | null {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** Apakah request memakai kredensial admin (Basic Auth). */
export function isBasicAdmin(req: Request): boolean {
  if (!config.appUser || !config.appPass) return false;
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const index = decoded.indexOf(':');
  if (index < 0) return false;
  return decoded.slice(0, index) === config.appUser && decoded.slice(index + 1) === config.appPass;
}

export interface AuthContext {
  user: AppUserDTO | null;
  admin: boolean;
}

const ADMIN_USER: AppUserDTO = {
  id: 'admin',
  name: 'Admin',
  phone: '',
  role: 'ADMIN',
  permissions: [],
  active: true,
  note: null,
  lastLoginAt: null,
  createdAt: new Date(0).toISOString()
};

export async function buildAuthContext(req: Request): Promise<AuthContext> {
  if (isBasicAdmin(req)) return { user: ADMIN_USER, admin: true };
  const user = await resolveSession(getSessionToken(req));
  return { user, admin: user?.role === 'ADMIN' };
}

/** Menempelkan konteks auth ke response agar rute lain bisa membacanya. */
export async function attachAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const context = await buildAuthContext(req);
    res.locals.auth = context;
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(permission: Permission) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const auth = res.locals.auth as AuthContext | undefined;
    if (!auth?.user && !auth?.admin) {
      next(new HttpError(401, 'Belum masuk.'));
      return;
    }
    if (auth.admin) {
      next();
      return;
    }
    if (!hasPermission(auth.user, permission)) {
      next(new HttpError(403, 'Anda tidak memiliki izin untuk tindakan ini.'));
      return;
    }
    next();
  };
}

export function requireAdmin(_req: Request, res: Response, next: NextFunction): void {
  const auth = res.locals.auth as AuthContext | undefined;
  if (!auth?.admin) {
    next(new HttpError(403, 'Hanya admin.'));
    return;
  }
  next();
}
