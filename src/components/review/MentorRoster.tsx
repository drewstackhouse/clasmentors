import { useEffect, useState } from 'react';
import type { Roster } from '../../data/roster';
import type { Caseload, ReviewSession } from '../../review/session';
import { plural } from '../../ui/format';

type Sort = 'most' | 'fewest' | 'name';

interface Props {
  roster: Roster;
  session: ReviewSession;
  loads: Map<string, Caseload>;
  onClose: () => void;
  onSelectStudent: (studentId: string) => void;
}

export function MentorRoster({ roster, session, loads, onClose, onSelectStudent }: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('most');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nameOf = (id: string) => roster.byId.get(id)?.name ?? 'Someone not in this file';
  const rows = session.proposal.mentorIds.map((id) => {
    const load = loads.get(id) ?? { current: 0, inReview: [] };
    return { id, person: roster.byId.get(id), load, total: load.current + load.inReview.length };
  });
  const largest = Math.max(1, ...rows.map((r) => r.total));
  const withNone = rows.filter((r) => r.total === 0).length;

  const q = query.trim().toLowerCase();
  const visible = rows
    .filter(
      (r) =>
        !q ||
        (r.person?.name ?? '').toLowerCase().includes(q) ||
        (r.person?.fields['Job Title and Employer'] ?? '').toLowerCase().includes(q),
    )
    .sort((a, b) => {
      const byCount = sort === 'most' ? b.total - a.total : sort === 'fewest' ? a.total - b.total : 0;
      return byCount || nameOf(a.id).localeCompare(nameOf(b.id));
    });

  return (
    <aside className="drawer" aria-label="Mentor caseloads">
      <div className="drawer-head">
        <h2>Mentor caseloads</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close mentor caseloads">
          ×
        </button>
      </div>
      <p className="help">Current matches from Airtable, plus the students set up with each mentor in this review.</p>
      <p className="roster-summary">
        {plural(rows.length, 'mentor')} ·{' '}
        {withNone === 0 ? 'every mentor has at least one student' : `${withNone} with no students yet`}
      </p>

      <div className="drawer-controls">
        <input
          type="search"
          aria-label="Find a mentor"
          placeholder="Find a mentor"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select aria-label="Sort mentors" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="most">Most students first</option>
          <option value="fewest">Fewest students first</option>
          <option value="name">By name</option>
        </select>
      </div>

      <ul className="roster-rows">
        {visible.map(({ id, person, load, total }) => (
          <li key={id} className="roster-row">
            <div className="roster-row-head">
              <span className="roster-name">{person?.name ?? id}</span>
              <span className="roster-count" aria-label={plural(total, 'student')}>
                {total}
              </span>
            </div>
            {person?.fields['Job Title and Employer'] && (
              <span className="roster-job">{person.fields['Job Title and Employer']}</span>
            )}
            <div className="load-bar" aria-hidden="true">
              <span className="load-current" style={{ width: `${(load.current / largest) * 100}%` }} />
              <span className="load-review" style={{ width: `${(load.inReview.length / largest) * 100}%` }} />
            </div>
            <p className="roster-detail">
              {total === 0
                ? 'No students yet'
                : [load.current > 0 && `${load.current} current`, load.inReview.length > 0 && `${load.inReview.length} in this review`]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
            {load.inReview.length > 0 && (
              <ul className="roster-students">
                {load.inReview.map((studentId) => (
                  <li key={studentId}>
                    <button type="button" className="link-button inline" onClick={() => onSelectStudent(studentId)}>
                      {nameOf(studentId)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
