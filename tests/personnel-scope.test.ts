import { describe, expect, it } from 'vitest';
import { PersonnelDirectory } from '../server/services/personnel-directory.js';
import { isSatlantasPersonnel } from '../server/services/personnel-scope.js';

describe('batas personel Satlantas', () => {
  it('menerima personel Satlantas dari jabatan atau unit', () => {
    expect(
      isSatlantasPersonnel({
        name: 'TATAN ALAM AKBAR',
        jabatan: 'BANIT GAKKUM SATLANTAS',
        unit: 'SATLANTAS'
      })
    ).toBe(true);
    expect(
      isSatlantasPersonnel({
        name: 'ANGGOTA REGIDENT',
        jabatan: 'ANGGOTA REGIDENT',
        unit: 'SATLANTAS'
      })
    ).toBe(true);
    expect(
      isSatlantasPersonnel({
        name: 'KASAT LANTAS',
        jabatan: 'KASAT LANTAS',
        unit: null
      })
    ).toBe(true);
  });

  it('menolak personel Polsek meskipun kolom unit default Satlantas', () => {
    expect(
      isSatlantasPersonnel({
        name: 'TATANG',
        jabatan: 'BA POLSEK KARANGREJO',
        unit: 'SATLANTAS'
      })
    ).toBe(false);
  });

  it('menolak personel tanpa jejak Satlantas', () => {
    expect(isSatlantasPersonnel({ name: 'TATANG', jabatan: null, unit: null })).toBe(false);
  });

  it('tidak membiarkan TATANG Polsek mengalahkan TATAN Satlantas', () => {
    const people = [
      {
        id: 'tatan',
        name: 'TATAN ALAM AKBAR',
        rank: 'BRIPTU',
        phone: '6281216115809',
        jabatan: 'BANIT GAKKUM SATLANTAS',
        unit: 'SATLANTAS'
      },
      {
        id: 'tatang',
        name: 'TATANG',
        rank: 'AIPDA',
        phone: '6280000000000',
        jabatan: 'BA POLSEK KARANGREJO',
        unit: 'SATLANTAS'
      }
    ];
    const directory = new PersonnelDirectory(people.filter(isSatlantasPersonnel));
    expect(directory.resolve('TATANG')?.name).toBe('TATAN ALAM AKBAR');
  });
});
