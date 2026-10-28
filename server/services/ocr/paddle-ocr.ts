import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { config } from '../../config.js';
import { logger } from '../../lib/logger.js';

const execFileAsync = promisify(execFile);

export interface PaddleLine {
  text: string;
  score: number;
  box: number[][];
}

export interface PaddleResult {
  text: string;
  confidence: number;
  lines: PaddleLine[];
}

const scriptPath = path.join(config.root, 'scripts', 'paddle_ocr.py');

function pythonCandidates(): string[] {
  const candidates = [
    process.env.PADDLE_PYTHON ?? '',
    path.join(config.root, '.venv-ocr', 'Scripts', 'python.exe'),
    path.join(config.root, '.venv-ocr', 'bin', 'python'),
    'python'
  ];
  return candidates.filter(Boolean);
}

let cachedPython: string | null | undefined;

/** Cari interpreter Python yang memiliki modul rapidocr terpasang. */
export async function resolvePaddlePython(): Promise<string | null> {
  if (cachedPython !== undefined) return cachedPython;
  if (!fs.existsSync(scriptPath)) {
    cachedPython = null;
    return null;
  }
  for (const candidate of pythonCandidates()) {
    for (const moduleName of ['rapidocr', 'rapidocr_onnxruntime']) {
      try {
        await execFileAsync(candidate, ['-c', `import ${moduleName}`], { timeout: 60_000 });
        cachedPython = candidate;
        logger.info({ python: candidate, module: moduleName }, 'PaddleOCR siap dipakai');
        return candidate;
      } catch {
        // coba modul / kandidat berikutnya
      }
    }
  }
  cachedPython = null;
  logger.warn('PaddleOCR tidak tersedia — fallback ke Tesseract');
  return null;
}

export async function isPaddleAvailable(): Promise<boolean> {
  return (await resolvePaddlePython()) !== null;
}

export async function paddleRecognize(imagePath: string): Promise<PaddleResult> {
  const python = await resolvePaddlePython();
  if (!python) throw new Error('PaddleOCR tidak tersedia.');

  const { stdout } = await execFileAsync(python, [scriptPath, imagePath], {
    timeout: 180_000,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true
  });

  let parsed: { lines?: PaddleLine[]; error?: string };
  try {
    parsed = JSON.parse(stdout.trim() || '{}') as { lines?: PaddleLine[]; error?: string };
  } catch {
    throw new Error(`Output PaddleOCR tidak valid: ${stdout.slice(0, 200)}`);
  }
  if (parsed.error) throw new Error(parsed.error);

  const lines = (parsed.lines ?? []).filter((line) => line.text?.trim().length > 0);
  if (lines.length === 0) {
    return { text: '', confidence: 0, lines: [] };
  }

  const text = lines.map((line) => line.text.trim()).join('\n');
  const average = lines.reduce((sum, line) => sum + (line.score ?? 0), 0) / lines.length;
  return { text, confidence: Math.round(average * 100), lines };
}

/**
 * OCR dua tahap: seluruh foto + crop sisi kiri (area watermark Timemark).
 * Watermark sering terbaca lebih bersih saat dicrop, terutama untuk jam.
 */
export async function paddleRecognizeWithCrop(filePath: string): Promise<PaddleResult> {
  const full = await paddleRecognize(filePath);

  let cropped: PaddleResult | null = null;
  let cropPath: string | null = null;
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(filePath).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width > 200 && height > 200) {
      cropPath = path.join(path.dirname(filePath), `.paddle-crop-${Date.now()}.jpg`);
      await sharp(filePath)
        .extract({ left: 0, top: 0, width: Math.max(160, Math.round(width * 0.62)), height })
        .jpeg({ quality: 92 })
        .toFile(cropPath);
      cropped = await paddleRecognize(cropPath);
    }
  } catch (error) {
    logger.debug({ err: error }, 'Crop OCR tambahan gagal');
  } finally {
    if (cropPath) {
      await fsp.unlink(cropPath).catch(() => undefined);
    }
  }

  if (!cropped || cropped.lines.length === 0) return full;

  const seen = new Set(full.lines.map((line) => line.text.replace(/\s+/g, ' ').trim().toUpperCase()));
  const extra = cropped.lines.filter((line) => {
    const key = line.text.replace(/\s+/g, ' ').trim().toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const lines = [...full.lines, ...extra];
  const text = lines.map((line) => line.text.trim()).join('\n');
  const average = lines.reduce((sum, line) => sum + (line.score ?? 0), 0) / lines.length;
  return { text, confidence: Math.round(average * 100), lines };
}
