import { describe, expect, it } from 'vitest';
import type { Person } from '../data/schema';
import { EMBEDDING_SIZE } from '../embed/protocol';
import { meanPoolNormalized } from '../embed/pool';
import { answerText, computeScores, textsToEmbed, type FieldPairing } from './score';

const person = (id: string, role: 'student' | 'mentor', fields: Record<string, string>): Person => ({
  id, role, name: id, email: '', fields, linkedIds: [], row: 0,
});

/** A unit vector at an angle `theta` in the first two dimensions, so dot products are cos(theta difference). */
const angle = (theta: number) => {
  const v = new Float32Array(EMBEDDING_SIZE);
  v[0] = Math.cos(theta);
  v[1] = Math.sin(theta);
  return v;
};

const GOALS = 'Goals';
const JOB = 'Job';
const MAJOR = 'Major';

const at = (m: ReturnType<typeof computeScores>, s: number, j: number) => m.score[s * m.mentorCount + j];

describe('computeScores', () => {
  const vectors = new Map<string, Float32Array>([
    [answerText(GOALS, 'museums'), angle(0)],
    [answerText(GOALS, 'finance'), angle(Math.PI / 2)],
    [answerText(JOB, 'curator'), angle(0)],
    [answerText(JOB, 'banker'), angle(Math.PI / 2)],
    [answerText(JOB, 'teacher'), angle(Math.PI / 3)],
    [answerText(MAJOR, 'History'), angle(0)],
    [answerText(MAJOR, 'Economics'), angle(Math.PI / 2)],
  ]);

  it('is the weighted average of pairing similarities', () => {
    const students = [person('s1', 'student', { [GOALS]: 'museums', [MAJOR]: 'History' })];
    const mentors = [person('m1', 'mentor', { [JOB]: 'teacher', [MAJOR]: 'History' })];
    const pairings: FieldPairing[] = [
      { studentField: GOALS, mentorField: JOB, weight: 3 },
      { studentField: MAJOR, mentorField: MAJOR, weight: 1 },
    ];
    const result = computeScores(students, mentors, pairings, vectors);
    // (3 * cos(60deg) + 1 * 1) / 4
    expect(at(result, 0, 0)).toBeCloseTo((3 * 0.5 + 1) / 4, 6);
    expect(result.answeredPairings[0]).toBe(2);
  });

  it('treats a blank answer as an average match, so a sparse profile cannot top the list', () => {
    const students = [
      person('s1', 'student', { [GOALS]: 'museums', [MAJOR]: 'History' }),
      person('s2', 'student', { [GOALS]: 'finance', [MAJOR]: 'Economics' }),
    ];
    const mentors = [
      person('curator', 'mentor', { [JOB]: 'curator', [MAJOR]: 'Economics' }),
      person('banker', 'mentor', { [JOB]: 'banker', [MAJOR]: 'History' }),
      person('majors-only', 'mentor', { [JOB]: '', [MAJOR]: 'History' }),
    ];
    const pairings: FieldPairing[] = [
      { studentField: GOALS, mentorField: JOB, weight: 1 },
      { studentField: MAJOR, mentorField: MAJOR, weight: 1 },
    ];
    const result = computeScores(students, mentors, pairings, vectors);

    // Answered goals-vs-job cells: s1: 1, 0; s2: 0, 1 -> average 0.5 stands in for the blank.
    expect(at(result, 0, 2)).toBeCloseTo((0.5 + 1) / 2, 6);
    // Without the average, "majors-only" would score a perfect 1.0 for s1 and outrank the curator.
    expect(at(result, 0, 2)).toBeLessThan(1);
    expect(result.answeredPairings[0 * 3 + 2]).toBe(1);
  });

  it('does not change a student’s ranking of mentors when the student left a question blank', () => {
    const mentors = [
      person('curator', 'mentor', { [JOB]: 'curator', [MAJOR]: 'History' }),
      person('banker', 'mentor', { [JOB]: 'banker', [MAJOR]: 'Economics' }),
      person('teacher', 'mentor', { [JOB]: 'teacher', [MAJOR]: 'History' }),
    ];
    const pairings: FieldPairing[] = [
      { studentField: GOALS, mentorField: JOB, weight: 1 },
      { studentField: MAJOR, mentorField: MAJOR, weight: 1 },
    ];
    const others = [person('s2', 'student', { [GOALS]: 'finance', [MAJOR]: 'Economics' })];
    const blank = person('s1', 'student', { [GOALS]: '', [MAJOR]: 'History' });
    const result = computeScores([blank, ...others], mentors, pairings, vectors);

    const row = [0, 1, 2].map((j) => at(result, 0, j));
    const majorsOnly = [1, 0, 1]; // History vs History, Economics, History
    const order = (xs: number[]) => xs.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i);
    expect(order(row)).toEqual(order(majorsOnly));
    // ...because every cell in the row received the same stand-in for the blank.
    expect(row[0] - row[1]).toBeCloseTo((1 - 0) / 2, 6);
  });

  it('ignores zero weights and questions nobody answered', () => {
    const students = [person('s1', 'student', { [GOALS]: 'museums', [MAJOR]: '' })];
    const mentors = [person('m1', 'mentor', { [JOB]: 'curator', [MAJOR]: '' })];
    const result = computeScores(students, mentors, [
      { studentField: GOALS, mentorField: JOB, weight: 1 },
      { studentField: MAJOR, mentorField: MAJOR, weight: 5 },
      { studentField: GOALS, mentorField: MAJOR, weight: 0 },
    ], vectors);
    expect(at(result, 0, 0)).toBeCloseTo(1, 6);
    expect(result.pairingsUsed).toEqual([{ studentField: GOALS, mentorField: JOB, weight: 1 }]);
  });

  it('refuses to run with no weighted comparisons', () => {
    expect(() => computeScores([], [], [{ studentField: GOALS, mentorField: JOB, weight: 0 }], vectors)).toThrow(/weight above zero/);
  });

  it('insists every needed answer was embedded first', () => {
    const students = [person('s1', 'student', { [GOALS]: 'something new' })];
    const mentors = [person('m1', 'mentor', { [JOB]: 'curator' })];
    expect(() => computeScores(students, mentors, [{ studentField: GOALS, mentorField: JOB, weight: 1 }], vectors)).toThrow(/Missing embedding/);
  });
});

describe('textsToEmbed', () => {
  it('lists each distinct answer once and skips blanks', () => {
    const students = [
      person('s1', 'student', { [GOALS]: 'museums', [MAJOR]: 'History' }),
      person('s2', 'student', { [GOALS]: 'museums', [MAJOR]: '' }),
    ];
    const mentors = [person('m1', 'mentor', { [JOB]: 'curator', [MAJOR]: 'History' })];
    const texts = textsToEmbed(students, mentors, [
      { studentField: GOALS, mentorField: JOB, weight: 1 },
      { studentField: MAJOR, mentorField: MAJOR, weight: 1 },
      { studentField: GOALS, mentorField: MAJOR, weight: 0 },
    ]);
    expect(texts.sort()).toEqual([answerText(GOALS, 'museums'), answerText(JOB, 'curator'), answerText(MAJOR, 'History')].sort());
  });
});

describe('meanPoolNormalized', () => {
  it('averages only unmasked tokens and returns a unit vector', () => {
    const size = 3;
    const hidden = Float32Array.from([
      1, 0, 0, // token 0
      0, 1, 0, // token 1
      9, 9, 9, // padding, must be ignored
    ]);
    const out = new Float32Array(size);
    meanPoolNormalized(hidden, 3, size, BigInt64Array.from([1n, 1n, 0n]), out);
    expect(Array.from(out).map((x) => +x.toFixed(6))).toEqual([0.707107, 0.707107, 0]);
  });
});
