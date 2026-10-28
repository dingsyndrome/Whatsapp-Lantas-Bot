import fs from 'node:fs/promises';
import puppeteer from 'puppeteer';

await fs.mkdir('test-output', { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(error.message));

await page.goto('http://127.0.0.1:3000/timemark', { waitUntil: 'networkidle2' });
await new Promise((resolve) => setTimeout(resolve, 800));
await page.click('button.group.overflow-hidden');
await new Promise((resolve) => setTimeout(resolve, 700));
await page.screenshot({ path: 'test-output/timemark-detail.png' });
console.log('TM DIALOG', await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]'))));

await page.goto('http://127.0.0.1:3000/sprin', { waitUntil: 'networkidle2' });
await new Promise((resolve) => setTimeout(resolve, 800));
await page.click('button.group.w-full');
await new Promise((resolve) => setTimeout(resolve, 1200));
await page.screenshot({ path: 'test-output/sprin-detail.png' });
console.log('SPRIN DIALOG', await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]'))));
const tabs = await page.$$('[role="dialog"] [role="tab"]');
if (tabs[1]) {
  await tabs[1].click();
  await new Promise((resolve) => setTimeout(resolve, 700));
  await page.screenshot({ path: 'test-output/sprin-personel.png' });
}

await page.goto('http://127.0.0.1:3000/settings', { waitUntil: 'networkidle2' });
await new Promise((resolve) => setTimeout(resolve, 800));
const settingsTabs = await page.$$('[role="tab"]');
for (let index = 1; index < settingsTabs.length; index += 1) {
  const label = await page.evaluate((element) => element.textContent, settingsTabs[index]);
  await settingsTabs[index].click();
  await new Promise((resolve) => setTimeout(resolve, 500));
  await page.screenshot({ path: `test-output/settings-tab-${index}.png` });
  console.log('SETTINGS TAB', index, label?.trim());
}

await page.goto('http://127.0.0.1:3000/links', { waitUntil: 'networkidle2' });
await new Promise((resolve) => setTimeout(resolve, 700));
await page.screenshot({ path: 'test-output/links-full.png', fullPage: true });

console.log('ERRORS', JSON.stringify(errors, null, 2));
await browser.close();
