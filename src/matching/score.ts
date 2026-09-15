/**
 * Student x mentor similarity from embedded answers.
 *
 * Each pairing compares one student question with one mentor question. A
 * student-mentor score is the weighted average of their pairing similarities.
 *
 * Blank answers count as an *average* match for that pairing - the mean
 * similarity across everyone who did answer. Neither obvious alternative works:
 * embedding the word "[blank]" produces arbitrary similarities, and simply
 * skipping blank comparisons lets a sparse profile float to the top (a mentor
 * who only filled in Majors would score a perfect 1.0 against every student
 * with the same major). With the average, a blank neither helps nor hurts, and
 * a student's own blanks shift their whole row equally, so their ranking of
 * mentors is unchanged.
 */

import type { Person } from '../data/schema';
import { EMBEDDING_SIZE } from '../embed/protocol';
import { dot } from '../embed/pool';

export interface FieldPairing {
  studentField: string;
  mentorField: string;
  weight: number;
}

export const DEFAULT_PAIRINGS: readonly FieldPairing[] = [
  { studentField: 'Career/Goals Statement', mentorField: 'Job Title and Employer', weight: 1 },
  { studentField: 'What You Seek in a Mentor', mentorField: 'Why Mentor Statement', weight: 1 },
  { studentField: 'Career/Goals Statement', mentorField: 'Why Mentor Statement', weight: 0.75 },
  { studentField: 'Majors', mentorField: 'Majors', weight: 0.5 },
];

/** The exact text embedded for one answer; the question is included for context. */
export const answerText = (field: string, value: string) => `${field}: ${value}`;

const activePairings = (pairings: readonly FieldPairing[]) =>
  pairings.filter((p) => Number.isFinite(p.weight) && p.weight > 0);

/** Every distinct non-blank answer the pairings need embedded. */
export function textsToEmbed(
  students: readonly Person[],
  mentors: readonly Person[],
  pairings: readonly FieldPairing[],
): string[] {
  const texts = new Set<string>();
  for (const { studentField, mentorField } of activePairings(pairings)) {
    for (const s of students) if (s.fields[studentField]) texts.add(answerText(studentField, s.fields[studentField]));
    for (const m of mentors) if (m.fields[mentorField]) texts.add(answerText(mentorField, m.fields[mentorField]));
  }
  return [...texts];
}

export interface ScoreMatrix {
  studentCount: number;
  mentorCount: number;
  /** Row-major weighted similarity, students x mentors. */
  score: Float64Array;
  /** How many pairings had answers on both sides, per student-mentor cell. */
  answeredPairings: Uint8Array;
  /** Pairings that contributed, after dropping zero weights and questions nobody answered. */
  pairingsUsed: FieldPairing[];
}

export function computeScores(
  students: readonly Person[],
  mentors: readonly Person[],
  pairings: readonly FieldPairing[],
  vectors: ReadonlyMap<string, Float32Array>,
): ScoreMatrix {
  const active = activePairings(pairings);
  if (active.length === 0) throw new Error('At least one comparison needs a weight above zero.');

  const ns = students.length;
  const nm = mentors.length;
  const cells = ns * nm;
  const weighted = new Float64Array(cells);
  const answeredPairings = new Uint8Array(cells);
  const pairingsUsed: FieldPairing[] = [];
  let totalWeight = 0;

  const lookup = (field: string, value: string) => {
    if (!value) return null;
    const vector = vectors.get(answerText(field, value));
    if (!vector) throw new Error(`Missing embedding for "${field}". Embed textsToEmbed(...) before scoring.`);
    return vector;
  };

  const similarity = new Float64Array(cells);

  for (const pairing of active) {
    const studentVectors = students.map((s) => lookup(pairing.studentField, s.fields[pairing.studentField]));
    const mentorVectors = mentors.map((m) => lookup(pairing.mentorField, m.fields[pairing.mentorField]));

    let sum = 0;
    let answered = 0;
    similarity.fill(NaN);

    for (let s = 0; s < ns; s++) {
      const sv = studentVectors[s];
      if (!sv) continue;
      for (let m = 0; m < nm; m++) {
        const mv = mentorVectors[m];
        if (!mv) continue;
        const value = dot(sv, 0, mv, 0, EMBEDDING_SIZE);
        similarity[s * nm + m] = value;
        sum += value;
        answered++;
        answeredPairings[s * nm + m]++;
      }
    }

    if (answered === 0) continue; // nobody answered one side: this pairing says nothing

    const average = sum / answered;
    for (let cell = 0; cell < cells; cell++) {
      const value = similarity[cell];
      weighted[cell] += pairing.weight * (Number.isNaN(value) ? average : value);
    }
    totalWeight += pairing.weight;
    pairingsUsed.push(pairing);
  }

  const score = new Float64Array(cells);
  if (totalWeight > 0) for (let cell = 0; cell < cells; cell++) score[cell] = weighted[cell] / totalWeight;

  return { studentCount: ns, mentorCount: nm, score, answeredPairings, pairingsUsed };
}
