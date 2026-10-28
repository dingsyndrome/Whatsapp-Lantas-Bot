import fs from 'node:fs/promises';
import puppeteer from 'puppeteer';

const base = process.env.SIGAP_URL ?? 'http://127.0.0.1:3005';
const outDir = process.env.SIGAP_SHOT_DIR ?? 'test-output';

await fs.mkdir(outDir, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']
});

const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(base + '/', { waitUntil: 'networkidle2', timeout: 60_000 });
await new Promise((r) => setTimeout(r, 1500));
const text = await page.evaluate(() => document.body.innerText);
console.log('TITLE', await page.title());
console.log('HAS_TURJAWALI', text.includes('Rekap Giat Turjawali'));
console.log('KPI_LINES', text.split('\n').filter((l) => /^\d+$/.test(l.trim())).slice(0, 6).join(','));
await page.screenshot({ path: `${outDir}/docker-dashboard.png`, fullPage: true });

for (const route of ['/timemark', '/sprin', '/links', '/settings']) {
  await page.goto(base + route, { waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 700));
  const heading = await page.evaluate(() => document.querySelector('h1,h2')?.textContent?.trim() ?? '');
  console.log('ROUTE', route, '->', heading);
  await page.screenshot({ path: `${outDir}/docker${route.replaceAll('/', '-')}.png` });
}

console.log('CONSOLE_ERRORS', JSON.stringify(errors));
await browser.close();
