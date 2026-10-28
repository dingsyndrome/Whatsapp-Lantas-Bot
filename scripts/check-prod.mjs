const base = process.argv[2] ?? 'http://127.0.0.1:3001';

async function check(path) {
  const res = await fetch(base + path);
  const text = await res.text();
  return { path, status: res.status, len: text.length, body: text };
}

const health = await check('/api/health');
console.log('HEALTH', health.status, health.body.slice(0, 160));

const root = await check('/');
const bundle = root.body.match(/assets\/index-[^"]+\.(js|css)/g);
console.log('ROOT', root.status, 'len=' + root.len, 'hasSIGAP=' + root.body.includes('SIGAP'));
console.log('ASSETS', bundle ? bundle.join(', ') : '(none)');

const spa = await check('/timemark');
console.log('SPA /timemark', spa.status, 'len=' + spa.len, 'isHtml=' + spa.body.startsWith('<!doctype html>'));

const api404 = await check('/api/does-not-exist');
console.log('API 404 guard', api404.status);
