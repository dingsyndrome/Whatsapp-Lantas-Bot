import { ensureFixtures } from './fixture-generator.js';
import { logger } from '../server/lib/logger.js';

const fixtures = await ensureFixtures();
logger.info(fixtures, 'Fixture demo berhasil dibuat');
console.log('Fixture siap:');
console.log(`- ${fixtures.images.length} foto Timemark`);
console.log(`- ${fixtures.pdf}`);
console.log(`- ${fixtures.docx}`);
