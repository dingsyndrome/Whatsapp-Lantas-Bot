import { describe, expect, it } from 'vitest';
import type { LinkDTO } from '../shared/types.js';
import {
  buildLinkRecapText,
  isWithinTimeWindow,
  summarizeLinks
} from '../server/services/links/recap-text.js';

function sampleLink(overrides: Partial<LinkDTO> = {}): LinkDTO {
  return {
    id: 'link-1',
    messageId: null,
    senderName: 'Bripka Andi',
    senderLabel: 'BRIPKA ANDI',
    senderNumber: '628111111111',
    groupName: 'Laporan Gatur',
    url: 'https://instagram.com/p/abc',
    normalizedUrl: 'https://instagram.com/p/abc',
    platform: 'Instagram',
    category: 'Media Sosial',
    title: 'Laporan kegiatan pagi',
    receivedAt: new Date(2026, 9, 29, 8, 25, 0).toISOString(),
    status: 'valid',
    httpStatus: 200,
    verifiedAt: null,
    sprinId: null,
    sprinNumber: null,
    createdAt: new Date(2026, 9, 29, 8, 25, 0).toISOString(),
    ...overrides
  };
}

describe('rekap link anggota', () => {
  it('membuat teks hanya berisi link untuk tanggal dan rentang jam yang dipilih', () => {
    const links = [
      sampleLink(),
      sampleLink({
        id: 'link-2',
        senderName: 'Briptu Citra',
        senderLabel: 'BRIPTU CITRA',
        senderNumber: '628122222222',
        platform: 'TikTok',
        normalizedUrl: 'https://tiktok.com/@citra/video/1',
        status: 'restricted',
        receivedAt: new Date(2026, 9, 29, 9, 5, 0).toISOString()
      })
    ];

    const text = buildLinkRecapText({
      from: '2026-10-29',
      to: '2026-10-29',
      startTime: '08:20',
      endTime: '09:20',
      links
    });

    expect(text).toContain('*REKAP LINK ANGGOTA*');
    expect(text).toContain('Kamis, 29 Oktober 2026 · 08:20–09:20');
    expect(text).toContain('🔗 Total link     : *2*');
    expect(text).toContain('👤 Pengirim unik  : *2*');
    expect(text).toContain('Instagram 1 · TikTok 1');
    expect(text).toContain('*08:25* · *BRIPKA ANDI* · Instagram · Valid');
    expect(text).toContain('*09:05* · *BRIPTU CITRA* · TikTok · Dibatasi');
    expect(text).not.toContain('https://');
    expect(text).not.toContain('instagram.com');
    expect(text).toContain('✅ 1 valid');
    expect(text).toContain('⚠️ 1 dibatasi');
    expect(text).not.toContain('GATUR');
    expect(text).not.toContain('TURJAWALI');
    expect(text).not.toContain('FOTO TIMEMARK');
  });

  it('menulis keterangan kosong bila tidak ada link pada periode itu', () => {
    const text = buildLinkRecapText({
      from: '2026-10-29',
      to: '2026-10-29',
      startTime: null,
      endTime: null,
      links: []
    });

    expect(text).toContain('Kamis, 29 Oktober 2026');
    expect(text).toContain('_Tidak ada link anggota pada periode ini._');
    expect(text).toContain('🔗 Total link     : *0*');
  });

  it('menampilkan pangkat dan nama pada daftar link tidak valid', () => {
    const text = buildLinkRecapText({
      from: '2026-10-29',
      to: '2026-10-29',
      startTime: '08:20',
      endTime: '09:20',
      links: [
        sampleLink({
          status: 'invalid',
          senderLabel: 'BRIPDA MUHAMMAD ARVIN FIRDAUS'
        })
      ]
    });

    expect(text).toContain('❌ *1 LINK TIDAK VALID*');
    expect(text).toContain('1. BRIPDA MUHAMMAD ARVIN FIRDAUS · 08:25 · Instagram');
    expect(text).not.toContain('https://instagram.com/p/abc');
  });

  it('menampilkan personel non-perwira yang belum mengirim link', () => {
    const text = buildLinkRecapText({
      from: '2026-10-29',
      to: '2026-10-29',
      startTime: '08:20',
      endTime: '09:20',
      links: [],
      notSubmitted: ['BRIPTU ANDI WISNU WARDANI', 'BRIGADIR ANNA SILVIA NOVIANTI'],
      rosterTotal: 89
    });

    expect(text).toContain('*BELUM MENGIRIM LINK*');
    expect(text).toContain('1. BRIPTU ANDI WISNU WARDANI');
    expect(text).toContain('2. BRIGADIR ANNA SILVIA NOVIANTI');
    expect(text).toContain('_2 dari 89 anggota belum mengirim link · perwira dikecualikan._');
    expect(text).not.toContain('PERWIRA');
  });

  it('menyertakan catatan filter platform, status, dan pencarian', () => {
    const text = buildLinkRecapText({
      from: '2026-10-29',
      to: '2026-10-29',
      startTime: null,
      endTime: null,
      links: [sampleLink()],
      filterNote: 'Platform Instagram · Status Valid'
    });

    expect(text).toContain('_Filter: Platform Instagram · Status Valid_');
  });
});

describe('filter jam rekap link', () => {
  it('menerima batas awal dan akhir secara inklusif', () => {
    expect(isWithinTimeWindow(new Date(2026, 9, 29, 8, 20), 500, 560)).toBe(true);
    expect(isWithinTimeWindow(new Date(2026, 9, 29, 9, 20), 500, 560)).toBe(true);
    expect(isWithinTimeWindow(new Date(2026, 9, 29, 8, 19), 500, 560)).toBe(false);
    expect(isWithinTimeWindow(new Date(2026, 9, 29, 9, 21), 500, 560)).toBe(false);
  });

  it('mendukung hanya batas awal atau hanya batas akhir', () => {
    expect(isWithinTimeWindow(new Date(2026, 9, 29, 23, 0), 500, null)).toBe(true);
    expect(isWithinTimeWindow(new Date(2026, 9, 29, 5, 0), 500, null)).toBe(false);
    expect(isWithinTimeWindow(new Date(2026, 9, 29, 5, 0), null, 560)).toBe(true);
    expect(isWithinTimeWindow(new Date(2026, 9, 29, 23, 0), null, 560)).toBe(false);
  });
});

describe('ringkasan status link', () => {
  it('menghitung total, pengirim unik, platform, dan status', () => {
    const summary = summarizeLinks([
      sampleLink(),
      sampleLink({ id: '2', senderNumber: '628111111111', status: 'invalid' }),
      sampleLink({ id: '3', senderNumber: '628133333333', platform: 'TikTok', status: 'unchecked' })
    ]);

    expect(summary).toEqual({
      total: 3,
      senders: 2,
      valid: 1,
      restricted: 0,
      invalid: 1,
      unchecked: 1,
      platforms: 2
    });
  });
});
