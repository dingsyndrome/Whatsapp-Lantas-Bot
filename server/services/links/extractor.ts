export interface ExtractedLink {
  url: string;
  normalizedUrl: string;
  platform: string;
  category: string;
}

interface PlatformRule {
  platform: string;
  category: string;
  hosts: RegExp;
}

const PLATFORM_RULES: PlatformRule[] = [
  { platform: 'Instagram', category: 'Media Sosial', hosts: /(^|\.)instagram\.com$/i },
  { platform: 'TikTok', category: 'Media Sosial', hosts: /(^|\.)tiktok\.com$/i },
  { platform: 'Facebook', category: 'Media Sosial', hosts: /(^|\.)(facebook\.com|fb\.watch|fb\.com)$/i },
  { platform: 'YouTube', category: 'Media Sosial', hosts: /(^|\.)(youtube\.com|youtu\.be)$/i },
  { platform: 'X / Twitter', category: 'Media Sosial', hosts: /(^|\.)(x\.com|twitter\.com|t\.co)$/i },
  { platform: 'Google Drive', category: 'Penyimpanan', hosts: /(^|\.)(drive\.google\.com|docs\.google\.com)$/i },
  { platform: 'Google Maps', category: 'Lokasi', hosts: /(^|\.)(maps\.google\.com|maps\.app\.goo\.gl)$/i },
  { platform: 'WhatsApp', category: 'Grup WhatsApp', hosts: /(^|\.)(chat\.whatsapp\.com|wa\.me)$/i },
  {
    platform: 'Portal Berita',
    category: 'Berita',
    hosts:
      /(^|\.)(detik\.com|kompas\.com|tribunnews\.com|antaranews\.com|liputan6\.com|cnnindonesia\.com|tempo\.co|kumparan\.com|suarapapua\.com|poskupang\.com|floresa\.co|radarsikka\.com|beritasatu\.com|jpnn\.com|okezone\.com|sindonews\.com)$/i
  },
  { platform: 'TikTok', category: 'Media Sosial', hosts: /(^|\.)vt\.tiktok\.com$/i }
];

const URL_RE =
  /(https?:\/\/[^\s<>"']+|(?:www\.)[^\s<>"']+|\b(?:instagram|tiktok|facebook|youtube|youtu|drive\.google|docs\.google|maps\.google|chat\.whatsapp|detik|kompas|tribunnews|antaranews|liputan6|cnnindonesia|suarapapua|poskupang|floresa)\.[^\s<>"']+)/gi;

function trimUrl(raw: string): string {
  let value = raw.trim();
  value = value.replace(/[)\]}>.,;:!?'"]+$/g, '');
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value;
}

export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(trimUrl(raw));
    url.hash = '';
    const dropParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'igsh',
      'igshid',
      'fbclid',
      'gclid',
      'si',
      'ref',
      'ref_src'
    ];
    for (const param of dropParams) url.searchParams.delete(param);
    if (/youtu\.be$/i.test(url.hostname)) {
      return `https://www.youtube.com/watch?v=${url.pathname.replace(/^\//, '')}`;
    }
    url.hostname = url.hostname.toLowerCase();
    let pathname = url.pathname.replace(/\/+$/, '');
    if (!pathname) pathname = '/';
    return `${url.protocol}//${url.hostname}${pathname}${url.search}`;
  } catch {
    return raw.trim();
  }
}

export function classifyUrl(normalizedUrl: string): { platform: string; category: string } {
  try {
    const host = new URL(normalizedUrl).hostname;
    const match = PLATFORM_RULES.find((rule) => rule.hosts.test(host));
    if (match) return { platform: match.platform, category: match.category };
    if (/goo\.gl$/i.test(host)) return { platform: 'Google Maps', category: 'Lokasi' };
    return { platform: 'Website', category: 'Lainnya' };
  } catch {
    return { platform: 'Website', category: 'Lainnya' };
  }
}

export function extractLinks(text: string): ExtractedLink[] {
  if (!text) return [];
  const results: ExtractedLink[] = [];
  const seen = new Set<string>();
  const matches = text.matchAll(URL_RE);
  for (const match of matches) {
    const url = trimUrl(match[0]);
    if (!/^https?:\/\//i.test(url)) continue;
    const normalizedUrl = normalizeUrl(url);
    if (seen.has(normalizedUrl)) continue;
    let parsed: URL;
    try {
      parsed = new URL(normalizedUrl);
    } catch {
      continue;
    }
    if (!parsed.hostname.includes('.')) continue;
    seen.add(normalizedUrl);
    const classification = classifyUrl(normalizedUrl);
    results.push({ url, normalizedUrl, ...classification });
  }
  return results;
}

export function stripLinks(text: string): string {
  return text
    .replace(URL_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function extractSprinNumber(text: string): string | null {
  const match = text.match(/Sprin\s*\/\s*[A-Za-z0-9.]+(?:\s*\/\s*[A-Za-z0-9.]+){1,6}/i);
  return match ? match[0].replace(/\s*\/\s*/g, '/') : null;
}
