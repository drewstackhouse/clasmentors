/** A tiny synthetic review for tests. Every id and name is invented. */

import { buildRoster } from '../../data/roster';
import type { Person, Role } from '../../data/schema';
import { DEFAULT_SETTINGS, type Proposal, type RankedMentor } from '../../matching/run';

export const person = (id: string, role: Role, linkedIds: string[] = []): Person => ({
  id,
  role,
  name: `Name ${id}`,
  email: `${id}@example.org`,
  fields: {},
  linkedIds,
  row: 0,
});

/** s4 is already matched with m1 in Airtable; s1-s3 are being reviewed. */
export const PEOPLE: Person[] = [
  person('s1', 'student'),
  person('s2', 'student'),
  person('s3', 'student'),
  person('s4', 'student', ['m1']),
  person('m1', 'mentor', ['s4']),
  person('m2', 'mentor'),
  person('m3', 'mentor'),
];

export const rosterOf = (people: Person[] = PEOPLE, excluded: string[] = []) =>
  buildRoster(people, [], new Set(excluded));

const ranked = (...entries: [string, number][]): RankedMentor[] =>
  entries.map(([mentorId, score], i) => ({ mentorId, rank: i + 1, score, answeredComparisons: 4 }));

export const PROPOSAL: Proposal = {
  settings: structuredClone(DEFAULT_SETTINGS),
  comparisonsUsed: DEFAULT_SETTINGS.pairings.map((p) => ({ ...p })),
  mentorIds: ['m1', 'm2', 'm3'],
  roundsUsed: 2,
  students: [
    // Suggested their 2nd closest: m1 went to s2.
    { studentId: 's1', suggestedMentorId: 'm2', ranking: ranked(['m1', 0.61], ['m2', 0.55], ['m3', 0.4]) },
    { studentId: 's2', suggestedMentorId: 'm1', ranking: ranked(['m1', 0.7], ['m3', 0.52], ['m2', 0.31]) },
    // No room left for a suggestion.
    { studentId: 's3', suggestedMentorId: null, ranking: ranked(['m3', 0.49], ['m2', 0.45], ['m1', 0.2]) },
  ],
};
