import { describe, expect, it } from 'vitest';
import { buildCsv } from '../server/services/export-service.js';

describe('CSV export', () => {
  it('escapes commas, quotes and new lines', () => {
    const csv = buildCsv(
      ['Nama', 'Keterangan'],
      [
        ['Bripka "Andi"', 'Jl. Raya, Maumere'],
        ['Bripda Citra', 'Baris 1\nBaris 2']
      ]
    );
    expect(csv).toContain('"Bripka ""Andi"""');
    expect(csv).toContain('"Jl. Raya, Maumere"');
    expect(csv).toContain('"Baris 1\nBaris 2"');
  });
});
