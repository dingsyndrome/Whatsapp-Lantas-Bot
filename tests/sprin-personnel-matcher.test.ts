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
  { id: 'waras', name: 'WARAS ALI HARTONO', nrp: '83021043', phone: '6281335169348' },
  { id: 'ari', name: 'ARI EKO ISWOYO', nrp: '82030205', phone: '628125157884' },
  { id: 'vendhi', name: 'VENDHI KRISTANTO', nrp: '90010101', phone: '6281335001732' },
  { id: 'adi', name: 'D.V. ADI NUGROHO', nrp: '78090227', phone: '6282141429110' },
  { id: 'arvin', name: 'MUHAMMAD ARVIN FIRDAUS', nrp: '03040258', phone: '6285745345866' },
  { id: 'denna', name: 'DENNA ARIEF MUTAQIEN', nrp: '85010101', phone: '6281330950186' },
  { id: 'kikis', name: 'KIKIS AGUNG D.H', nrp: '87050180', phone: '6281331194224' },
  { id: 'rochman', name: 'ROCHMAN YUWONO, S.H.', nrp: '75010101', phone: '6281334128153' },
  { id: 'miftah', name: 'MOH MIFTAHURROHMAN', nrp: '83051315', phone: '6282140809080' },
  { id: 'reza', name: 'M. REZA MAHENDRA ARFIANSYAH, S.H.', nrp: '01010101', phone: '6285748505708' },
  { id: 'yuli', name: 'YULI SUDIBYO, S.H.', nrp: '79010101', phone: '628128139484' },
  { id: 'yulig', name: 'YULIGIANTORO, S.H.', nrp: '79020202', phone: '6281234567890' }
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
      'NURSAID, S.H.'
    ];

    for (const name of wrongNames) {
      expect(matchSprinRosterPerson({ name, nrp: null }, index), name).toBeNull();
    }
  });

  it('matches clear abbreviation patterns with all tokens covered', () => {
    const index = buildSprinRosterIndex(roster);
    const cases: Array<[string, string]> = [
      ['ARI EKO', 'ari'],
      ['VENDHI K', 'vendhi'],
      ['ADI NUGROHO', 'adi'],
      ['M. ARVIN FIRDAUS', 'arvin'],
      ['DENNA ARIF', 'denna'],
      ['KIKIS AGUNG DWI HS.,S.H.', 'kikis'],
      ['ROHMAN YUWONO', 'rochman'],
      ['MIFTAHUROHMAN', 'miftah'],
      ['NUR CHOLIK', 'nurcholiq'],
      ['YULI', 'yuli']
    ];
    for (const [name, id] of cases) {
      expect(matchSprinRosterPerson({ name, nrp: null }, index), name).toMatchObject({
        method: 'name-abbrev',
        person: { id }
      });
    }
  });

  it('does not match a long single token to a different initial', () => {
    const index = buildSprinRosterIndex(roster.filter((person) => person.id !== 'miftah'));
    expect(matchSprinRosterPerson({ name: 'MIFTAHUROHMAN', nrp: null }, index)).toBeNull();
  });

  it('does not let a short first-name prefix steal another person', () => {
    const index = buildSprinRosterIndex(roster);
    expect(matchSprinRosterPerson({ name: 'YULI SUDIBYO', nrp: null }, index)).toMatchObject({
      method: 'name',
      person: { id: 'yuli' }
    });
    expect(matchSprinRosterPerson({ name: 'NURSAID', nrp: null }, index)).toBeNull();
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
