import type { Roster } from '../../data/roster';
import { STUDENT_TEXT_FIELDS } from '../../data/schema';
import type { StudentProposal } from '../../matching/run';
import {
  closenessLabel,
  rankOf,
  statusOf,
  type Caseload,
  type ReviewAction,
  type ReviewSession,
} from '../../review/session';
import { ordinal } from '../../ui/format';
import { MentorCard } from './MentorCard';
import { StatusPill } from './StatusIcon';

const SHOW_OPTIONS = [3, 5, 10, 20];

interface Props {
  student: StudentProposal;
  session: ReviewSession;
  roster: Roster;
  loads: Map<string, Caseload>;
  shown: number;
  onShownChange: (count: number) => void;
  dispatch: (action: ReviewAction) => ReviewSession;
  hasNextToReview: boolean;
  onNextToReview: (after: ReviewSession) => void;
  position: { index: number; count: number };
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
}

export function StudentPanel({
  student,
  session,
  roster,
  loads,
  shown,
  onShownChange,
  dispatch,
  hasNextToReview,
  onNextToReview,
  position,
  onPrevious,
  onNext,
}: Props) {
  const nameOf = (id: string) => roster.byId.get(id)?.name ?? 'Someone not in this file';
  const { studentId } = student;
  const person = roster.byId.get(studentId);
  const { mentorId, reviewed } = session.decisions[studentId];
  const status = statusOf(session, student);
  const chosenRank = rankOf(student, mentorId);
  const comparisonCount = session.proposal.comparisonsUsed.length;

  const answers = STUDENT_TEXT_FIELDS.filter((field) => person?.fields[field]);
  const details = [
    person?.fields['Majors'],
    person?.fields['Minors'] && `Minors: ${person.fields['Minors']}`,
    person?.fields['Class Year'] && `Class of ${person.fields['Class Year']}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const candidates = student.ranking.filter(
    (r) => r.rank <= shown || r.mentorId === mentorId || r.mentorId === student.suggestedMentorId,
  );
  const unlisted = student.ranking
    .filter((r) => !candidates.includes(r))
    .map((r) => ({ ranked: r, name: nameOf(r.mentorId) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const choose = (id: string | null) => dispatch({ type: 'choose', studentId, mentorId: id });

  return (
    <article className="student-panel" aria-labelledby="student-name">
      <header className="student-head">
        <div>
          <p className="eyebrow">
            Student {position.index + 1} of {position.count}
          </p>
          <h2 id="student-name">{person?.name}</h2>
          {details && <p className="muted">{details}</p>}
        </div>
        <div className="student-head-side">
          <StatusPill status={status} />
          <div className="student-nav">
            <button type="button" className="secondary small" disabled={!onPrevious} onClick={onPrevious ?? undefined}>
              ‹ Previous
            </button>
            <button type="button" className="secondary small" disabled={!onNext} onClick={onNext ?? undefined}>
              Next ›
            </button>
          </div>
        </div>
      </header>

      <section className="answers" aria-label="Student's answers">
        {answers.length > 0 ? (
          answers.map((field) => (
            <div className="answer" key={field}>
              <h3>{field}</h3>
              <p>{person!.fields[field]}</p>
            </div>
          ))
        ) : (
          <p className="muted">No answers to the student questions, so these suggestions are a rough guess.</p>
        )}
      </section>

      <div className={`choice-summary is-${status}`} role="status">
        {mentorId ? (
          <>
            Set up with <strong>{nameOf(mentorId)}</strong>
            {chosenRank !== null && <>, {closenessLabel(chosenRank).toLowerCase()}</>}
          </>
        ) : (
          'No mentor yet'
        )}
      </div>
      {mentorId !== null && mentorId === student.suggestedMentorId && chosenRank !== null && chosenRank > 1 && (
        <p className="help">
          Mentors closer to this student’s answers are set up with other students. You can still choose one:
          there’s no limit on how many students a mentor can take.
        </p>
      )}
      {student.suggestedMentorId === null && (
        <p className="help">
          There was no room under the per-mentor limit when suggestions were made. You can choose any mentor below.
        </p>
      )}

      <div className="candidates-head">
        <h3>Mentors to consider</h3>
        <label className="show-count">
          Show
          <select value={shown} onChange={(e) => onShownChange(Number(e.target.value))}>
            {SHOW_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} closest
              </option>
            ))}
          </select>
        </label>
      </div>

      <ol className="candidates">
        {candidates.map((ranked) => {
          const mentor = roster.byId.get(ranked.mentorId);
          if (!mentor) return null;
          return (
            <li key={ranked.mentorId}>
              <MentorCard
                mentor={mentor}
                ranked={ranked}
                comparisonCount={comparisonCount}
                caseload={loads.get(ranked.mentorId) ?? { current: 0, inReview: [] }}
                studentId={studentId}
                isSuggested={ranked.mentorId === student.suggestedMentorId}
                isChosen={ranked.mentorId === mentorId}
                nameOf={nameOf}
                onChoose={() => choose(ranked.mentorId)}
              />
            </li>
          );
        })}
      </ol>

      {unlisted.length > 0 && (
        <label className="any-mentor">
          <span>Or choose any other mentor</span>
          <select value="" onChange={(e) => e.target.value && choose(e.target.value)}>
            <option value="">Select a mentor…</option>
            {unlisted.map(({ ranked, name }) => (
              <option key={ranked.mentorId} value={ranked.mentorId}>
                {name} ({ordinal(ranked.rank)} closest)
              </option>
            ))}
          </select>
        </label>
      )}

      <footer className="student-actions">
        {!reviewed && mentorId && (
          <button type="button" className="primary" onClick={() => onNextToReview(dispatch({ type: 'confirm', studentId }))}>
            Confirm {nameOf(mentorId)} and go to next
          </button>
        )}
        {!reviewed && !mentorId && (
          <button
            type="button"
            className="primary"
            onClick={() => onNextToReview(dispatch({ type: 'choose', studentId, mentorId: null }))}
          >
            Leave without a mentor for now
          </button>
        )}
        {reviewed && (
          <button type="button" className="primary" disabled={!hasNextToReview} onClick={() => onNextToReview(session)}>
            {hasNextToReview ? 'Go to next student to review' : 'Everyone has been reviewed'}
          </button>
        )}
        {mentorId && (
          <button type="button" className="secondary" onClick={() => choose(null)}>
            No mentor for now
          </button>
        )}
        {reviewed && (
          <button type="button" className="link-button" onClick={() => dispatch({ type: 'reset', studentId })}>
            {student.suggestedMentorId ? 'Undo, back to the suggestion' : 'Undo'}
          </button>
        )}
      </footer>
    </article>
  );
}
