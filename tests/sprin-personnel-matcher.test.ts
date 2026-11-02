import { describe, expect, it } from 'vitest';
import {
  buildSprinRosterIndex,
  matchSprinRosterPerson
} from '../server/services/sprin-personnel-matcher.js';

const roster = [
  { id: 'heri', name: 'HERIYANTO HADI S', nrp: '92010120', phone: '628113671001' },
  { id: 'suwanto', name: 'SUWANTO', nrp: '80060939', phone: '6281232018960' },
  { id: 'budi', name: 'BUDI SETIONO', nrp: '87010679', phone: '6285235867499' },
  { id: 'ilham', name: 'ILHAM YUZRIL ARFANI, S.H.', nrp: '98100195', phone: '6281334302758' },
  { id: 'nurcholiq', name: 'NUR CHOLIQ CHOIRUDIN', nrp: '76070671', phone: '6282336422497' },
  { id: 'waras', name: 'WARAS ALI HARTONO', nrp: '83021043', phone: '6281335169348' }
];

describe('strict Sprin personnel matching', () => {
  it('does not fuzzy-match names that belong to different people', () => {
    const index = buildSprinRosterIndex(roster);
    const wrongNames = [
      'KARIYANTO',
      'DANANG RYAN SUSANTO',
      'SUTIKNO, S.H.',
      'ALI SODIK',
      'ILHAM NURCAHYA ARIEF MUJI',
      'NUR CHOLIK'
    ];

    for (const name of wrongNames) {
      expect(matchSprinRosterPerson({ name, nrp: null }, index), name).toBeNull();
    }
  });

  it('matches an exact normalized full name only', () => {
    const index = buildSprinRosterIndex(roster);
    expect(matchSprinRosterPerson({ name: 'BUDI SETIONO', nrp: null }, index)).toMatchObject({
      method: 'name',
      person: { id: 'budi', phone: '6285235867499' }
    });
    expect(
      matchSprinRosterPerson({ name: 'ILHAM YUZRIL ARFANI', nrp: null }, index)
    ).toMatchObject({ method: 'name', person: { id: 'ilham' } });
  });

  it('uses NRP as the source of truth when present', () => {
    const index = buildSprinRosterIndex(roster);
    expect(
      matchSprinRosterPerson({ name: 'NAMA DI SPRIN BERBEDA', nrp: '87010679' }, index)
    ).toMatchObject({ method: 'nrp', person: { id: 'budi' } });
    expect(
      matchSprinRosterPerson({ name: 'BUDI SETIONO', nrp: '99999999' }, index)
    ).toBeNull();
  });

  it('does not match a duplicate exact name without NRP', () => {
    const index = buildSprinRosterIndex([
      ...roster,
      { id: 'budi-2', name: 'BUDI SETIONO', nrp: '11111111', phone: '6280000000000' }
    ]);
    expect(matchSprinRosterPerson({ name: 'BUDI SETIONO', nrp: null }, index)).toBeNull();
  });

  it('keeps NRP matching when the roster has duplicate names', () => {
    const index = buildSprinRosterIndex([
      ...roster,
      { id: 'budi-2', name: 'BUDI SETIONO', nrp: '11111111', phone: '6280000000000' }
    ]);
    expect(
      matchSprinRosterPerson({ name: 'BUDI SETIONO', nrp: '11111111' }, index)
    ).toMatchObject({ method: 'nrp', person: { id: 'budi-2' } });
  });
});
