import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.SIGAP_API ?? 'http://127.0.0.1:3000/api';
let passed = 0;
const cleanupTasks = [];

async function json(path, options) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${options?.method ?? 'GET'} ${path} -> ${response.status}: ${body?.error ?? 'unknown'} ${JSON.stringify(body?.details ?? '')}`);
  }
  return body;
}

function check(name, condition, extra = '') {
  assert.ok(condition, `${name}${extra ? ` (${extra})` : ''}`);
  passed += 1;
  console.log(`✓ ${name}`);
}

const health = await json('/health');
check('health database ok', health.status === 'ok' && health.database === 'ok');

const stats = await json('/stats');
check('stats has 4 timemark total', stats.totalTimemark >= 4);
check('stats has active sprin', stats.activeSprin >= 2);
check('stats has links', stats.totalLinks >= 8);
check('weekly has 7 points', stats.weekly.length === 7);
check('turjawali categories', stats.turjawali.categories.length === 4);
check(
  'turjawali demo distribution',
  stats.turjawali.matchedPhotos >= 2 && stats.turjawali.unmatchedPhotos >= 1
);

const timemarks = await json('/timemark?pageSize=10');
check('timemark list', timemarks.items.length >= 4 && timemarks.total >= 4);
check('timemark fields parsed', Boolean(timemarks.items[0].timeText && timemarks.items[0].coordinateText));
check(
  'timemark turjawali fields',
  timemarks.items.every(
    (item) =>
      item.turjawaliType &&
      item.matchStatus &&
      typeof item.matchScore === 'number' &&
      'matchNotes' in item
  )
);
const patroli = await json('/timemark?turjawaliType=PATROLI&matchStatus=UNMATCHED&pageSize=10');
check('timemark turjawali filter', patroli.total >= 1 && patroli.items[0].turjawaliType === 'PATROLI');
const recap = await json('/timemark/turjawali-recap?period=daily');
check('turjawali recap endpoint', recap.categories.length === 4 && recap.totalPhotos >= 4);
check(
  'turjawali personnel report state',
  recap.personnel.active >= 1 && recap.personnel.reported >= 1
);
const weeklyRecap = await json('/timemark/turjawali-recap?period=weekly');
check('turjawali weekly recap', weeklyRecap.period === 'weekly' && weeklyRecap.categories.length === 4);
const rematch = await json('/timemark/rematch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ scope: 'both' })
});
check('turjawali mass rematch', rematch.processed >= 1 && rematch.failed === 0);

const sprins = await json('/sprin?pageSize=10');
check('sprin list', sprins.total >= 2);
check(
  'sprin turjawali classified',
  sprins.items.every((item) => item.turjawaliType && item.turjawaliType !== '')
);
const detail = await json(`/sprin/${sprins.items[0].id}`);
check('sprin personnel multi-page', detail.personnel.length === 24);
check('sprin metadata', Boolean(detail.number && detail.signatory && detail.activityDate));
check('sprin turjawali detail', Boolean(detail.turjawaliType));

const links = await json('/links?pageSize=10');
check('link list', links.total >= 8);
const summary = await json('/links/summary');
check('link summary', summary.total >= 8 && summary.senders >= 6 && summary.platforms.length >= 6);

const wa = await json('/wa/status');
check('wa status mock', wa.status === 'mock' && wa.isMock);

const settings = await json('/settings');
check('settings has prompts', settings.timemarkPrompt.length > 50 && settings.documentPrompt.length > 50);
check('settings has groups', settings.groups.length >= 3);

// Upload image and run the real OCR pipeline.
const imageBuffer = await fs.readFile('storage/demo/timemark-1.jpg');
const imageForm = new FormData();
imageForm.append('file', new File([imageBuffer], 'smoke-timemark.jpg', { type: 'image/jpeg' }));
imageForm.append('senderName', 'Smoke Tester');
imageForm.append('senderNumber', '6280000000001');
const uploadedPhoto = await json('/timemark/analyze', { method: 'POST', body: imageForm });
check('upload + OCR time', uploadedPhoto.item.timeText === '08:43', uploadedPhoto.item.status);
check('upload + OCR unit', /Satlantas Polri|Satlantas Polres Sikka/i.test(uploadedPhoto.item.unitName ?? ''), uploadedPhoto.item.unitName);
check('upload + OCR coordinate', uploadedPhoto.item.latitude !== null && uploadedPhoto.item.longitude !== null);
check('upload + OCR address', /Maumere/i.test(uploadedPhoto.item.address ?? ''), uploadedPhoto.item.address);
check(
  'upload + turjawali classification',
  uploadedPhoto.item.turjawaliType === 'PENGATURAN' &&
    ['MATCHED', 'PARTIAL_MATCH', 'UNMATCHED'].includes(uploadedPhoto.item.matchStatus),
  `${uploadedPhoto.item.turjawaliType}/${uploadedPhoto.item.matchStatus}`
);
const overridden = await json(`/timemark/${uploadedPhoto.item.id}/turjawali`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ turjawaliType: 'PATROLI' })
});
check('manual turjawali override', overridden.turjawaliType === 'PATROLI');
cleanupTasks.push(() => json(`/timemark/${uploadedPhoto.item.id}`, { method: 'DELETE' }));

// Upload PDF and test multi-page personnel parsing.
const pdfBuffer = await fs.readFile('storage/demo/sprin-1806.pdf');
const pdfForm = new FormData();
pdfForm.append('file', new File([pdfBuffer], 'smoke-sprin.pdf', { type: 'application/pdf' }));
pdfForm.append('senderName', 'Smoke Tester');
const uploadedSprin = await json('/sprin/upload', { method: 'POST', body: pdfForm });
check('upload PDF number', uploadedSprin.sprin.number === 'Sprin/1806/X/KEP./2026');
check('upload PDF personnel', uploadedSprin.sprin.personnelCount === 24);
check('upload PDF pages', uploadedSprin.pageCount === 3);

// Upload DOCX and test table parsing.
const docxBuffer = await fs.readFile('storage/demo/sprin-1833.docx');
const docxForm = new FormData();
docxForm.append('file', new File([docxBuffer], 'smoke-sprin.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
docxForm.append('senderName', 'Smoke Tester');
const uploadedDocx = await json('/sprin/upload', { method: 'POST', body: docxForm });
check('upload DOCX number', uploadedDocx.sprin.number === 'Sprin/1833/X/KEP./2026');
check('upload DOCX personnel', uploadedDocx.sprin.personnelCount === 24);

// Link ingestion through simulator.
const simLink = await json('/wa/simulate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ kind: 'links', senderName: 'Smoke Tester' })
});
check('simulate link', Array.isArray(simLink.data) && simLink.data.length === 1);
check('simulate link classifier', simLink.data[0].platform !== 'Website');
cleanupTasks.push(() => json(`/links/${simLink.data[0].id}`, { method: 'DELETE' }));

// Reports and exports.
const preview = await json('/reports/preview');
check('report preview text', preview.text.includes('SIGAP COMMAND CENTER') && preview.text.includes('LINK ANGGOTA'));
const reminder = await json('/reports/personnel-reminder', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ period: 'daily' })
});
check(
  'personnel reminder',
  reminder.sent === true &&
    reminder.pendingCount >= 1 &&
    reminder.text.includes('PENGINGAT LAPORAN PERSONEL') &&
    Boolean(reminder.target)
);

const exportsToTest = [
  ['/exports/daily.xlsx', 'spreadsheet'],
  ['/exports/daily.txt', 'text/plain'],
  ['/exports/links.csv', 'text/csv'],
  ['/exports/timemark.csv', 'text/csv'],
  ['/exports/sprin.csv', 'text/csv'],
  ['/exports/turjawali.csv', 'text/csv']
];
for (const [path, type] of exportsToTest) {
  const response = await fetch(`${base}${path}`);
  const buffer = await response.arrayBuffer();
  check(`export ${path}`, response.ok && buffer.byteLength > 200 && (response.headers.get('content-type') ?? '').includes(type), `${buffer.byteLength} bytes`);
}
const waText = await (await fetch(`${base}/exports/daily.txt`)).text();
check('daily.txt has Turjawali section', waText.includes('REKAP TURJAWALI POLANTAS') && waText.includes('PENGATURAN (GATUR)'));

// Settings update round-trip, including Turjawali rule customization.
const customKeywords = {
  ...settings.turjawaliKeywords,
  PATROLI: [...settings.turjawaliKeywords.PATROLI, 'uji patroli']
};
const updated = await json('/settings', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ...settings,
    aiApiKey: '',
    minOcrConfidence: 55,
    turjawaliKeywords: customKeywords,
    matchTimeToleranceMinutes: 75,
    gaturMorningEnd: '08:15'
  })
});
check(
  'settings turjawali update',
  updated.minOcrConfidence === 55 &&
    updated.matchTimeToleranceMinutes === 75 &&
    updated.turjawaliKeywords.PATROLI.includes('uji patroli')
);
await json('/settings', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...settings, aiApiKey: '', minOcrConfidence: 50 })
});

// Group CRUD cleanup.
const testJid = `120363999999999@g.us`;
const testGroup = await json('/settings/groups', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jid: testJid, name: 'Smoke Test Group' })
});
check('group create', testGroup.jid === testJid);
cleanupTasks.push(() => json(`/settings/groups/${testGroup.id}`, { method: 'DELETE' }));

for (const cleanup of cleanupTasks.reverse()) {
  try {
    await cleanup();
  } catch (error) {
    console.warn('cleanup failed', error.message);
  }
}

console.log(`\n${passed} smoke assertions passed.`);
