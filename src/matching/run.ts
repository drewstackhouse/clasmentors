/**
 * One matching run: embed the answers, score every student against every
 * mentor, and propose a starting assignment for people to review.
 *
 * The proposal is a starting point, not a verdict. It keeps each student's
 * full ranking so reviewers can see - and choose - the alternatives.
 */

import type { Roster } from '../data/roster';
import { DEFAULT_PAIRINGS, computeScores, textsToEmbed, type FieldPairing } from './score';
import { rankMentorsForStudent, solveAssignment } from './solve';

export interface MatchSettings {
  pairings: FieldPairing[];
  /**
   * Most mentees the suggestions will give any one mentor, current mentees
   * included. Reviewers can assign past it; it only shapes the starting point.
   */
  maxPerMentor: number;
  /** Give every mentor a first student before anyone is suggested a second. */
  levelCaseloads: boolean;
}

export const DEFAULT_SETTINGS: MatchSettings = {
  pairings: DEFAULT_PAIRINGS.map((p) => ({ ...p })),
  maxPerMentor: 2,
  levelCaseloads: true,
};

export interface RankedMentor {
  mentorId: string;
  /** 1 is this student's closest match. */
  rank: number;
  score: number;
  /** Comparisons in which both people had answered. */
  answeredComparisons: number;
}

export interface StudentProposal {
  studentId: string;
  /** The solver's starting suggestion; null if suggestions ran out of room. */
  suggestedMentorId: string | null;
  /** Every mentor in the run, closest first. */
  ranking: RankedMentor[];
}

export interface Proposal {
  settings: MatchSettings;
  /** Comparisons that contributed (zero weights and unanswered questions dropped). */
  comparisonsUsed: FieldPairing[];
  students: StudentProposal[];
  mentorIds: string[];
  roundsUsed: number;
}

export interface EmbeddingEngine {
  embed(
    texts: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<ReadonlyMap<string, Float32Array>>;
}

/** Whether the suggestions can place every student, before anything is run. */
export function capacityCheck(roster: Roster, maxPerMentor: number) {
  const openSlots = roster.existingLoad.reduce((sum, load) => sum + Math.max(0, maxPerMentor - load), 0);
  const students = roster.studentsToMatch.length;
  return { students, openSlots, shortfall: Math.max(0, students - openSlots) };
}

export async function proposeMatches(
  roster: Roster,
  settings: MatchSettings,
  engine: EmbeddingEngine,
  onProgress?: (done: number, total: number) => void,
): Promise<Proposal> {
  const students = roster.studentsToMatch;
  const mentors = roster.mentors;
  if (students.length === 0) throw new Error('There are no students to match.');
  if (mentors.length === 0) throw new Error('There are no mentors available.');

  const snapshot = structuredClone(settings);
  const vectors = await engine.embed(textsToEmbed(students, mentors, snapshot.pairings), onProgress);
  const scores = computeScores(students, mentors, snapshot.pairings, vectors);

  const solved = solveAssignment(scores.score, students.length, mentors.length, {
    maxPerMentor: snapshot.maxPerMentor,
    existingLoad: roster.existingLoad,
    levelCaseloads: snapshot.levelCaseloads,
  });
  const suggestion = new Map(solved.matches.map((m) => [m.studentIndex, m.mentorIndex]));

  return {
    settings: snapshot,
    comparisonsUsed: scores.pairingsUsed,
    mentorIds: mentors.map((m) => m.id),
    roundsUsed: solved.roundsUsed,
    students: students.map((student, s) => {
      const suggested = suggestion.get(s);
      return {
        studentId: student.id,
        suggestedMentorId: suggested === undefined ? null : mentors[suggested].id,
        ranking: rankMentorsForStudent(scores.score, s, mentors.length).map(({ mentorIndex, rank, score }) => ({
          mentorId: mentors[mentorIndex].id,
          rank,
          score,
          answeredComparisons: scores.answeredPairings[s * mentors.length + mentorIndex],
        })),
      };
    }),
  };
}
