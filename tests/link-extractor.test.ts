import { describe, expect, it } from 'vitest';
import {
  classifyUrl,
  extractLinks,
  extractSprinNumber,
  normalizeUrl,
  stripLinks
} from '../server/services/links/extractor.js';

describe('Link extractor & classifier', () => {
  it('extracts multiple platforms and strips trailing punctuation', () => {
    const links = extractLinks(
      'Laporan: https://www.instagram.com/reel/ABC123/?igsh=xyz, cek https://vt.tiktok.com/ZS123/ dan https://x.com/user/status/123.'
    );
    expect(links).toHaveLength(3);
    expect(links[0]?.platform).toBe('Instagram');
    expect(links[0]?.normalizedUrl).toBe('https://www.instagram.com/reel/ABC123');
    expect(links[1]?.platform).toBe('TikTok');
    expect(links[2]?.platform).toBe('X / Twitter');
  });

  it('normalizes YouTube short links and removes tracking parameters', () => {
    expect(normalizeUrl('https://youtu.be/aqz-KE-bpKQ?si=tracking')).toBe(
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ'
    );
    expect(
      normalizeUrl('https://www.instagram.com/p/ABC/?utm_source=wa&utm_medium=social')
    ).toBe('https://www.instagram.com/p/ABC');
  });

  it('classifies drive, maps, news and generic websites', () => {
    expect(classifyUrl('https://drive.google.com/drive/folders/abc').platform).toBe('Google Drive');
    expect(classifyUrl('https://maps.app.goo.gl/abc').platform).toBe('Google Maps');
    expect(classifyUrl('https://www.antaranews.com/berita/123/tim').platform).toBe('Portal Berita');
    expect(classifyUrl('https://example.com/laporan').platform).toBe('Website');
  });

  it('deduplicates the same link in one message', () => {
    const url = 'https://www.tiktok.com/@sigap/video/123';
    expect(extractLinks(`${url} ${url}`)).toHaveLength(1);
  });

  it('extracts Sprin numbers and removes links from captions', () => {
    expect(extractSprinNumber('Mohon cek Sprin/1806/X/KEP./2026 hari ini')).toBe(
      'Sprin/1806/X/KEP./2026'
    );
    expect(stripLinks('Dokumentasi https://example.com/foto selesai')).toBe('Dokumentasi selesai');
  });
});
