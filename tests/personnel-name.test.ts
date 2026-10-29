import { describe, expect, it } from 'vitest';
import {
  formatRankName,
  rankFromRankNrp
} from '../shared/personnel-name.js';
import { PersonnelDirectory } from '../server/services/personnel-directory.js';

const roster = [
  {
    id: 'p1',
    name: 'RIZKI INDRA SUSANTO, S.A.P.',
    rank: 'BRIPTU',
    phone: '6285606611355'
  },
  {
    id: 'p2',
    name: 'YHOGA PERMANA, S.H.',
    rank: 'BRIGADIR',
    phone: '6282233789884'
  },
  {
    id: 'p3',
    name: 'RYAN MUSTOFA',
    rank: 'BRIPTU',
    phone: '6281357280425'
  },
  {
    id: 'p4',
    name: 'PUTRA MOH. FATIQUNNADA',
    rank: 'BRIGADIR',
    phone: '6285784404304'
  },
  {
    id: 'p5',
    name: 'ARI EKO ISWOYO',
    rank: 'AIPTU',
    phone: '628125157884'
  },
  {
    id: 'p6',
    name: 'ANDI WISNU WARDANI',
    rank: 'BRIPTU',
    phone: '6285790475670'
  },
  {
    id: 'p7',
    name: 'ANDI SISCA',
    rank: 'BRIPKA',
    phone: '6285235109972'
  },
  {
    id: 'p8',
    name: 'GERRY PERMANA, S.H.',
    rank: 'IPDA',
    phone: '628563639888'
  },
  {
    id: 'p9',
    name: 'HEKY WIYONO',
    rank: 'AIPTU',
    phone: '6282143783123'
  },
  {
    id: 'p10',
    name: 'WAHYU PRIBADI',
    rank: 'BRIPKA',
    phone: '6281234567890'
  }
];

describe('format pangkat dan nama', () => {
  it('menggabungkan pangkat dengan nama tanpa gelar', () => {
    expect(formatRankName('BRIPTU', 'RIZKI INDRA SUSANTO, S.A.P.')).toBe(
      'BRIPTU RIZKI INDRA SUSANTO'
    );
    expect(formatRankName('BRIGADIR', 'YHOGA PERMANA, S.H.')).toBe(
      'BRIGADIR YHOGA PERMANA'
    );
  });

  it('tidak menduplikasi pangkat yang sudah ada pada nama', () => {
    expect(formatRankName('BRIPKA', 'BRIPKA ANDI SAPUTRA')).toBe('BRIPKA ANDI SAPUTRA');
  });

  it('mempertahankan nama bila pangkat belum diketahui', () => {
    expect(formatRankName(null, 'AJD')).toBe('AJD');
    expect(formatRankName(null, 'BRIPKA ANDI SAPUTRA')).toBe('BRIPKA ANDI SAPUTRA');
  });

  it('mengambil pangkat dari kolom PANGKAT/NRP', () => {
    expect(rankFromRankNrp('BRIPTU/99040746')).toBe('BRIPTU');
    expect(rankFromRankNrp(null)).toBeNull();
  });
});

describe('pencocokan pengirim ke roster', () => {
  const directory = new PersonnelDirectory(roster);

  it('mencocokkan nama depan dan nama lengkap', () => {
    expect(directory.label('Rizki Indra')).toBe('BRIPTU RIZKI INDRA SUSANTO');
    expect(directory.label('Yhoga Permana')).toBe('BRIGADIR YHOGA PERMANA');
    expect(directory.label('Ryan')).toBe('BRIPTU RYAN MUSTOFA');
    expect(directory.label('Ari')).toBe('AIPTU ARI EKO ISWOYO');
  });

  it('mencocokkan nama yang terpotong atau dibalik', () => {
    expect(directory.label('Fatiq Putra')).toBe('BRIGADIR PUTRA MOH. FATIQUNNADA');
  });

  it('mengabaikan angka, satuan, dan nama yang digabung tanpa spasi', () => {
    expect(directory.label('Gerry 52')).toBe('IPDA GERRY PERMANA');
    expect(directory.label('hekiwiyono07')).toBe('AIPTU HEKY WIYONO');
    expect(directory.label('Wahyupribadi')).toBe('BRIPKA WAHYU PRIBADI');
    expect(directory.label('57 SAVIRA N.P POLDA JATIM')).toBe('57 SAVIRA N.P POLDA JATIM');
  });

  it('mencocokkan nomor HP bila tersedia', () => {
    expect(directory.label('Nama Berbeda', '085606611355')).toBe(
      'BRIPTU RIZKI INDRA SUSANTO'
    );
  });

  it('tidak menebak pangkat bila nama terlalu umum atau ambigu', () => {
    expect(directory.resolve('Andi S Charisma')).toBeNull();
    expect(directory.label('AJD')).toBe('AJD');
  });
});
