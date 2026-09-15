import type { Roster } from '../data/roster';
import type { Proposal, StudentProposal } from '../matching/run';
import { joinNames, ordinal, plural } from '../ui/format';

interface Props {
  roster: Roster;
  proposal: Proposal;
  onChangeSettings: () => void;
}

export function ResultsPreview({ roster, proposal, onChangeSettings }: Props) {
  const nameOf = (id: string) => roster.byId.get(id)?.name ?? 'someone not in this file';

  const suggestedFor = new Map<string, string[]>();
  for (const s of proposal.students) {
    if (s.suggestedMentorId) suggestedFor.set(s.suggestedMentorId, [...(suggestedFor.get(s.suggestedMentorId) ?? []), s.studentId]);
  }
  const currentLoad = (mentorId: string) => roster.studentsOfMentor.get(mentorId)?.length ?? 0;

  const withSuggestion = proposal.students.filter((s) => s.suggestedMentorId).length;
  const mentorsWithStudents = proposal.mentorIds.filter((id) => currentLoad(id) + (suggestedFor.get(id)?.length ?? 0) > 0).length;
  const closest = proposal.students.filter((s) => s.suggestedMentorId && s.ranking[0]?.mentorId === s.suggestedMentorId).length;

  const rows = [...proposal.students].sort((a, b) => nameOf(a.studentId).localeCompare(nameOf(b.studentId)));

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h1>Suggested matches</h1>
          <p className="lede">A starting point to review, based on what students and mentors wrote.</p>
        </div>
        <button type="button" className="secondary" onClick={onChangeSettings}>
          Change settings
        </button>
      </div>

      <div className="callout note">
        <strong>Preview.</strong> Going through each student, changing suggestions and exporting for Airtable are
        coming next.
      </div>

      <div className="stats">
        <div className="stat">
          <span className="stat-value">
            {withSuggestion}
            <span className="stat-of"> of {proposal.students.length}</span>
          </span>
          <span className="stat-label">students have a suggested mentor</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {mentorsWithStudents}
            <span className="stat-of"> of {proposal.mentorIds.length}</span>
          </span>
          <span className="stat-label">mentors have at least one student</span>
        </div>
        <div className="stat">
          <span className="stat-value">{closest}</span>
          <span className="stat-label">students were suggested their closest match</span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="results">
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">Suggested mentor</th>
              <th scope="col">How close</th>
              <th scope="col">Mentor's students</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((student) => {
              const person = roster.byId.get(student.studentId);
              const mentor = student.suggestedMentorId ? roster.byId.get(student.suggestedMentorId) : undefined;
              const current = mentor ? currentLoad(mentor.id) : 0;
              const suggested = mentor ? (suggestedFor.get(mentor.id)?.length ?? 0) : 0;
              return (
                <tr key={student.studentId}>
                  <td>
                    <span className="cell-main">{person?.name}</span>
                    <span className="cell-sub">{person?.fields['Majors']}</span>
                  </td>
                  <td>
                    {mentor ? (
                      <>
                        <span className="cell-main">{mentor.name}</span>
                        <span className="cell-sub">{mentor.fields['Job Title and Employer']}</span>
                      </>
                    ) : (
                      <span className="muted">No suggestion</span>
                    )}
                  </td>
                  <td>
                    <Closeness student={student} nameOf={nameOf} suggestedFor={suggestedFor} currentLoad={currentLoad} />
                  </td>
                  <td>
                    {mentor && (
                      <>
                        <span className="cell-main">{plural(current + suggested, 'student')}</span>
                        {current > 0 && (
                          <span className="cell-sub">
                            {current} current · {suggested} suggested
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Closeness({
  student,
  nameOf,
  suggestedFor,
  currentLoad,
}: {
  student: StudentProposal;
  nameOf: (id: string) => string;
  suggestedFor: Map<string, string[]>;
  currentLoad: (mentorId: string) => number;
}) {
  if (!student.suggestedMentorId) {
    return <span className="muted">Every mentor is at the limit</span>;
  }
  const rank = student.ranking.find((r) => r.mentorId === student.suggestedMentorId)?.rank ?? 0;
  if (rank === 1) return <span className="closeness is-closest">Closest match</span>;

  // Everyone who was a closer fit, and why they weren't suggested for this student.
  const closer = student.ranking.slice(0, rank - 1).map(({ mentorId }) => {
    const others = suggestedFor.get(mentorId) ?? [];
    const current = currentLoad(mentorId);
    const reason = others.length
      ? `suggested for ${joinNames(others.map(nameOf), 1)}`
      : current > 0
        ? `already mentoring ${plural(current, 'student')}`
        : null;
    return reason ? `${nameOf(mentorId)} (${reason})` : nameOf(mentorId);
  });

  return (
    <>
      <span className="closeness">{ordinal(rank)} closest match</span>
      <span className="cell-sub">Closer: {joinNames(closer, 2)}</span>
    </>
  );
}
