import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { importPosPagiData, type ParsedPosPagiWorkbook } from './pos-pagi-service.js';

const POS_PAGI_SEED_VERSION = 'pos-pagi-2026-11';
const DEFAULT_DATA_PATH = fileURLToPath(
  new URL('../seed-data/pos-pagi-default.json', import.meta.url)
);

/**
 * Isi database POS PAGI sekali dari lampiran November 2026. Impor admin
 * berikutnya tidak ditimpa karena versi seed disimpan di BotConfig.
 */
export async function seedPosPagiIfNeeded(): Promise<void> {
  const bot = await prisma.botConfig.findUnique({ where: { id: 'singleton' } });
  if (bot?.posPagiSeedVersion === POS_PAGI_SEED_VERSION) return;

  const count = await prisma.posPagi.count();
  if (count === 0) {
    const parsed = JSON.parse(fs.readFileSync(DEFAULT_DATA_PATH, 'utf8')) as ParsedPosPagiWorkbook;
    const result = await importPosPagiData(parsed);
    logger.info(
      {
        posts: result.totals.posts,
        assigned: result.totals.assigned,
        matched: result.totals.matched,
        unmatched: result.totals.unmatched
      },
      'Data POS PAGI awal dimuat'
    );
  }

  await prisma.botConfig.update({
    where: { id: 'singleton' },
    data: { posPagiSeedVersion: POS_PAGI_SEED_VERSION }
  });
}
