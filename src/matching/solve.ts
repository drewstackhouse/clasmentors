/**
 * Capacity-aware, caseload-levelling assignment.
 *
 * The assignment algorithm itself is strictly one-to-one, so mentor capacity is
 * modelled by repeating each mentor's column once per open slot - the standard
 * expansion trick. Levelling is a loop *around* the solver, not a change to it:
 * round k offers a slot to every mentor still carrying fewer than k mentees, so
 * nobody takes a second student until everyone willing has taken a first.
 */

import { linearSumAssignment } from './assign';

export interface SolveOptions {
  /** Most mentees any one mentor may hold, existing relationships included. */
  maxPerMentor: number;
  /** Mentees each mentor already has. Length must equal the mentor count. */
  existingLoad: number[];
  /** Level caseloads across mentors instead of solving in a single pass. */
  levelCaseloads: boolean;
}

export interface Match {
  studentIndex: number;
  mentorIndex: number;
  score: number;
}

export interface SolveResult {
  matches: Match[];
  unmatchedStudents: number[];
  /** Existing + newly assigned mentees, per mentor. */
  finalLoad: number[];
  /** Rounds the solver actually ran; 1 when levelling is off. */
  roundsUsed: number;
  /** Open slots the solver was offered across all rounds. */
  slotsOffered: number;
}

/**
 * @param score row-major student x mentor similarity matrix (higher is better)
 */
export function solveAssignment(
  score: Float64Array,
  studentCount: number,
  mentorCount: number,
  options: SolveOptions,
): SolveResult {
  const { maxPerMentor, existingLoad, levelCaseloads } = options;

  if (score.length !== studentCount * mentorCount) {
    throw new Error(`score matrix has ${score.length} entries, expected ${studentCount * mentorCount}`);
  }
  if (existingLoad.length !== mentorCount) {
    throw new Error(`existingLoad has ${existingLoad.length} entries, expected ${mentorCount}`);
  }
  if (maxPerMentor < 1) throw new Error('maxPerMentor must be at least 1');

  const load = existingLoad.map((n) => Math.max(0, Math.trunc(n)));
  const assignedTo = new Map<number, number>();
  let roundsUsed = 0;
  let slotsOffered = 0;

  // Levelling off: one round straight to the ceiling. On: raise the target by
  // one each round, so a mentor only reaches k after everyone else reaches k-1.
  const firstTarget = levelCaseloads ? 1 : maxPerMentor;

  for (let target = firstTarget; target <= maxPerMentor; target++) {
    const pending: number[] = [];
    for (let s = 0; s < studentCount; s++) if (!assignedTo.has(s)) pending.push(s);
    if (pending.length === 0) break;

    // Expand: one column per open slot, remembering which mentor it belongs to.
    const slotOwner: number[] = [];
    for (let m = 0; m < mentorCount; m++) {
      for (let open = load[m]; open < target; open++) slotOwner.push(m);
    }
    if (slotOwner.length === 0) continue;

    roundsUsed = target - firstTarget + 1;
    slotsOffered += slotOwner.length;

    // Negate: the solver minimises, we want maximum total similarity.
    const cost = new Float64Array(pending.length * slotOwner.length);
    for (let r = 0; r < pending.length; r++) {
      const base = pending[r] * mentorCount;
      for (let c = 0; c < slotOwner.length; c++) {
        cost[r * slotOwner.length + c] = -score[base + slotOwner[c]];
      }
    }

    for (const { row, col } of linearSumAssignment(cost, pending.length, slotOwner.length)) {
      const student = pending[row];
      const mentor = slotOwner[col];
      assignedTo.set(student, mentor);
      load[mentor] += 1;
    }
  }

  const matches: Match[] = [];
  const unmatchedStudents: number[] = [];
  for (let s = 0; s < studentCount; s++) {
    const mentor = assignedTo.get(s);
    if (mentor === undefined) unmatchedStudents.push(s);
    else matches.push({ studentIndex: s, mentorIndex: mentor, score: score[s * mentorCount + mentor] });
  }

  return { matches, unmatchedStudents, finalLoad: load, roundsUsed, slotsOffered };
}

/**
 * Every mentor ranked for one student, best first. Independent of the
 * assignment: a student's top-ranked mentor is often taken by someone else.
 */
export function rankMentorsForStudent(
  score: Float64Array,
  studentIndex: number,
  mentorCount: number,
): { mentorIndex: number; score: number; rank: number }[] {
  const base = studentIndex * mentorCount;
  return Array.from({ length: mentorCount }, (_, m) => ({ mentorIndex: m, score: score[base + m] }))
    .sort((a, b) => b.score - a.score || a.mentorIndex - b.mentorIndex)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
}
