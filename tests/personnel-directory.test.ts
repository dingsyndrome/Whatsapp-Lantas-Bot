import { describe, expect, it } from 'vitest';
import { PersonnelDirectory } from '../server/services/personnel-directory.js';

// Data nyata dari DATA_PERSONIL_SATLANTAS_2026_BOT.xlsx
const roster = [
  { id: 'p1', name: 'HERIYANTO HADI S', rank: 'BRIGADIR', phone: '628113671001' },
  { id: 'p2', name: 'ROCHMAN YUWONO, S.H.', rank: 'AIPTU', phone: '6281334128153' },
  { id: 'p3', name: 'NUR CHOLIQ CHOIRUDIN', rank: 'AIPTU', phone: '6282336422497' },
  { id: 'p4', name: 'DENY ANDRI SAPUTRO', rank: 'BRIPTU', phone: '6281249352747' },
  { id: 'p5', name: 'MUHADI', rank: 'AIPDA', phone: '6281216926652' }
];

const directory = new PersonnelDirectory(roster);

describe('pencocokan nama personel Sprin ke roster', () => {
  it('cocokkan nama satu kata ke nama lengkap roster', () => {
    expect(directory.resolve('HERIYANTO')?.id).toBe('p1');
    expect(directory.resolve('MUHADI')?.id).toBe('p5');
  });

  it('cocokkan nama dengan selisih satu huruf', () => {
    expect(directory.resolve('ROHMAN YUWONO')?.id).toBe('p2');
    expect(directory.resolve('NUR CHOLIK')?.id).toBe('p3');
  });

  it('cocokkan nama yang disingkat di Sprin', () => {
    expect(directory.resolve('DENY ANDRI S')?.id).toBe('p4');
  });

  it('tidak menebak nama yang tidak ada di roster', () => {
    expect(directory.resolve('ORANG TIDAK DIKENAL')).toBeNull();
  });

  it('label memakai pangkat dan nama roster', () => {
    expect(directory.label('NUR CHOLIK')).toBe('AIPTU NUR CHOLIQ CHOIRUDIN');
  });
});
