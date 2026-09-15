import { describe, expect, it } from 'vitest';
import { buildRoster } from '../data/roster';
import type { Person, Role } from '../data/schema';
import { EMBEDDING_SIZE } from '../embed/protocol';
import { DEFAULT_SETTINGS, capacityCheck, proposeMatches, type EmbeddingEngine, type MatchSettings } from './run';

const person = (id: string, role: Role, fields: Record<string, string>, linkedIds: string[] = []): Person => ({
  id, role, name: id, email: `${id}@example.org`, fields, linkedIds, row: 0,
});

/** Deterministic stand-in for the model: the same text always gives the same unit vector. */
function vectorFor(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  const v = new Float32Array(EMBEDDING_SIZE);
  for (let d = 0; d < 8; d++) {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    v[d] = (h >>> 0) / 2 ** 32 - 0.5;
  }
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

function fakeEngine() {
  const requested: string[] = [];
  const engine: EmbeddingEngine = {
    async embed(texts, onProgress) {
      requested.push(...texts);
      onProgress?.(texts.length, texts.length);
      return new Map(texts.map((t) => [t, vectorFor(t)]));
    },
  };
  return { engine, requested };
}

const student = (id: string, goals: string, linked: string[] = []) =>
  person(id, 'student', { 'Career/Goals Statement': goals, 'What You Seek in a Mentor': `advice about ${goals}`, Majors: 'History' }, linked);
const mentor = (id: string, job: string, linked: string[] = []) =>
  person(id, 'mentor', { 'Job Title and Employer': job, 'Why Mentor Statement': `I help with ${job}`, Majors: 'History' }, linked);

const PEOPLE = [
  student('s1', 'museum education'),
  student('s2', 'investment banking'),
  student('s3', 'public health'),
  student('s4', 'software engineering'),
  student('s5', 'law school', ['m1']),
  student('s6', 'journalism', ['m1']),
  mentor('m1', 'Attorney', ['s5', 's6']),
  mentor('m2', 'Curator'),
  mentor('m3', 'Epidemiologist'),
  mentor('m4', 'Excluded Job'),
];

const roster = (excluded: string[] = ['m4']) => buildRoster(PEOPLE, [], new Set(excluded));
const settings = (overrides: Partial<MatchSettings> = {}): MatchSettings => ({ ...DEFAULT_SETTINGS, ...overrides });

const suggestedLoad = (proposal: Awaited<ReturnType<typeof proposeMatches>>) => {
  const load: Record<string, number> = {};
  for (const s of proposal.students) if (s.suggestedMentorId) load[s.suggestedMentorId] = (load[s.suggestedMentorId] ?? 0) + 1;
  return load;
};

describe('proposeMatches', () => {
  it('suggests mentors only for students without one, within the ceiling counting current mentees', async () => {
    const proposal = await proposeMatches(roster(), settings({ maxPerMentor: 2 }), fakeEngine().engine);
    expect(proposal.students.map((s) => s.studentId)).toEqual(['s1', 's2', 's3', 's4']);
    // m1 already has two mentees, so all four open slots belong to m2 and m3.
    expect(suggestedLoad(proposal)).toEqual({ m2: 2, m3: 2 });
  });

  it('ranks every mentor in the run for every student, closest first', async () => {
    const proposal = await proposeMatches(roster(), settings(), fakeEngine().engine);
    for (const s of proposal.students) {
      expect(s.ranking.map((r) => r.mentorId).sort()).toEqual(['m1', 'm2', 'm3']);
      expect(s.ranking.map((r) => r.rank)).toEqual([1, 2, 3]);
      const scores = s.ranking.map((r) => r.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      expect(s.ranking.every((r) => r.answeredComparisons === DEFAULT_SETTINGS.pairings.length)).toBe(true);
    }
  });

  it('leaves students without a suggestion when there is genuinely no room', async () => {
    const r = roster();
    expect(capacityCheck(r, 1)).toEqual({ students: 4, openSlots: 2, shortfall: 2 });
    const proposal = await proposeMatches(r, settings({ maxPerMentor: 1 }), fakeEngine().engine);
    expect(proposal.students.filter((s) => s.suggestedMentorId === null)).toHaveLength(2);
  });

  it('never suggests, ranks or even embeds excluded people or students who already have a mentor', async () => {
    const { engine, requested } = fakeEngine();
    const proposal = await proposeMatches(roster(['m4', 's4']), settings(), engine);
    expect(proposal.mentorIds).not.toContain('m4');
    expect(proposal.students.map((s) => s.studentId)).not.toContain('s4');
    expect(requested.some((t) => t.includes('Excluded Job'))).toBe(false);
    expect(requested.some((t) => t.includes('software engineering'))).toBe(false);
    expect(requested.some((t) => t.includes('law school') || t.includes('journalism'))).toBe(false);
  });

  it('records the settings it ran with, unaffected by later edits', async () => {
    const live = settings();
    const proposal = await proposeMatches(roster(), live, fakeEngine().engine);
    live.maxPerMentor = 9;
    live.pairings[0].weight = 42;
    expect(proposal.settings.maxPerMentor).toBe(2);
    expect(proposal.settings.pairings[0].weight).toBe(1);
  });
});
