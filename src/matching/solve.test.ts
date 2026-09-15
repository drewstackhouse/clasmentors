import { describe, expect, it } from 'vitest';
import { solveAssignment, rankMentorsForStudent } from './solve';
import fixtures from './__fixtures__/solve.json';

interface Fixture {
  rows: number; cols: number; ceiling: number; level: boolean;
  score: number[]; existing: number[];
  expected_matched: number; expected_load: number[];
  expected_rounds: number; expected_mean: number | null;
}

const mean = (ms: { score: number }[]) => ms.reduce((s, m) => s + m.score, 0) / ms.length;

describe('solveAssignment vs the Python reference implementation', () => {
  for (const f of fixtures as Fixture[]) {
    const label = `${f.rows}x${f.cols}, ceiling ${f.ceiling}, levelling ${f.level ? 'on' : 'off'}`;

    it(`reproduces the reference solve for ${label}`, () => {
      const r = solveAssignment(Float64Array.from(f.score), f.rows, f.cols, {
        maxPerMentor: f.ceiling, existingLoad: f.existing, levelCaseloads: f.level,
      });
      expect(r.matches).toHaveLength(f.expected_matched);
      expect(r.finalLoad).toEqual(f.expected_load);
      expect(r.roundsUsed).toBe(f.expected_rounds);
      if (f.expected_mean !== null) expect(mean(r.matches)).toBeCloseTo(f.expected_mean, 9);
    });

    it(`respects the ceiling and matches every student once for ${label}`, () => {
      const r = solveAssignment(Float64Array.from(f.score), f.rows, f.cols, {
        maxPerMentor: f.ceiling, existingLoad: f.existing, levelCaseloads: f.level,
      });
      expect(Math.max(...r.finalLoad)).toBeLessThanOrEqual(f.ceiling);
      expect(new Set(r.matches.map((m) => m.studentIndex)).size).toBe(r.matches.length);
      expect(r.matches.length + r.unmatchedStudents.length).toBe(f.rows);
      f.existing.forEach((n, m) => expect(r.finalLoad[m]).toBeGreaterThanOrEqual(n));
    });
  }
});

describe('levelling behaviour', () => {
  const rows = 40, cols = 15;
  const score = Float64Array.from({ length: rows * cols }, (_, i) => Math.sin(i * 12.9898) * 0.5 + 0.5);
  const existing = new Array(cols).fill(0);

  it('never changes how many students are matched, only how they are spread', () => {
    for (const ceiling of [1, 2, 3, 5]) {
      const flat = solveAssignment(score, rows, cols, { maxPerMentor: ceiling, existingLoad: existing, levelCaseloads: false });
      const level = solveAssignment(score, rows, cols, { maxPerMentor: ceiling, existingLoad: existing, levelCaseloads: true });
      expect(level.matches.length).toBe(flat.matches.length);
      // Levelling trades total score for a flatter caseload; it can never win on score.
      expect(mean(level.matches)).toBeLessThanOrEqual(mean(flat.matches) + 1e-9);
      const idle = (r: { finalLoad: number[] }) => r.finalLoad.filter((n) => n === 0).length;
      expect(idle(level)).toBeLessThanOrEqual(idle(flat));
    }
  });

  it('leaves students unmatched when capacity genuinely runs out', () => {
    const r = solveAssignment(score, rows, cols, { maxPerMentor: 2, existingLoad: existing, levelCaseloads: true });
    expect(r.matches).toHaveLength(30);
    expect(r.unmatchedStudents).toHaveLength(10);
  });

  it('honours existing caseloads as a starting point', () => {
    const preloaded = [2, 2, 2, ...new Array(cols - 3).fill(0)];
    const r = solveAssignment(score, rows, cols, { maxPerMentor: 2, existingLoad: preloaded, levelCaseloads: true });
    expect(r.finalLoad.slice(0, 3)).toEqual([2, 2, 2]);
  });
});

describe('rankMentorsForStudent', () => {
  it('ranks every mentor best-first, independent of the assignment', () => {
    const score = Float64Array.from([0.1, 0.9, 0.5, 0.3, 0.2, 0.8]);
    const ranked = rankMentorsForStudent(score, 0, 3);
    expect(ranked.map((r) => r.mentorIndex)).toEqual([1, 2, 0]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});
