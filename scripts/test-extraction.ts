import fs from 'node:fs/promises';
import { ensureFixtures } from './fixture-generator.js';
import { parseSprinDocument } from '../server/services/documents/sprin-reader.js';
import {
  extractTimemarkFromFile,
  terminateOcrWorker
} from '../server/services/ocr/timemark-ocr.js';

const fixtures = await ensureFixtures();
const runOcr = process.argv.includes('--ocr');

for (const [label, file] of [
  ['PDF', fixtures.pdf],
  ['DOCX', fixtures.docx]
] as const) {
  const buffer = await fs.readFile(file);
  const parsed = await parseSprinDocument(
    buffer,
    file,
    label === 'PDF'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  console.log(`\n=== ${label} ===`);
  console.log({
    number: parsed.number,
    about: parsed.about?.slice(0, 80),
    date: parsed.activityDate?.toISOString(),
    time: parsed.timeText,
    place: parsed.place,
    signatory: parsed.signatory,
    signatoryRank: parsed.signatoryRank,
    personnel: parsed.personnel.length,
    pages: parsed.pageCount,
    warnings: parsed.warnings
  });
  console.log('First rows:', parsed.personnel.slice(0, 2));
  console.log('Last rows:', parsed.personnel.slice(-2));
}

if (runOcr) {
  console.log('\n=== OCR FOTO TIMEMARK ===');
  try {
    for (const file of fixtures.images) {
      const result = await extractTimemarkFromFile(file);
      console.log(
        file,
        JSON.stringify(
          {
            ...result.extraction,
            rawText: result.extraction.rawText.slice(0, 400)
          },
          null,
          2
        )
      );
    }
  } finally {
    await terminateOcrWorker();
  }
}
