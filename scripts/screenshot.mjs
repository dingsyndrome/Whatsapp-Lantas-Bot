import fs from 'node:fs/promises';
import puppeteer from 'puppeteer';

const outDir = 'test-output';
await fs.mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']
});

const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
const errors = [];
const failed = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(error.message));
page.on('requestfailed', (request) => failed.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText}`));

await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle2', timeout: 60_000 });
await new Promise((resolve) => setTimeout(resolve, 1800));

console.log('TITLE', await page.title());
console.log('BODY', (await page.evaluate(() => document.body.innerText)).slice(0, 1200));
await page.screenshot({ path: `${outDir}/dashboard-dark.png`, fullPage: true });
await page.screenshot({ path: `${outDir}/dashboard-fold.png`, fullPage: false });

const routes = [
  ['timemark', '/timemark'],
  ['sprin', '/sprin'],
  ['links', '/links'],
  ['settings', '/settings']
];

for (const [name, path] of routes) {
  await page.goto(`http://127.0.0.1:3000${path}`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  console.log(`ROUTE ${path}`, (await page.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\n/g, ' | '));
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  await page.screenshot({ path: `${outDir}/${name}-fold.png`, fullPage: false });
}

// Mobile dashboard
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle2', timeout: 60_000 });
await new Promise((resolve) => setTimeout(resolve, 1000));
await page.screenshot({ path: `${outDir}/dashboard-mobile.png`, fullPage: true });

// Light mode settings
await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:3000/settings', { waitUntil: 'networkidle2', timeout: 60_000 });
await page.evaluate(() => localStorage.setItem('sigap-theme', 'light'));
await page.reload({ waitUntil: 'networkidle2' });
await new Promise((resolve) => setTimeout(resolve, 1000));
await page.screenshot({ path: `${outDir}/settings-light.png`, fullPage: true });

console.log('CONSOLE_ERRORS', JSON.stringify(errors, null, 2));
console.log('FAILED_REQUESTS', JSON.stringify(failed, null, 2));

await browser.close();
