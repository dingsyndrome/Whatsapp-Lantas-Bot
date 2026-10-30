/**
 * Re-OCR foto Timemark lama yang keyakinannya rendah.
 *
 * Contoh:
 *   pnpm ocr:reocr                       # dry-run, 25 foto di bawah 50%
 *   pnpm ocr:reocr -- --apply            # tulis hasilnya ke database
 *   pnpm ocr:reocr -- --threshold 60 --limit 10 --apply
 *   pnpm ocr:reocr -- --id <photoId> --apply
 *
 * Catatan: nilai di bawah ini DITIMPA dengan hasil OCR baru (termasuk koreksi
 * manual yang pernah dilakukan). Jalankan tanpa `--apply` dulu untuk melihat
 * dampaknya.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { prisma } from '../server/lib/prisma.js';
import { paths } from '../server/config.js';
import { getBotConfig } from '../server/services/settings.js';
import { extractTimemarkFromFile } from '../server/services/ocr/timemark-ocr.js';

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const apply = process.argv.includes('--apply');
const onlyId = argValue('--id');
const limit = Number(argValue('--limit') ?? 25);
const threshold = Number(argValue('--threshold') ?? 50);

const bot = await getBotConfig();
const minConfidence = Number(argValue('--min') ?? bot.minOcrConfidence);

const photos = await prisma.timemarkPhoto.findMany({
  where: onlyId ? { id: onlyId } : { confidence: { lt: threshold } },
  orderBy: { createdAt: 'asc' },
  take: onlyId ? 1 : Math.max(1, limit)
});

console.log(
  `Mode ${apply ? 'APPLY' : 'DRY-RUN'} · ambang ${threshold}% · minConfidence ${minConfidence}% · ${photos.length} foto`
);

let changed = 0;
let failed = 0;

for (const photo of photos) {
  const absolutePath = path.isAbsolute(photo.imagePath)
    ? photo.imagePath
    : path.join(paths.storage, photo.imagePath);

  try {
    await fs.access(absolutePath);
  } catch {
    console.warn(`SKIP ${photo.id} — berkas tidak ada: ${absolutePath}`);
    failed += 1;
    continue;
  }

  const startedAt = Date.now();
  try {
    const result = await extractTimemarkFromFile(absolutePath);
    const extraction = result.extraction;
    const complete = Boolean(
      extraction.timeText &&
        extraction.capturedAt &&
        extraction.unitName &&
        extraction.latitude !== null &&
        extraction.longitude !== null
    );
    const status = extraction.confidence >= minConfidence && complete ? 'parsed' : 'review';
    const elapsed = Date.now() - startedAt;

    console.log(
      `\n${photo.id}\n  sebelum : ${photo.timeText ?? '-'} · ${photo.confidence}% · ai=${photo.aiUsed ? 'ya' : 'tidak'}\n` +
        `  sesudah : ${extraction.timeText ?? '-'} · ${extraction.confidence}% · ai=${result.aiUsed ? 'ya' : 'tidak'} · ${status} · ${elapsed} ms\n` +
        `  satuan  : ${extraction.unitName ?? '-'}\n  alamat  : ${extraction.address ?? '-'}`
    );

    if (!apply) continue;

    await prisma.timemarkPhoto.update({
      where: { id: photo.id },
      data: {
        timeText: extraction.timeText,
        dateText: extraction.dateText,
        capturedAt: extraction.capturedAt,
        address: extraction.address,
        village: extraction.village,
        district: extraction.district,
        regency: extraction.regency,
        province: extraction.province,
        unitName: extraction.unitName,
        coordinateText: extraction.coordinateText,
        latitude: extraction.latitude,
        longitude: extraction.longitude,
        rawText: result.ocrText,
        confidence: extraction.confidence,
        aiUsed: result.aiUsed,
        status
      }
    });
    changed += 1;
  } catch (error) {
    failed += 1;
    console.error(`GAGAL ${photo.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(
  `\nSelesai. ${apply ? `${changed} foto diperbarui` : 'Tidak ada perubahan (dry-run)'} · ${failed} gagal/dilewati.`
);
await prisma.$disconnect();
