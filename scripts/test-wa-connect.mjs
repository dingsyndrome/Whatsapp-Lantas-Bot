const base = 'http://127.0.0.1:3000/api';

async function json(path, options) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

const settings = await json('/settings');
console.log('Switching to webjs driver…');
await json('/settings', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ waDriver: 'webjs', aiApiKey: '' })
});

const connect = await json('/wa/connect', { method: 'POST' });
console.log('connect ->', connect.status, connect.lastError ?? '');

let status = connect;
for (let attempt = 0; attempt < 30; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  status = await json('/wa/status');
  console.log(`poll ${attempt + 1}:`, status.status, status.lastError ?? '');
  if (status.status === 'qr' || status.status === 'error' || status.status === 'connected') break;
}

console.log('QR_PRESENT', Boolean(status.qrDataUrl?.startsWith('data:image')));
console.log('PHONE', status.phone);

console.log('Restoring mock driver…');
await json('/settings', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ waDriver: 'mock', aiApiKey: '' })
});
await json('/wa/connect', { method: 'POST' });
const restored = await json('/wa/status');
console.log('restored ->', restored.status);
