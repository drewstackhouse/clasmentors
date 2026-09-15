/**
 * A review in progress: which mentor each student is currently set up with,
 * and whether someone has looked at them yet.
 *
 * Nothing here enforces a caseload limit. The suggestions respected one; the
 * people reviewing can go past it, and the interface shows caseloads so they
 * can do that knowingly.
 */

import Papa from 'papaparse';
import type { Roster } from '../data/roster';
import type { Proposal, StudentProposal } from '../matching/run';
import { ordinal } from '../ui/format';

export type ReviewStatus = 'unreviewed' | 'confirmed' | 'changed' | 'no-mentor';

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  unreviewed: 'Not yet reviewed',
  confirmed: 'Confirmed',
  changed: 'Changed',
  'no-mentor': 'No mentor for now',
};

export interface Decision {
  /** The mentor this student is currently set up with, or null. */
  mentorId: string | null;
  reviewed: boolean;
}

export interface ReviewSession {
  id: string;
  sourceFileName: string;
  startedAt: string;
  updatedAt: string;
  /** People left out of the run, so a resumed review rebuilds the same roster. */
  excludedIds: string[];
  proposal: Proposal;
  decisions: Record<string, Decision>;
}

export type ReviewAction =
  | { type: 'choose'; studentId: string; mentorId: string | null }
  | { type: 'confirm'; studentId: string }
  | { type: 'reset'; studentId: string };

export function startReview(
  proposal: Proposal,
  sourceFileName: string,
  excludedIds: Iterable<string>,
  now = new Date(),
): ReviewSession {
  const decisions: Record<string, Decision> = {};
  for (const s of proposal.students) decisions[s.studentId] = { mentorId: s.suggestedMentorId, reviewed: false };
  const stamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    sourceFileName,
    startedAt: stamp,
    updatedAt: stamp,
    excludedIds: [...excludedIds],
    proposal,
    decisions,
  };
}

export function reviewReducer(session: ReviewSession, action: ReviewAction, now = new Date()): ReviewSession {
  const student = session.proposal.students.find((s) => s.studentId === action.studentId);
  if (!student) return session;
  if (action.type === 'choose' && action.mentorId !== null && !session.proposal.mentorIds.includes(action.mentorId)) {
    return session;
  }

  const current = session.decisions[action.studentId];
  const next = decide(action, current, student);
  if (next.mentorId === current.mentorId && next.reviewed === current.reviewed) return session;

  return {
    ...session,
    updatedAt: now.toISOString(),
    decisions: { ...session.decisions, [action.studentId]: next },
  };
}

function decide(action: ReviewAction, current: Decision, student: StudentProposal): Decision {
  switch (action.type) {
    case 'choose':
      return { mentorId: action.mentorId, reviewed: true };
    case 'confirm':
      return { ...current, reviewed: true };
    case 'reset':
      return { mentorId: student.suggestedMentorId, reviewed: false };
  }
}

export function statusOf(session: ReviewSession, student: StudentProposal): ReviewStatus {
  const { mentorId, reviewed } = session.decisions[student.studentId];
  if (!reviewed) return 'unreviewed';
  if (mentorId === null) return 'no-mentor';
  return mentorId === student.suggestedMentorId ? 'confirmed' : 'changed';
}

/** Where a mentor sits in a student's list (1 = closest), or null. */
export function rankOf(student: StudentProposal, mentorId: string | null): number | null {
  if (mentorId === null) return null;
  return student.ranking.find((r) => r.mentorId === mentorId)?.rank ?? null;
}

export const closenessLabel = (rank: number) => (rank === 1 ? 'Closest match' : `${ordinal(rank)} closest match`);

export function progress(session: ReviewSession) {
  const counts: Record<ReviewStatus, number> = { unreviewed: 0, confirmed: 0, changed: 0, 'no-mentor': 0 };
  for (const s of session.proposal.students) counts[statusOf(session, s)]++;
  const total = session.proposal.students.length;
  return { ...counts, total, reviewed: total - counts.unreviewed };
}

export interface Caseload {
  /** Mentees already recorded in Airtable. */
  current: number;
  /** Students set up with this mentor in this review, reviewed or not. */
  inReview: string[];
}

export function caseloads(session: ReviewSession, roster: Roster): Map<string, Caseload> {
  const loads = new Map<string, Caseload>(
    session.proposal.mentorIds.map((id) => [id, { current: roster.studentsOfMentor.get(id)?.length ?? 0, inReview: [] }]),
  );
  for (const s of session.proposal.students) {
    const mentorId = session.decisions[s.studentId].mentorId;
    if (mentorId) loads.get(mentorId)?.inReview.push(s.studentId);
  }
  return loads;
}

/**
 * Students who most need a look come first: no suggestion at all, then the
 * suggestions furthest down a student's own list. The order is fixed by the
 * original suggestions, so the list doesn't reshuffle while someone works.
 */
export function reviewOrder(session: ReviewSession, nameOf: (id: string) => string): StudentProposal[] {
  const concern = (s: StudentProposal) => rankOf(s, s.suggestedMentorId) ?? Infinity;
  return [...session.proposal.students].sort((a, b) => {
    const byConcern = concern(b) - concern(a);
    return Number.isNaN(byConcern) || byConcern === 0 ? nameOf(a.studentId).localeCompare(nameOf(b.studentId)) : byConcern;
  });
}

/** The next student after `currentId` in review order that hasn't been reviewed, wrapping around. */
export function nextUnreviewed(order: StudentProposal[], session: ReviewSession, currentId: string | null): string | null {
  const start = currentId === null ? -1 : order.findIndex((s) => s.studentId === currentId);
  for (let step = 1; step <= order.length; step++) {
    const candidate = order[(start + step + order.length) % order.length];
    if (candidate.studentId !== currentId && !session.decisions[candidate.studentId].reviewed) return candidate.studentId;
  }
  return null;
}

// ---- Export ---------------------------------------------------------------

export const EXPORT_COLUMNS = [
  'Student Person ID',
  'Student Name',
  'Alumni Person ID',
  'Alumni Name',
  'Review Status',
  'Closeness',
] as const;

export type ExportRow = Record<(typeof EXPORT_COLUMNS)[number], string>;

/** One row per student-mentor pair, keyed on Airtable Person IDs. */
export function exportRows(
  session: ReviewSession,
  roster: Roster,
  { includeUnreviewed }: { includeUnreviewed: boolean },
): ExportRow[] {
  const nameOf = (id: string) => roster.byId.get(id)?.name ?? '';
  const rows: ExportRow[] = [];

  for (const student of session.proposal.students) {
    const { mentorId } = session.decisions[student.studentId];
    const status = statusOf(session, student);
    if (mentorId === null || (status === 'unreviewed' && !includeUnreviewed)) continue;
    const rank = rankOf(student, mentorId);
    rows.push({
      'Student Person ID': student.studentId,
      'Student Name': nameOf(student.studentId),
      'Alumni Person ID': mentorId,
      'Alumni Name': nameOf(mentorId),
      'Review Status': STATUS_LABEL[status],
      Closeness: rank === null ? '' : closenessLabel(rank),
    });
  }

  return rows.sort((a, b) => a['Student Name'].localeCompare(b['Student Name']));
}

/** CSV with a byte-order mark, so Excel shows accented names correctly. */
export function toCsv(rows: ExportRow[]): string {
  return '﻿' + Papa.unparse({ fields: [...EXPORT_COLUMNS], data: rows.map((r) => EXPORT_COLUMNS.map((c) => r[c])) });
}

// ---- Saving and resuming ----------------------------------------------------
//
// A saved review holds Airtable record ids, settings and each student's
// ranking - no names, emails or answers. Those come back when the export is
// opened again, which is also how the review is matched to the right people.

const SAVE_FORMAT = 'clasmentors-review';
const SAVE_VERSION = 1;

interface SavedStudent {
  id: string;
  /** Indexes into mentorIds. `order` lists mentors closest first; scores and answered follow that order. */
  suggested: number | null;
  order: number[];
  scores: number[];
  answered: number[];
  mentor: number | null;
  reviewed: boolean;
}

interface SavedReview {
  format: typeof SAVE_FORMAT;
  version: typeof SAVE_VERSION;
  id: string;
  sourceFileName: string;
  startedAt: string;
  updatedAt: string;
  excludedIds: string[];
  settings: Proposal['settings'];
  comparisonsUsed: Proposal['comparisonsUsed'];
  roundsUsed: number;
  mentorIds: string[];
  students: SavedStudent[];
}

export function serializeSession(session: ReviewSession): string {
  const { proposal } = session;
  const index = new Map(proposal.mentorIds.map((id, i) => [id, i]));
  const at = (id: string | null) => (id === null ? null : index.get(id)!);

  const saved: SavedReview = {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    id: session.id,
    sourceFileName: session.sourceFileName,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    excludedIds: session.excludedIds,
    settings: proposal.settings,
    comparisonsUsed: proposal.comparisonsUsed,
    roundsUsed: proposal.roundsUsed,
    mentorIds: proposal.mentorIds,
    students: proposal.students.map((s) => ({
      id: s.studentId,
      suggested: at(s.suggestedMentorId),
      order: s.ranking.map((r) => index.get(r.mentorId)!),
      // Ranks are stored explicitly, so rounding never reorders anything.
      scores: s.ranking.map((r) => Math.round(r.score * 1e4) / 1e4),
      answered: s.ranking.map((r) => r.answeredComparisons),
      mentor: at(session.decisions[s.studentId].mentorId),
      reviewed: session.decisions[s.studentId].reviewed,
    })),
  };
  return JSON.stringify(saved);
}

const NOT_A_SAVE = 'This isn’t a saved review from CLAS Mentor Match.';
const DAMAGED = 'This saved review is damaged and can’t be opened.';

export function parseSavedSession(text: string): ReviewSession {
  let saved: SavedReview;
  try {
    saved = JSON.parse(text);
  } catch {
    throw new Error(NOT_A_SAVE);
  }
  if (saved === null || typeof saved !== 'object' || saved.format !== SAVE_FORMAT) throw new Error(NOT_A_SAVE);
  if (saved.version !== SAVE_VERSION) {
    throw new Error('This saved review was made by a different version of the app and can’t be opened.');
  }

  try {
    const { mentorIds } = saved;
    const mentorAt = (i: number | null) => {
      if (i === null) return null;
      const id = mentorIds[i];
      if (typeof id !== 'string') throw new Error(DAMAGED);
      return id;
    };

    const decisions: Record<string, Decision> = {};
    const students: StudentProposal[] = saved.students.map((s) => {
      const n = mentorIds.length;
      if (typeof s.id !== 'string' || s.order.length !== n || s.scores.length !== n || s.answered.length !== n) {
        throw new Error(DAMAGED);
      }
      decisions[s.id] = { mentorId: mentorAt(s.mentor), reviewed: s.reviewed === true };
      return {
        studentId: s.id,
        suggestedMentorId: mentorAt(s.suggested),
        ranking: s.order.map((m, i) => ({
          mentorId: mentorAt(m)!,
          rank: i + 1,
          score: s.scores[i],
          answeredComparisons: s.answered[i],
        })),
      };
    });

    return {
      id: saved.id,
      sourceFileName: saved.sourceFileName,
      startedAt: saved.startedAt,
      updatedAt: saved.updatedAt,
      excludedIds: [...saved.excludedIds],
      proposal: {
        settings: saved.settings,
        comparisonsUsed: saved.comparisonsUsed,
        roundsUsed: saved.roundsUsed,
        mentorIds: [...mentorIds],
        students,
      },
      decisions,
    };
  } catch {
    throw new Error(DAMAGED);
  }
}

export interface Compatibility {
  /** Whether the review can be resumed against this file. */
  ok: boolean;
  /** Students or mentors in the saved review who aren't in the file (or changed role). */
  missingPeople: number;
  /** Students in the file who need a mentor but weren't part of the saved review. */
  newStudents: number;
  /** Students in the saved review who have since been matched in Airtable. */
  nowMatchedInAirtable: number;
}

export function checkCompatibility(session: ReviewSession, roster: Roster): Compatibility {
  const hasRole = (id: string, role: 'student' | 'mentor') => roster.byId.get(id)?.role === role;
  const missingPeople =
    session.proposal.students.filter((s) => !hasRole(s.studentId, 'student')).length +
    session.proposal.mentorIds.filter((id) => !hasRole(id, 'mentor')).length;

  const inReview = new Set(session.proposal.students.map((s) => s.studentId));
  const newStudents = roster.studentsToMatch.filter((s) => !inReview.has(s.id)).length;
  const nowMatchedInAirtable = session.proposal.students.filter(
    (s) => (roster.mentorsOfStudent.get(s.studentId)?.length ?? 0) > 0,
  ).length;

  return { ok: missingPeople === 0, missingPeople, newStudents, nowMatchedInAirtable };
}
