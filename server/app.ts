import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import multer from 'multer';
import { ZodError } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { config, paths } from './config.js';
import { logger } from './lib/logger.js';
import { HttpError } from './lib/http-error.js';
import { prisma } from './lib/prisma.js';
import { buildAuthContext } from './lib/auth-guard.js';
import { apiRouter } from './routes/index.js';
import { SprinValidationError } from './services/sprin-service.js';
import { PersonnelValidationError } from './services/personnel-service.js';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);


  // Autentikasi API: sesi cookie (admin/manajer) atau kredensial admin (Basic).
  // Halaman SPA, aset statis, dan /api/auth/* dibiarkan terbuka agar halaman
  // /login bisa dimuat; endpoint /api lain wajib sudah masuk.
  app.use((req, res, next) => {
    const isProtected = req.path.startsWith('/api') || req.path.startsWith('/media');
    if (!isProtected) {
      next();
      return;
    }
    if (req.path === '/api/health' || req.path.startsWith('/api/auth/')) {
      next();
      return;
    }
    void (async () => {
      const context = await buildAuthContext(req);
      if (context.admin || context.user) {
        res.locals.auth = context;
        next();
        return;
      }
      res.status(401).json({ error: 'Belum masuk. Silakan login.' });
    })().catch(next);
  });

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  );
  app.use(
    compression({
      filter: (req, res) => {
        if (req.headers.accept === 'text/event-stream') return false;
        return compression.filter(req, res);
      }
    })
  );
  const allowedOrigins = config.corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      credentials: true
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.get('/api/health', async (_req, res) => {
    let database = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'error';
    }
    res.status(database === 'ok' ? 200 : 503).json({
      status: database === 'ok' ? 'ok' : 'degraded',
      service: 'SIGAP API',
      version: '1.0.0',
      database,
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString()
    });
  });

  app.use('/api', apiRouter);

  app.use(
    '/media',
    express.static(paths.storage, {
      maxAge: '1h',
      immutable: false
    })
  );

  const indexFile = path.join(paths.webDist, 'index.html');
  if (fs.existsSync(indexFile)) {
    app.use(express.static(paths.webDist, { maxAge: config.isProduction ? '1h' : 0 }));
    app.get(/^(?!\/api|\/media).*/, (_req, res) => {
      // index.html tidak boleh di-cache lama: setelah deploy, aset lama bisa hilang.
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(indexFile);
    });
  }

  app.use((req, _res, next) => {
    next(new HttpError(404, `Endpoint ${req.method} ${req.path} tidak ditemukan.`));
  });

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;

    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Data permintaan tidak valid.',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message, details: error.details });
      return;
    }
    if (error instanceof SprinValidationError) {
      res.status(422).json({ error: error.message });
      return;
    }
    if (error instanceof PersonnelValidationError) {
      res.status(422).json({ error: error.message });
      return;
    }
    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      res.status(status).json({
        error:
          error.code === 'LIMIT_FILE_SIZE'
            ? `Ukuran file melebihi batas ${config.maxUploadMb} MB.`
            : `Upload gagal: ${error.message}`
      });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        res.status(409).json({ error: 'Data duplikat terdeteksi.' });
        return;
      }
      if (error.code === 'P2025') {
        res.status(404).json({ error: 'Data tidak ditemukan.' });
        return;
      }
    }
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ error: 'JSON tidak valid.' });
      return;
    }

    logger.error(
      {
        err: error,
        method: req.method,
        path: req.path
      },
      'Unhandled request error'
    );
    res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  });

  return app;
}
