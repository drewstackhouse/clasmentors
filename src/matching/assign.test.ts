import { describe, expect, it } from 'vitest';
import { linearSumAssignment, assignmentCost } from './assign';
import fixtures from './__fixtures__/assignment.json';

interface Fixture {
  rows: number;
  cols: number;
  cost: number[];
  expected_total: number;
  expected_pairs: number;
  note?: string;
}

describe('linearSumAssignment vs scipy.optimize.linear_sum_assignment', () => {
  for (const f of fixtures as Fixture[]) {
    const label = `${f.rows}x${f.cols}${f.note ? ` (${f.note})` : ''}`;

    it(`matches scipy's optimal total on ${label}`, () => {
      const cost = Float64Array.from(f.cost);
      const pairs = linearSumAssignment(cost, f.rows, f.cols);

      // Ties are broken arbitrarily, so compare total cost, not pair identity.
      expect(pairs).toHaveLength(f.expected_pairs);
      expect(assignmentCost(cost, f.cols, pairs)).toBeCloseTo(f.expected_total, 9);
    });

    it(`returns a valid matching on ${label}`, () => {
      const pairs = linearSumAssignment(Float64Array.from(f.cost), f.rows, f.cols);
      expect(new Set(pairs.map((p) => p.row)).size).toBe(pairs.length);
      expect(new Set(pairs.map((p) => p.col)).size).toBe(pairs.length);
      expect(pairs.every((p) => p.row >= 0 && p.row < f.rows && p.col >= 0 && p.col < f.cols)).toBe(true);
      expect(pairs).toEqual([...pairs].sort((a, b) => a.row - b.row));
    });
  }

  it('handles empty inputs', () => {
    expect(linearSumAssignment(new Float64Array(0), 0, 5)).toEqual([]);
    expect(linearSumAssignment(new Float64Array(0), 5, 0)).toEqual([]);
  });

  it('rejects a mis-sized cost matrix', () => {
    expect(() => linearSumAssignment(new Float64Array(5), 2, 3)).toThrow(/expected 6/);
  });
});
