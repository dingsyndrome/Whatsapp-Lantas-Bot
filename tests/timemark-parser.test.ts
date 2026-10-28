import { describe, expect, it } from 'vitest';
import { parseTimemarkText } from '../server/services/ocr/timemark-parser.js';

describe('Timemark OCR text parser', () => {
  it('extracts time, date, address, unit and decimal coordinates', () => {
    const result = parseTimemarkText(
      `TIMEMARK
08:43
Selasa, 27/10/2026
Jl. Raya Maumere - Ende, Desa Waioti,
Kec. Alok Timur, Kab. Sikka,
Nusa Tenggara Timur
Satlantas Polres Sikka
8.619101°S, 122.217334°E`,
      95
    );

    expect(result.timeText).toBe('08:43');
    expect(result.dateText).toBe('Selasa, 27/10/2026');
    expect(result.capturedAt?.getFullYear()).toBe(2026);
    expect(result.address).toContain('Jl. Raya Maumere - Ende');
    expect(result.address).toContain('Nusa Tenggara Timur');
    expect(result.village).toBe('Waioti');
    expect(result.district).toBe('Alok Timur');
    expect(result.regency).toBe('Sikka');
    expect(result.province).toBe('Nusa Tenggara Timur');
    expect(result.unitName).toBe('Satlantas Polres Sikka');
    expect(result.coordinateText).toBe('8.619101°S, 122.217334°E');
    expect(result.latitude).toBeCloseTo(-8.619101, 6);
    expect(result.longitude).toBeCloseTo(122.217334, 6);
    expect(result.confidence).toBeGreaterThan(90);
    expect(result.warnings).toHaveLength(0);
  });

  it('supports date after day name and avoids village name as regency', () => {
    const result = parseTimemarkText(
      `07:10
05/02/2026 Kamis
Jl. Diponegoro No. 12, Kel. Kota Uneng,
Kec. Alok, Kab. Sikka,
Nusa Tenggara Timur
Satuan Lalu Lintas Polres Sikka
8.621055°S, 122.211156°E`,
      95
    );
    expect(result.dateText).toBe('Kamis, 05/02/2026');
    expect(result.village).toBe('Kota Uneng');
    expect(result.regency).toBe('Sikka');
    expect(result.unitName).toBe('Satuan Lalu Lintas Polres Sikka');
  });

  it('converts DMS coordinates and signed coordinates', () => {
    const dms = parseTimemarkText(
      `06:47
Minggu, 04/10/2026
Jl. Soekarno-Hatta, Kel. Madawat, Kec. Alok, Kab. Sikka
Regu Pengatur Satlantas Polres Sikka
8°37'08.8"S 122°13'02.4"E`,
      90
    );
    expect(dms.latitude).toBeCloseTo(-8.619111, 4);
    expect(dms.longitude).toBeCloseTo(122.217333, 4);

    const signed = parseTimemarkText(
      `06:47
Minggu, 04/10/2026
Jl. Soekarno-Hatta, Kel. Madawat, Kec. Alok, Kab. Sikka
Regu Pengatur Satlantas Polres Sikka
Koordinat: -8.619101, 122.217334`,
      90
    );
    expect(signed.latitude).toBeCloseTo(-8.619101, 6);
    expect(signed.longitude).toBeCloseTo(122.217334, 6);
  });

  it('normalizes common OCR road prefix JI. to Jl.', () => {
    const result = parseTimemarkText(
      `06:47
Minggu, 04/10/2026
JI. Soekarno-Hatta, Kel. Madawat, Kec. Alok, Kab. Sikka
Regu Pengatur Satlantas Polres Sikka
8.615470°S, 122.220911°E`,
      90
    );
    expect(result.address).toContain('Jl. Soekarno-Hatta');
  });
});
