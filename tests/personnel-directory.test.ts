import { describe, expect, it } from 'vitest';
import { PersonnelDirectory } from '../server/services/personnel-directory.js';

// Data nyata dari DATA_PERSONIL_SATLANTAS_2026_BOT.xlsx
const roster = [
  { id: 'p1', name: 'HERIYANTO HADI S', rank: 'BRIGADIR', phone: '628113671001' },
  { id: 'p2', name: 'ROCHMAN YUWONO, S.H.', rank: 'AIPTU', phone: '6281334128153' },
  { id: 'p3', name: 'NUR CHOLIQ CHOIRUDIN', rank: 'AIPTU', phone: '6282336422497' },
  { id: 'p4', name: 'DENY ANDRI SAPUTRO', rank: 'BRIPTU', phone: '6281249352747' },
  { id: 'p5', name: 'MUHADI', rank: 'AIPDA', phone: '6281216926652' },
  // Kasus nyata WhatsApp: nama panggilan inisial, nama tengah, dan typo 4 huruf.
  { id: 'p6', name: 'AYU FATHIKA VALBIE, SH', rank: 'BRIGADIR', phone: '6281111111111' },
  { id: 'p7', name: 'YEKTI ANDRIKA P', rank: 'BRIGADIR', phone: '6281222222222' },
  { id: 'p8', name: 'SANCOKO YEKTI W', rank: 'BRIPKA', phone: '6281333333333' },
  { id: 'p9', name: 'SAMSUL HADI,S.H.', rank: 'AIPDA', phone: '6281444444444' },
  { id: 'p10', name: 'MUHAMAD BAYU FAUZAN AKMALUDIN', rank: 'BRIPTU', phone: '6281555555555' },
  { id: 'p11', name: 'MUHAMMAD BAYU P', rank: 'BRIGADIR', phone: '6281666666666' },
  // Kasus nyata: nomor tersimpan dengan ID perangkat WhatsApp di belakangnya.
  { id: 'p12', name: 'ANDI SISCA', rank: 'BRIPKA', phone: '6285235109972' },
  { id: 'p13', name: 'IMA SAFITRI', rank: 'AIPDA', phone: '6282232604077' }
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

  it('mencocokkan nama panggilan berupa inisial (AFV → AYU FATHIKA VALBIE)', () => {
    expect(directory.resolve('AFV')?.id).toBe('p6');
  });

  it('memilih nama yang kata pertamanya cocok untuk panggilan satu kata', () => {
    // "Yekti" milik YEKTI ANDRIKA P (kata pertama), bukan SANCOKO YEKTI W.
    expect(directory.resolve('Yekti 42')?.id).toBe('p7');
  });

  it('mentoleransi typo satu huruf pada nama panggilan 4 huruf', () => {
    expect(directory.resolve('Samsoel Hady')?.id).toBe('p9');
  });

  it('tidak menebak bila panggilan satu kata sama kuat pada dua kandidat', () => {
    expect(directory.resolve('Bayu')).toBeNull();
  });

  it('mencocokkan nomor lama yang masih membawa ID perangkat WhatsApp', () => {
    expect(directory.label('Andi S Charisma', '62852351099720')).toBe(
      'BRIPKA ANDI SISCA'
    );
    expect(directory.label('Reysangga', '62822326040770')).toBe(
      'AIPDA IMA SAFITRI'
    );
  });
});
