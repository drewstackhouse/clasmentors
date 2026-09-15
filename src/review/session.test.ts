import { describe, expect, it } from 'vitest';
import { PEOPLE, PROPOSAL, person, rosterOf } from './__fixtures__/review';
import {
  caseloads,
  checkCompatibility,
  exportRows,
  nextUnreviewed,
  parseSavedSession,
  progress,
  reviewOrder,
  reviewReducer,
  serializeSession,
  startReview,
  statusOf,
  toCsv,
  type ReviewAction,
  type ReviewSession,
} from './session';

const roster = rosterOf();
const nameOf = (id: string) => roster.byId.get(id)?.name ?? id;
const start = () => startReview(structuredClone(PROPOSAL), 'import.csv', ['x1'], new Date('2026-09-15T12:00:00Z'));
const apply = (session: ReviewSession, ...actions: ReviewAction[]) =>
  actions.reduce((s, a) => reviewReducer(s, a, new Date('2026-09-15T13:00:00Z')), session);
const status = (s: ReviewSession, id: string) => statusOf(s, s.proposal.students.find((x) => x.studentId === id)!);

describe('starting a review', () => {
  it('begins with every suggestion in place and nobody reviewed', () => {
    const session = start();
    expect(session.decisions).toEqual({
      s1: { mentorId: 'm2', reviewed: false },
      s2: { mentorId: 'm1', reviewed: false },
      s3: { mentorId: null, reviewed: false },
    });
    expect(progress(session)).toMatchObject({ total: 3, reviewed: 0, unreviewed: 3 });
  });
});

describe('reviewing a student', () => {
  it('confirms the suggestion', () => {
    const session = apply(start(), { type: 'confirm', studentId: 's1' });
    expect(status(session, 's1')).toBe('confirmed');
    expect(session.decisions.s1).toEqual({ mentorId: 'm2', reviewed: true });
    expect(session.updatedAt).toBe('2026-09-15T13:00:00.000Z');
  });

  it('records a different mentor as a change, and the suggested one as a confirmation', () => {
    expect(status(apply(start(), { type: 'choose', studentId: 's1', mentorId: 'm1' }), 's1')).toBe('changed');
    expect(status(apply(start(), { type: 'choose', studentId: 's1', mentorId: 'm2' }), 's1')).toBe('confirmed');
  });

  it('allows deciding a student gets no mentor for now', () => {
    const session = apply(start(), { type: 'choose', studentId: 's2', mentorId: null });
    expect(status(session, 's2')).toBe('no-mentor');
  });

  it('lets a student with no suggestion be given one', () => {
    const session = apply(start(), { type: 'choose', studentId: 's3', mentorId: 'm3' });
    expect(status(session, 's3')).toBe('changed');
  });

  it('undoes back to the original suggestion', () => {
    const session = apply(
      start(),
      { type: 'choose', studentId: 's1', mentorId: 'm3' },
      { type: 'reset', studentId: 's1' },
    );
    expect(session.decisions.s1).toEqual({ mentorId: 'm2', reviewed: false });
    expect(status(session, 's1')).toBe('unreviewed');
  });

  it('ignores mentors outside the run and actions that change nothing', () => {
    const session = start();
    expect(apply(session, { type: 'choose', studentId: 's1', mentorId: 'nobody' })).toBe(session);
    expect(apply(session, { type: 'reset', studentId: 's1' })).toBe(session);
    expect(apply(session, { type: 'confirm', studentId: 'unknown' })).toBe(session);
  });
});

describe('caseloads', () => {
  it('combines current Airtable matches with everyone set up in this review, with no limit', () => {
    const session = apply(
      start(),
      { type: 'choose', studentId: 's1', mentorId: 'm1' },
      { type: 'choose', studentId: 's3', mentorId: 'm1' },
    );
    const loads = caseloads(session, roster);
    expect(loads.get('m1')).toEqual({ current: 1, inReview: ['s1', 's2', 's3'] });
    expect(loads.get('m2')).toEqual({ current: 0, inReview: [] });
  });
});

describe('review order', () => {
  it('puts students most in need of a look first and stays put while reviewing', () => {
    const session = start();
    const ids = (s: ReviewSession) => reviewOrder(s, nameOf).map((x) => x.studentId);
    expect(ids(session)).toEqual(['s3', 's1', 's2']);
    expect(ids(apply(session, { type: 'choose', studentId: 's2', mentorId: 'm2' }))).toEqual(['s3', 's1', 's2']);
  });

  it('moves on to the next student who hasn’t been reviewed, wrapping around', () => {
    let session = start();
    const order = reviewOrder(session, nameOf);
    expect(nextUnreviewed(order, session, null)).toBe('s3');
    expect(nextUnreviewed(order, session, 's3')).toBe('s1');
    session = apply(session, { type: 'confirm', studentId: 's1' });
    expect(nextUnreviewed(order, session, 's3')).toBe('s2');
    expect(nextUnreviewed(order, session, 's2')).toBe('s3');
    session = apply(session, { type: 'confirm', studentId: 's2' }, { type: 'choose', studentId: 's3', mentorId: null });
    expect(nextUnreviewed(order, session, 's3')).toBeNull();
  });
});

describe('exporting for Airtable', () => {
  const reviewed = () =>
    apply(start(), { type: 'confirm', studentId: 's1' }, { type: 'choose', studentId: 's2', mentorId: 'm3' });

  it('writes one row per pair, keyed on Person ID, leaving out unreviewed students by default', () => {
    expect(exportRows(reviewed(), roster, { includeUnreviewed: false })).toEqual([
      {
        'Student Person ID': 's1',
        'Student Name': 'Name s1',
        'Alumni Person ID': 'm2',
        'Alumni Name': 'Name m2',
        'Review Status': 'Confirmed',
        Closeness: '2nd closest match',
      },
      {
        'Student Person ID': 's2',
        'Student Name': 'Name s2',
        'Alumni Person ID': 'm3',
        'Alumni Name': 'Name m3',
        'Review Status': 'Changed',
        Closeness: '2nd closest match',
      },
    ]);
  });

  it('can include suggestions nobody has reviewed yet, clearly marked', () => {
    const rows = exportRows(start(), roster, { includeUnreviewed: true });
    expect(rows.map((r) => [r['Student Person ID'], r['Review Status']])).toEqual([
      ['s1', 'Not yet reviewed'],
      ['s2', 'Not yet reviewed'],
    ]);
  });

  it('never exports students without a mentor', () => {
    const session = apply(start(), { type: 'choose', studentId: 's1', mentorId: null });
    const rows = exportRows(session, roster, { includeUnreviewed: true });
    expect(rows.map((r) => r['Student Person ID'])).toEqual(['s2']);
  });

  it('produces a CSV Excel reads correctly', () => {
    const csv = toCsv(exportRows(reviewed(), roster, { includeUnreviewed: false }));
    expect(csv.startsWith('﻿Student Person ID,Student Name,Alumni Person ID,Alumni Name,Review Status,Closeness\r\n')).toBe(true);
    expect(csv).toContain('s2,Name s2,m3,Name m3,Changed,2nd closest match');
  });
});

describe('saving and resuming', () => {
  it('round-trips a review exactly', () => {
    const session = apply(start(), { type: 'choose', studentId: 's1', mentorId: 'm3' }, { type: 'confirm', studentId: 's2' });
    expect(parseSavedSession(serializeSession(session))).toEqual(session);
  });

  it('keeps names, emails and answers out of the saved file', () => {
    const text = serializeSession(start());
    expect(text).not.toContain('Name s1');
    expect(text).not.toContain('@example.org');
  });

  it('explains files it can’t open', () => {
    expect(() => parseSavedSession('hello')).toThrow(/isn’t a saved review/);
    expect(() => parseSavedSession('{"a":1}')).toThrow(/isn’t a saved review/);

    const newer = JSON.parse(serializeSession(start()));
    newer.version = 2;
    expect(() => parseSavedSession(JSON.stringify(newer))).toThrow(/different version/);

    const damaged = JSON.parse(serializeSession(start()));
    damaged.students[0].order.pop();
    expect(() => parseSavedSession(JSON.stringify(damaged))).toThrow(/damaged/);
  });

  it('resumes against the same export', () => {
    expect(checkCompatibility(start(), roster)).toEqual({ ok: true, missingPeople: 0, newStudents: 0, nowMatchedInAirtable: 0 });
  });

  it('refuses a file missing people from the review', () => {
    const withoutM3 = rosterOf(PEOPLE.filter((p) => p.id !== 'm3'));
    expect(checkCompatibility(start(), withoutM3)).toMatchObject({ ok: false, missingPeople: 1 });
  });

  it('notices students added since, or matched in Airtable since', () => {
    const later = rosterOf([
      ...PEOPLE.filter((p) => p.id !== 's1' && p.id !== 'm2'),
      person('s1', 'student', ['m2']),
      person('m2', 'mentor', ['s1']),
      person('s5', 'student'),
    ]);
    expect(checkCompatibility(start(), later)).toEqual({ ok: true, missingPeople: 0, newStudents: 1, nowMatchedInAirtable: 1 });
  });
});
