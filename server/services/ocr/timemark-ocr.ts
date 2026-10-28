import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import Tesseract from 'tesseract.js';
import PQueue from 'p-queue';
import sharp from 'sharp';
import { paths } from '../../config.js';
import { getBotConfig } from '../settings.js';
import { logger } from '../../lib/logger.js';
import { extractTimemarkWithAi } from '../ai/client.js';
import {
  mergeTimemarkExtractions,
  parseTimemarkText,
  type TimemarkExtraction
} from './timemark-parser.js';

export interface TimemarkOcrResult {
  extraction: TimemarkExtraction;
  ocrText: string;
  engineConfidence: number;
  aiUsed: boolean;
}

const ocrQueue = new PQueue({ concurrency: 1 });
let workerPromise: Promise<Tesseract.Worker> | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    const cachePath = paths.tessdata;
    await fs.mkdir(cachePath, { recursive: true });
    workerPromise = Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
      cachePath,
      logger: (message) => {
        if (message.status === 'recognizing text' && Math.round(message.progress * 100) % 25 === 0) {
          logger.debug({ progress: Math.round(message.progress * 100) }, 'OCR progress');
        }
      },
      errorHandler: (error) => logger.warn({ err: error }, 'Tesseract worker error')
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300'
      });
      return worker;
    });
    workerPromise.catch((error) => {
      logger.error({ err: error }, 'Failed to initialize Tesseract worker');
      workerPromise = null;
    });
  }
  return workerPromise;
}

export async function terminateOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch {
    // Worker may already be terminated.
  } finally {
    workerPromise = null;
  }
}

type PreprocessVariant = 'enhanced' | 'threshold' | 'watermark';

/** Bobot seberapa lengkap hasil ekstraksi, dipakai memilih pass OCR terbaik. */
function scoreExtraction(extraction: TimemarkExtraction): number {
  let score = 0;
  if (extraction.timeText) score += 30;
  if (extraction.capturedAt) score += 25;
  if (extraction.address) score += 15;
  if (extraction.unitName) score += 15;
  if (extraction.latitude !== null && extraction.longitude !== null) score += 15;
  return score + Math.round(extraction.confidence / 10);
}

async function preprocess(filePath: string, variant: PreprocessVariant): Promise<string> {
  await fs.mkdir(paths.timemark, { recursive: true });
  const target = path.join(paths.timemark, `.ocr-${randomUUID()}.png`);

  if (variant === 'watermark') {
    // Watermark Timemark berupa teks putih besar di sisi kiri foto yang terang.
    // Crop area itu, naikkan kontras, lalu ambang tinggi agar hanya teks putih
    // yang tersisa.
    const meta = await sharp(filePath).metadata();
    const width = meta.width ?? 1600;
    const height = meta.height ?? 1200;
    const cropWidth = Math.max(200, Math.round(width * 0.62));

    await sharp(filePath)
      .rotate()
      .extract({ left: 0, top: 0, width: cropWidth, height })
      .grayscale()
      .normalize()
      .threshold(190)
      .resize({ width: 1500 })
      .png({ compressionLevel: 6 })
      .toFile(target);
    return target;
  }

  let pipeline = sharp(filePath)
    .rotate()
    .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.1 });

  if (variant === 'threshold') {
    pipeline = pipeline.threshold(155);
  }

  await pipeline.png({ compressionLevel: 6 }).toFile(target);
  return target;
}

async function recognize(
  filePath: string,
  variant: PreprocessVariant
): Promise<{ text: string; confidence: number }> {
  const worker = await getWorker();
  const processed = await preprocess(filePath, variant);
  try {
    const result = await ocrQueue.add(() =>
      Promise.race([
        worker.recognize(processed),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('OCR timeout setelah 120 detik')), 120_000)
        )
      ])
    );
    return {
      text: result.data.text ?? '',
      confidence: Number(result.data.confidence ?? 0)
    };
  } finally {
    await fs.unlink(processed).catch(() => undefined);
  }
}

function aiExtraction(
  raw: Record<string, unknown>,
  rawText: string
): TimemarkExtraction | null {
  const text = (key: string): string | null => {
    const value = raw[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };
  const number = (key: string): number | null => {
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const dateValue = text('date') ?? text('dateText');
  let dateForParser = dateValue;
  const iso = dateValue?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) dateForParser = `${iso[3]}/${iso[2]}/${iso[1]}`;

  const synthetic = [
    text('time'),
    dateForParser,
    text('address'),
    text('village'),
    text('district'),
    text('regency'),
    text('province'),
    text('unit'),
    text('coordinateText')
  ]
    .filter(Boolean)
    .join('\n');

  if (!synthetic) return null;
  const base = parseTimemarkText(synthetic, Number(raw.confidence ?? 82), { minConfidence: 0 });
  return {
    ...base,
    timeText: text('time') ?? base.timeText,
    dateText: dateValue ?? base.dateText,
    address: text('address') ?? base.address,
    village: text('village') ?? base.village,
    district: text('district') ?? base.district,
    regency: text('regency') ?? base.regency,
    province: text('province') ?? base.province,
    unitName: text('unit') ?? base.unitName,
    coordinateText: text('coordinateText') ?? base.coordinateText,
    latitude: number('latitude') ?? base.latitude,
    longitude: number('longitude') ?? base.longitude,
    rawText,
    confidence: Math.max(base.confidence, Math.round(Number(raw.confidence ?? 82)))
  };
}

export async function extractTimemarkFromFile(filePath: string): Promise<TimemarkOcrResult> {
  const bot = await getBotConfig();
  const minConfidence = bot.minOcrConfidence;
  let ocrText = '';
  let engineConfidence = 0;
  let firstError: unknown = null;

  try {
    const first = await recognize(filePath, 'enhanced');
    ocrText = first.text;
    engineConfidence = first.confidence;
  } catch (error) {
    firstError = error;
    logger.warn({ err: error }, 'Primary OCR pass failed');
  }

  let extraction = parseTimemarkText(ocrText, engineConfidence, { minConfidence });

  const criticalMissing =
    !extraction.timeText ||
    !extraction.capturedAt ||
    extraction.latitude === null ||
    !extraction.unitName ||
    extraction.confidence < Math.max(72, minConfidence);

  if (criticalMissing) {
    try {
      const second = await recognize(filePath, 'threshold');
      if (second.text.length > ocrText.length && second.confidence >= engineConfidence * 0.75) {
        ocrText = second.text;
        engineConfidence = second.confidence;
        extraction = parseTimemarkText(ocrText, engineConfidence, { minConfidence });
      }
    } catch (error) {
      logger.warn({ err: error }, 'Secondary OCR pass failed');
    }
  }

  // Pass ketiga: watermark putih besar di sisi kiri foto terang.
  const stillMissing =
    !extraction.timeText || !extraction.capturedAt || !extraction.unitName;
  if (stillMissing) {
    try {
      const third = await recognize(filePath, 'watermark');
      if (third.text.trim().length > 0) {
        const watermarkExtraction = parseTimemarkText(third.text, third.confidence, {
          minConfidence
        });
        const gained = scoreExtraction(watermarkExtraction) > scoreExtraction(extraction);
        if (gained) {
          extraction = watermarkExtraction;
          ocrText = `${ocrText}\n${third.text}`.trim();
          engineConfidence = Math.max(engineConfidence, third.confidence);
        }
      }
    } catch (error) {
      logger.warn({ err: error }, 'Watermark OCR pass failed');
    }
  }

  let aiUsed = false;
  if (bot.aiEnabled && (criticalMissing || !ocrText)) {
    try {
      const image = await sharp(filePath)
        .rotate()
        .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
      const aiRaw = await extractTimemarkWithAi(
        {
          enabled: true,
          baseUrl: bot.aiBaseUrl,
          apiKey: bot.aiApiKey,
          model: bot.aiModel
        },
        bot.timemarkPrompt,
        image.toString('base64'),
        'image/jpeg'
      );
      if (aiRaw) {
        const fallback = aiExtraction(aiRaw, ocrText);
        if (fallback) {
          extraction = mergeTimemarkExtractions(extraction, fallback);
          extraction.confidence = Math.max(extraction.confidence, Math.round(Number(aiRaw.confidence ?? 84)));
          aiUsed = true;
        }
      }
    } catch (error) {
      logger.warn({ err: error }, 'AI vision extraction failed');
    }
  }

  if (!ocrText && !aiUsed) {
    throw new Error(
      `OCR gagal membaca gambar${firstError instanceof Error ? `: ${firstError.message}` : '.'}`
    );
  }

  extraction.rawText = ocrText;
  return { extraction, ocrText, engineConfidence, aiUsed };
}
