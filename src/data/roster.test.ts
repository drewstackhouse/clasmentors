import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { decodeCsv, parseRoster } from './parse';
import { buildRoster } from './roster';
import type { IssueKind } from './issues';

/** A synthetic Airtable export. Every name, email and id here is invented. */

const HEADER = [
  'Full Name', 'Role', 'Email', 'Date Created', 'Date Modified', 'Class Year',
  'Location (City)', 'Location (State)', 'Majors', 'Minors', 'Job Title and Employer',
  'Why Mentor Statement', 'Career/Goals Statement', 'What You Seek in a Mentor',
  'Activities/Clubs', 'Matched Alumni', 'Matched Student', 'Person ID',
];

/** Airtable-shaped record id: "rec" + 14 characters. */
const id = (tag: string) => `rec${tag.padEnd(14, 'x')}`;

type Row = Partial<Record<(typeof HEADER)[number], string>>;

const student = (name: string, tag: string, extra: Row = {}): Row => ({
  'Full Name': name, Role: 'Current Student', Email: `${tag.toLowerCase()}@example.edu`,
  'Person ID': id(tag), Majors: 'History',
  'Career/Goals Statement': 'I want to work in museum education, "hands-on" programs, and outreach.',
  'What You Seek in a Mentor': 'Someone who’s built a career in public programs.',
  ...extra,
});

const mentor = (name: string, tag: string, extra: Row = {}): Row => ({
  'Full Name': name, Role: 'Alumni Mentor', Email: `${tag.toLowerCase()}@example.com`,
  'Person ID': id(tag), Majors: 'Economics',
  'Job Title and Employer': 'Program Director, Riverside Arts Council',
  'Why Mentor Statement': 'I like helping students find their way into\nnonprofit work.',
  ...extra,
});

const BLANK_STUDENT = { 'Career/Goals Statement': '', 'What You Seek in a Mentor': '', 'Activities/Clubs': '' };
const BLANK_MENTOR = { 'Job Title and Employer': '', 'Why Mentor Statement': '' };

const ROWS: Row[] = [
  student('  Avery   Stone ', 'S1'),
  student('Blake Rivera', 'S2', { 'Matched Alumni': id('M1') }),
  student('Casey Lin', 'S3', { 'Matched Alumni': id('GHOST1') }),
  student('Devon Park', 'S4', BLANK_STUDENT),
  student('Emery Cole', 'S5', { 'Matched Alumni': id('M2') }),
  student('Finley Moss', 'S6', { 'Matched Alumni': id('S1') }),
  student('Gray Hale', 'S7', { 'Matched Alumni': 'Jordan Smith' }),
  mentor('Harper Quinn', 'M1', { 'Matched Student': id('S2') }),
  mentor('Indigo Shaw', 'M2'),
  mentor('Jules Moreno', 'M3', {
    ...BLANK_MENTOR,
    'Career/Goals Statement': 'Manager of school programs at a regional museum.',
  }),
  mentor('Kai Brooks', 'M4', { Email: 'kai.brooks@example.com' }),
  mentor('Kai Brooks', 'M5', { Email: 'Kai.Brooks@example.com' }),
  mentor('Lane Porter', 'M6', BLANK_MENTOR),
  mentor('Morgan Reyes', 'M7', { 'Matched Student': id('GHOST2') }),
  { 'Full Name': 'Pat Staffer', Role: 'Staff', 'Person ID': id('X1') },
  { 'Full Name': 'No Id Person', Role: 'Current Student' },
  student('Avery Stone (duplicate)', 'S1'),
];

function exportCsv(rows: Row[], { bom = true } = {}) {
  const body = Papa.unparse({ fields: HEADER, data: rows.map((r) => HEADER.map((h) => r[h] ?? '')) });
  return (bom ? '﻿' : '') + body;
}

function load(rows: Row[] = ROWS, excluded: string[] = []) {
  const parsed = parseRoster(decodeCsv(new TextEncoder().encode(exportCsv(rows)).buffer));
  return buildRoster(parsed.people, parsed.issues, new Set(excluded));
}

const names = (people: { name: string }[]) => people.map((p) => p.name).sort();
const issue = (r: ReturnType<typeof load>, kind: IssueKind) => r.issues.filter((i) => i.kind === kind);

describe('parsing an Airtable export', () => {
  const roster = load();

  it('keeps usable rows and skips unusable ones with an explanation', () => {
    expect(roster.people).toHaveLength(14);
    expect(issue(roster, 'unknown-role')[0].message).toMatch(/1 row has a Role other than/);
    expect(issue(roster, 'missing-id')[0].message).toMatch(/1 row has no Person ID/);
    expect(issue(roster, 'duplicate-id')[0].message).toMatch(/Only row 2 will be used/);
  });

  it('tidies whitespace in names and survives quotes, commas and line breaks in answers', () => {
    const avery = roster.byId.get(id('S1'))!;
    expect(avery.name).toBe('Avery Stone');
    expect(avery.fields['Career/Goals Statement']).toContain('"hands-on" programs, and outreach');
    expect(roster.byId.get(id('M1'))!.fields['Why Mentor Statement']).toBe(
      'I like helping students find their way into nonprofit work.',
    );
  });

  it('refuses a file without the columns it needs', () => {
    const parsed = parseRoster('Name,Email\nA,a@example.edu');
    expect(parsed.people).toEqual([]);
    expect(parsed.issues[0]).toMatchObject({ kind: 'missing-columns', severity: 'error' });
    expect(parsed.issues[0].message).toContain('"Full Name"');
  });
});

describe('decoding', () => {
  it('strips a UTF-8 byte-order mark', () => {
    expect(decodeCsv(new TextEncoder().encode('﻿Full Name').buffer)).toBe('Full Name');
  });

  it('falls back to Windows-1252 for files re-saved by Excel', () => {
    const bytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x20, 0x93, 0x68, 0x69, 0x94]); // caf\xe9 \x93hi\x94
    expect(decodeCsv(bytes.buffer)).toBe('café “hi”');
  });
});

describe('current relationships', () => {
  const roster = load();

  it('leaves already-matched students alone, including matches recorded on only one side', () => {
    expect(names(roster.alreadyMatchedStudents)).toEqual(['Blake Rivera', 'Casey Lin', 'Emery Cole']);
    expect(names(roster.studentsToMatch)).toEqual(['Avery Stone', 'Devon Park', 'Finley Moss', 'Gray Hale']);
  });

  it('counts every current match in the mentor’s caseload, even with someone outside the file', () => {
    const load = Object.fromEntries(roster.mentors.map((m, i) => [m.name + ' ' + m.id.slice(3, 5), roster.existingLoad[i]]));
    expect(load).toEqual({
      'Harper Quinn M1': 1, 'Indigo Shaw M2': 1, 'Jules Moreno M3': 0,
      'Kai Brooks M4': 0, 'Kai Brooks M5': 0, 'Lane Porter M6': 0, 'Morgan Reyes M7': 1,
    });
  });

  it('explains links it can’t use', () => {
    expect(issue(roster, 'unresolved-link')[0].personIds.sort()).toEqual([id('M7'), id('S3')].sort());
    expect(issue(roster, 'same-role-link')[0].personIds).toEqual([id('S6')]);
    expect(issue(roster, 'unreadable-link')[0].message).toContain('Jordan Smith');
    expect(issue(roster, 'one-sided-link')[0]).toMatchObject({ severity: 'info', personIds: [id('S5')] });
  });

  it('reads several linked records from one cell', () => {
    const r = load([
      mentor('Harper Quinn', 'M1', { 'Matched Student': `${id('S1')}, ${id('S2')}` }),
      student('Avery Stone', 'S1', { 'Matched Alumni': id('M1') }),
      student('Blake Rivera', 'S2', { 'Matched Alumni': id('M1') }),
      student('Casey Lin', 'S3'),
    ]);
    expect(r.existingLoad).toEqual([2]);
    expect(names(r.studentsToMatch)).toEqual(['Casey Lin']);
  });
});

describe('data worth a second look', () => {
  const roster = load();

  it('flags duplicate people by email, ignoring case', () => {
    const [dup] = issue(roster, 'duplicate-email');
    expect(dup.personIds).toEqual([id('M4'), id('M5')]);
    expect(dup.message).toMatch(/Kai Brooks appears 2 times/);
  });

  it('calls out a mentor who answered the student questions instead', () => {
    const [wrong] = issue(roster, 'answered-other-role');
    expect(wrong.personIds).toEqual([id('M3')]);
    expect(wrong.message).toMatch(/Jules Moreno is listed as an Alumni Mentor but answered the student questions/);
  });

  it('flags people with no answers, but only students who are actually being matched', () => {
    const blank = issue(roster, 'no-profile-text');
    expect(blank.flatMap((i) => i.personIds).sort()).toEqual([id('M6'), id('S4')].sort());
  });

  it('lists errors before warnings before notes', () => {
    const order = roster.issues.map((i) => i.severity);
    expect(order).toEqual([...order].sort((a, b) => ['error', 'warning', 'info'].indexOf(a) - ['error', 'warning', 'info'].indexOf(b)));
    expect(order).not.toContain('error');
  });
});

describe('excluding people from a run', () => {
  it('removes them from the pools without changing what the file says', () => {
    const before = load();
    const after = load(ROWS, [id('M5'), id('S4')]);
    expect(after.mentors.map((m) => m.id)).not.toContain(id('M5'));
    expect(after.existingLoad).toHaveLength(after.mentors.length);
    expect(names(after.studentsToMatch)).toEqual(['Avery Stone', 'Finley Moss', 'Gray Hale']);
    expect(after.issues).toEqual(before.issues);
  });
});

describe('files with nothing to do', () => {
  it('stops when every student already has a mentor', () => {
    const r = load([
      student('Blake Rivera', 'S2', { 'Matched Alumni': id('M1') }),
      mentor('Harper Quinn', 'M1', { 'Matched Student': id('S2') }),
    ]);
    expect(issue(r, 'no-students')[0]).toMatchObject({ severity: 'error' });
  });

  it('stops when there are no mentors', () => {
    expect(issue(load([student('Avery Stone', 'S1')]), 'no-mentors')[0].severity).toBe('error');
  });
});
