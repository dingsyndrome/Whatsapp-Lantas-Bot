import puppeteer from 'puppeteer';

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

const textOf = async (selector) =>
  page.$eval(selector, (element) => element.textContent?.trim() ?? '').catch(() => '');

// 1) Filter kategori dari query string.
await page.goto('http://127.0.0.1:3000/timemark?type=PATROLI', {
  waitUntil: 'networkidle2'
});
await new Promise((resolve) => setTimeout(resolve, 1000));
const patrolCards = await page.$$('main button.group.overflow-hidden');
if (patrolCards.length !== 1) {
  throw new Error(`Filter PATROLI harus menampilkan 1 kartu, ditemukan ${patrolCards.length}`);
}
console.log('✓ Filter query Turjawali menampilkan 1 kartu Patroli');

// 2) Override kategori manual dari dialog detail.
await patrolCards[0].click();
await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
await new Promise((resolve) => setTimeout(resolve, 700));
await page.$eval('#override-turjawali', (element) => element.click());
await new Promise((resolve) => setTimeout(resolve, 700));
const optionCount = await page.$$eval('[role="option"]', (elements) => elements.length);
if (optionCount === 0) {
  console.log('DEBUG dialog', (await textOf('[role="dialog"]')).slice(0, 500));
  throw new Error('Dropdown kategori tidak membuka opsi');
}
await page.waitForSelector('[role="option"]', { timeout: 5000 });
const options = await page.$$('[role="option"]');
let pengawalanSelected = false;
for (const option of options) {
  const text = await page.evaluate((element) => element.textContent?.trim(), option);
  if (text === 'Pengawalan (Wal)') {
    await option.click();
    pengawalanSelected = true;
    break;
  }
}
if (!pengawalanSelected) throw new Error('Opsi Pengawalan tidak ditemukan');
const saveButton = await page.$$('button');
let saveClicked = false;
for (const button of saveButton) {
  const text = await page.evaluate((element) => element.textContent?.trim(), button);
  if (text === 'Simpan & rematch') {
    await button.click();
    saveClicked = true;
    break;
  }
}
if (!saveClicked) throw new Error('Tombol Simpan & rematch tidak ditemukan');
await new Promise((resolve) => setTimeout(resolve, 1800));
const dialogText = await textOf('[role="dialog"]');
if (!dialogText.includes('Pengawalan')) {
  throw new Error(`Dialog tidak menampilkan kategori Pengawalan: ${dialogText.slice(0, 300)}`);
}
console.log('✓ Override manual kategori dan rematch berhasil');
await page.keyboard.press('Escape');
await new Promise((resolve) => setTimeout(resolve, 300));

// 3) Ubah toleransi waktu dari halaman Settings.
await page.goto('http://127.0.0.1:3000/settings', { waitUntil: 'networkidle2' });
await new Promise((resolve) => setTimeout(resolve, 900));
const tabs = await page.$$('[role="tab"]');
let turjawaliTabClicked = false;
for (const tab of tabs) {
  const text = await page.evaluate((element) => element.textContent?.trim(), tab);
  if (text === 'Turjawali') {
    await tab.click();
    turjawaliTabClicked = true;
    break;
  }
}
if (!turjawaliTabClicked) throw new Error('Tab Turjawali tidak ditemukan');
await new Promise((resolve) => setTimeout(resolve, 500));
await page.click('#time-tolerance', { clickCount: 3 });
await page.keyboard.type('65');
const buttons = await page.$$('button');
for (const button of buttons) {
  const text = await page.evaluate((element) => element.textContent?.trim(), button);
  if (text === 'Simpan perubahan') {
    await button.click();
    break;
  }
}
await new Promise((resolve) => setTimeout(resolve, 1600));
const settingsResponse = await fetch('http://127.0.0.1:3000/api/settings');
const settings = await settingsResponse.json();
if (settings.matchTimeToleranceMinutes !== 65) {
  throw new Error(`Toleransi waktu tidak tersimpan: ${settings.matchTimeToleranceMinutes}`);
}
console.log('✓ Simpan aturan Turjawali dari UI berhasil (65 menit)');

// 4) Rematch massal dari panel Settings.
const settingsButtons = await page.$$('button');
let rematchClicked = false;
for (const button of settingsButtons) {
  const text = await page.evaluate((element) => element.textContent?.trim(), button);
  if (text === 'Cocokkan ulang') {
    await button.click();
    rematchClicked = true;
    break;
  }
}
if (!rematchClicked) throw new Error('Tombol Cocokkan ulang tidak ditemukan');
await new Promise((resolve) => setTimeout(resolve, 1800));
console.log('✓ Rematch massal dipicu dari Settings');

// 5) Toggle harian/mingguan dan dialog cakupan personel di Dashboard.
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle2' });
await new Promise((resolve) => setTimeout(resolve, 900));
const dashboardButtons = await page.$$('button');
let weeklyClicked = false;
for (const button of dashboardButtons) {
  const text = await page.evaluate((element) => element.textContent?.trim(), button);
  if (text === 'Mingguan') {
    await button.click();
    weeklyClicked = true;
    break;
  }
}
if (!weeklyClicked) throw new Error('Toggle Mingguan tidak ditemukan');
await new Promise((resolve) => setTimeout(resolve, 1400));
const dashboardText = await page.evaluate(() => document.body.innerText);
if (!dashboardText.includes('Rekap Giat Turjawali') || !dashboardText.includes('Mingguan')) {
  throw new Error('Rekap mingguan tidak tampil');
}
console.log('✓ Toggle rekap mingguan berfungsi');

const coverageButton = await page.$$('button');
let coverageClicked = false;
for (const button of coverageButton) {
  const text = await page.evaluate((element) => element.textContent?.trim(), button);
  if (text?.includes('Personel melapor') && text?.includes('/')) {
    await button.click();
    coverageClicked = true;
    break;
  }
}
if (!coverageClicked) throw new Error('Tombol cakupan personel tidak ditemukan');
await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
await new Promise((resolve) => setTimeout(resolve, 500));
const coverageText = await textOf('[role="dialog"]');
if (!coverageText.includes('Cakupan Laporan Personel') || !coverageText.includes('Belum melapor')) {
  throw new Error(`Dialog cakupan tidak valid: ${coverageText.slice(0, 300)}`);
}
console.log('✓ Dialog cakupan personel sudah/belum melapor tampil');
await page.keyboard.press('Escape');
await new Promise((resolve) => setTimeout(resolve, 300));

if (errors.length > 0) {
  throw new Error(`Console errors: ${errors.join(' | ')}`);
}
console.log('✓ Tidak ada console error');
await browser.close();
