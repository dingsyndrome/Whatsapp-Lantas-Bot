import { afterAll, describe, expect, it, vi } from 'vitest';

// Hasil OCR harus deterministik: jangan bergantung pada isi database mesin
// pengembang (mis. AI vision yang sedang aktif dengan API key nyata).
vi.mock('../server/services/settings.js', () => ({
  getBotConfig: async () => ({
    aiEnabled: false,
    aiApiKey: '',
    aiBaseUrl: '',
    aiModel: '',
    minOcrConfidence: 50,
    timemarkPrompt: '',
    botName: 'SIGAP Test'
  })
}));

import { ensureFixtures } from '../scripts/fixture-generator.js';
import {
  extractTimemarkFromFile,
  terminateOcrWorker
} from '../server/services/ocr/timemark-ocr.js';

afterAll(async () => {
  await terminateOcrWorker();
});

describe('Timemark OCR integration', () => {
  it(
    'reads the generated Timemark photo with Tesseract',
    async () => {
      const fixtures = await ensureFixtures();
      const result = await extractTimemarkFromFile(fixtures.images[0]!);
      expect(result.extraction.timeText).toBe('08:43');
      expect(result.extraction.dateText).toBe('Selasa, 27/10/2026');
      expect(result.extraction.unitName).toMatch(/Satlantas Polres Sikka/);
      expect(result.extraction.latitude).toBeCloseTo(-8.619101, 5);
      expect(result.extraction.longitude).toBeCloseTo(122.217334, 5);
      expect(result.extraction.confidence).toBeGreaterThan(70);
      expect(result.ocrText).toContain('TIMEMARK');
      expect(result.aiUsed).toBe(false);
    },
    180_000
  );
});
