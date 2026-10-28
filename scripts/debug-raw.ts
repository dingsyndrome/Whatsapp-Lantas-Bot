import fs from 'node:fs/promises';
import { ensureFixtures } from './fixture-generator.js';
import { extractPdf } from '../server/services/documents/sprin-reader.js';

const fixtures = await ensureFixtures();
const buffer = await fs.readFile(fixtures.pdf);
const { pages, rawText } = await extractPdf(buffer);
console.log('PAGES', pages.length);
for (const [index, page] of pages.entries()) {
  console.log(`\n===== PAGE ${index + 1} =====\n${page}`);
}
console.log('\n===== RAW ABOUT CANDIDATES =====');
console.log(
  [...rawText.matchAll(/(?:Perihal|Tentang)\s*:?\s*([^\n]+)/gi)].map((match) => ({
    index: match.index,
    full: match[0],
    group: match[1]
  }))
);
console.log(
  [...rawText.matchAll(/(?:Pada\s+)?Tanggal\s*:?\s*([^\n]+)/gi)].map((match) => ({
    index: match.index,
    full: match[0]
  }))
);
