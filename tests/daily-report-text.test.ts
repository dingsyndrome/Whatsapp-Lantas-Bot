import { describe, expect, it } from 'vitest';
import type { LinkDTO, TurjawaliRecap } from '../shared/types.js';
import { buildWaText, type DailyBundle } from '../server/services/export-service.js';

function link(overrides: Partial<LinkDTO> = {}): LinkDTO {
  return {
    id: 'link-1',
    messageId: null,
    senderName: 'Rizki Indra',
    senderLabel: 'BRIPTU RIZKI INDRA SUSANTO',
    senderNumber: '187209101623464',
    groupName: 'Laporan',
    url: 'https://instagram.com/p/abc',
    normalizedUrl: 'https://instagram.com/p/abc',
    platform: 'Instagram',
    category: 'Media Sosial',
    title: 'Laporan pagi',
    receivedAt: new Date(2026, 9, 29, 8, 25, 0).toISOString(),
    status: 'invalid',
    httpStatus: 404,
    verifiedAt: null,
    sprinId: null,
    sprinNumber: null,
    createdAt: new Date(2026, 9, 29, 8, 25, 0).toISOString(),
    ...overrides
  };
}

const emptyTurjawali: TurjawaliRecap = {
  period: 'daily',
  date: '2026-10-29',
  from: '2026-10-29T00:00:00.000Z',
  to: '2026-10-29T23:59:59.999Z',
  label: 'Kamis, 29 Oktober 2026',
  totalPhotos: 0,
  matchedPhotos: 0,
  partialPhotos: 0,
  unmatchedPhotos: 0,
  otherPhotos: 0,
  categories: [],
  personnel: { active: 0, reported: 0, pending: 0, details: [] },
  supervisions: { total: 0, uniqueOfficers: 0, items: [] }
};

function bundle(links: LinkDTO[]): DailyBundle {
  return {
    date: '2026-10-29',
    title: 'Kamis, 29 Oktober 2026',
    text: '',
    counts: { timemark: 0, links: links.length, sprin: 0, personnel: 0 },
    timemarks: [],
    links,
    sprins: [],
    turjawali: emptyTurjawali,
    personnel: [],
    linkAccountability: {
      rosterTotal: 89,
      notSubmitted: ['BRIPTU ANDI WISNU WARDANI']
    }
  };
}

describe('teks rekap harian WhatsApp', () => {
  it('memakai format pangkat dan nama tanpa menampilkan URL link', () => {
    const text = buildWaText(bundle([link()]));

    expect(text).toContain(
      '[Instagram] BRIPTU RIZKI INDRA SUSANTO — 29/10 08:25'
    );
    expect(text).not.toContain('https://instagram.com/p/abc');
    expect(text).toContain('❌ *1 LINK TIDAK VALID*');
    expect(text).toContain('1. BRIPTU RIZKI INDRA SUSANTO · Instagram · 29/10 08:25');
    expect(text).toContain('*BELUM MENGIRIM LINK*');
    expect(text).toContain('1. BRIPTU ANDI WISNU WARDANI');
    expect(text).toContain('_1 dari 89 anggota belum mengirim link · perwira dikecualikan._');
  });

  it('tetap menampilkan link valid tanpa URL', () => {
    const text = buildWaText(bundle([link({ status: 'valid', httpStatus: 200 })]));

    expect(text).toContain('[Instagram] BRIPTU RIZKI INDRA SUSANTO — 29/10 08:25');
    expect(text).not.toContain('LINK TIDAK VALID');
    expect(text).not.toContain('https://');
  });
});
