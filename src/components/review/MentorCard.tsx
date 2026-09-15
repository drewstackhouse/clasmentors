import { useState } from 'react';
import type { Person } from '../../data/schema';
import type { RankedMentor } from '../../matching/run';
import type { Caseload } from '../../review/session';
import { joinNames, ordinal, plural } from '../../ui/format';

interface Props {
  mentor: Person;
  ranked: RankedMentor;
  /** Comparisons the run used, to spot scores built on blank answers. */
  comparisonCount: number;
  caseload: Caseload;
  /** The student being reviewed, left out of "also set up with". */
  studentId: string;
  isSuggested: boolean;
  isChosen: boolean;
  nameOf: (id: string) => string;
  onChoose: () => void;
}

export function MentorCard({
  mentor,
  ranked,
  comparisonCount,
  caseload,
  studentId,
  isSuggested,
  isChosen,
  nameOf,
  onChoose,
}: Props) {
  const others = caseload.inReview.filter((id) => id !== studentId);
  const job = mentor.fields['Job Title and Employer'];
  const why = mentor.fields['Why Mentor Statement'];
  const background = [
    mentor.fields['Majors'] && `Majors: ${mentor.fields['Majors']}`,
    mentor.fields['Minors'] && `Minors: ${mentor.fields['Minors']}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const load = [
    caseload.current > 0 ? `Already mentoring ${plural(caseload.current, 'student')}` : null,
    others.length > 0
      ? `${caseload.current > 0 ? 'also set' : 'Set'} up with ${joinNames(others.map(nameOf), 2)} in this review`
      : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className={`mentor-card${isChosen ? ' is-chosen' : ''}`}>
      <div className="mentor-card-head">
        <span className={`rank${ranked.rank === 1 ? ' is-closest' : ''}`}>
          {ranked.rank === 1 ? 'Closest' : `${ordinal(ranked.rank)} closest`}
        </span>
        {isSuggested && <span className="tag">Suggested</span>}
        <span className="spacer" />
        {isChosen ? (
          <span className="chosen-mark">✓ Chosen</span>
        ) : (
          <button type="button" className="secondary small" onClick={onChoose} aria-label={`Choose ${mentor.name}`}>
            Choose
          </button>
        )}
      </div>

      <h4 className="mentor-name">{mentor.name}</h4>
      {job && <p className="mentor-job">{job}</p>}
      {background && <p className="mentor-meta">{background}</p>}
      {why && <Expandable label="Why they want to mentor" text={why} />}

      <p className={`caseload-line${load ? '' : ' is-empty'}`}>{load || 'No students yet'}</p>
      {ranked.answeredComparisons < comparisonCount && (
        <p className="rough">Some answers were left blank, so this is a rougher guess.</p>
      )}
    </div>
  );
}

function Expandable({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 240;
  return (
    <div className="mentor-why">
      <span className="mentor-why-label">{label}</span>
      <p>
        {open || !long ? text : `${text.slice(0, 220).trimEnd()}…`}
        {long && (
          <>
            {' '}
            <button type="button" className="link-button inline" onClick={() => setOpen((o) => !o)}>
              {open ? 'Show less' : 'Show more'}
            </button>
          </>
        )}
      </p>
    </div>
  );
}
