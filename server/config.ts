import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';

const root = process.cwd();

function env(name: string, fallback = ''): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

export const config = {
  root,
  port: Number(env('PORT', '3000')),
  nodeEnv: env('NODE_ENV', 'development'),
  isProduction: env('NODE_ENV', 'development') === 'production',
  appBaseUrl: env('APP_BASE_URL', 'http://localhost:5173'),
  corsOrigin: env('CORS_ORIGIN', 'http://localhost:5173'),
  storageDir: path.resolve(root, env('STORAGE_DIR', 'storage')),
  databaseUrl: env('DATABASE_URL', 'file:../data/app.db'),
  waDriver: env('WA_DRIVER', 'mock'),
  /** Pin versi WhatsApp Web (mis. `2.3000.1047399436-alpha`); kosong = otomatis. */
  waWebVersion: env('WA_WEB_VERSION'),
  waSessionPath: path.resolve(root, env('WA_SESSION_PATH', 'data/wa-session')),
  puppeteerExecutablePath: env('PUPPETEER_EXECUTABLE_PATH'),
  logLevel: env('LOG_LEVEL', 'info'),
  /** Basic Auth opsional untuk akses dari luar (kosongkan untuk menonaktifkan). */
  appUser: env('APP_USER'),
  appPass: env('APP_PASS'),
  maxUploadMb: Number(env('MAX_UPLOAD_MB', '25')),
  maxUploadBytes: Number(env('MAX_UPLOAD_MB', '25')) * 1024 * 1024
};

export const paths = {
  root,
  storage: config.storageDir,
  timemark: path.join(config.storageDir, 'timemark'),
  sprin: path.join(config.storageDir, 'sprin'),
  demo: path.join(config.storageDir, 'demo'),
  waSession: config.waSessionPath,
  tessdata: path.join(root, 'tessdata'),
  webDist: path.join(root, 'dist')
};

export function ensureRuntimeDirectories(): void {
  for (const dir of [
    paths.storage,
    paths.timemark,
    paths.sprin,
    paths.demo,
    paths.tessdata,
    path.dirname(paths.waSession)
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function mediaUrl(relativePath: string | null): string | null {
  if (!relativePath) return null;
  return `/media/${relativePath.replaceAll('\\', '/')}`;
}
