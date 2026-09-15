import type { Roster } from '../../data/roster';
import type { StudentProposal } from '../../matching/run';
import { STATUS_LABEL, rankOf, statusOf, type ReviewSession, type ReviewStatus } from '../../review/session';
import { ordinal } from '../../ui/format';
import { StatusIcon } from './StatusIcon';

export type StudentFilter = 'all' | ReviewStatus;

const FILTERS: { value: StudentFilter; label: string }[] = [
  { value: 'all', label: 'All students' },
  { value: 'unreviewed', label: 'Not yet reviewed' },
  { value: 'changed', label: 'Changed' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'no-mentor', label: 'No mentor for now' },
];

interface Props {
  students: StudentProposal[];
  session: ReviewSession;
  roster: Roster;
  selectedId: string | null;
  onSelect: (studentId: string) => void;
  filter: StudentFilter;
  onFilterChange: (filter: StudentFilter) => void;
  query: string;
  onQueryChange: (query: string) => void;
  counts: Record<ReviewStatus, number> & { total: number };
}

export function StudentList({
  students,
  session,
  roster,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  counts,
}: Props) {
  const nameOf = (id: string) => roster.byId.get(id)?.name ?? 'Someone not in this file';

  return (
    <aside className="student-list" aria-label="Students">
      <div className="student-list-controls">
        <input
          type="search"
          aria-label="Find a student"
          placeholder="Find a student"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <select
          aria-label="Which students to show"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value as StudentFilter)}
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label} ({f.value === 'all' ? counts.total : counts[f.value]})
            </option>
          ))}
        </select>
        <p className="list-hint">Students who most need a look are at the top.</p>
      </div>

      {students.length === 0 ? (
        <p className="list-empty">No students match.</p>
      ) : (
        <ul className="student-items">
          {students.map((student) => {
            const status = statusOf(session, student);
            const mentorId = session.decisions[student.studentId].mentorId;
            const rank = rankOf(student, mentorId);
            const selected = student.studentId === selectedId;
            return (
              <li key={student.studentId}>
                <button
                  type="button"
                  className={`student-item${selected ? ' is-selected' : ''}`}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onSelect(student.studentId)}
                >
                  <StatusIcon status={status} />
                  <span className="student-item-text">
                    <span className="student-item-name">{nameOf(student.studentId)}</span>
                    <span className="student-item-sub">
                      <span className="visually-hidden">{STATUS_LABEL[status]}. </span>
                      {mentorId && rank
                        ? `${nameOf(mentorId)} · ${rank === 1 ? 'closest' : `${ordinal(rank)} closest`}`
                        : 'No mentor yet'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
