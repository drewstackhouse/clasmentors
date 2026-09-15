import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Roster } from '../../data/roster';
import {
  caseloads,
  nextUnreviewed,
  progress,
  reviewOrder,
  serializeSession,
  statusOf,
  type ReviewAction,
  type ReviewSession,
} from '../../review/session';
import { today } from '../../ui/dates';
import { downloadText } from '../../ui/download';
import { ExportDialog } from './ExportDialog';
import { MentorRoster } from './MentorRoster';
import { StudentList, type StudentFilter } from './StudentList';
import { StudentPanel } from './StudentPanel';

interface Props {
  roster: Roster;
  session: ReviewSession;
  dispatch: (action: ReviewAction) => ReviewSession;
  saveState: 'idle' | 'saved' | 'failed';
  notices: string[];
  onChangeSettings: () => void;
}

export function ReviewScreen({ roster, session, dispatch, saveState, notices, onChangeSettings }: Props) {
  const nameOf = useCallback((id: string) => roster.byId.get(id)?.name ?? '', [roster]);

  // Fixed by the original suggestions, so the list doesn't reshuffle while people work.
  const { proposal } = session;
  const order = useMemo(() => reviewOrder({ ...session, proposal }, nameOf), [proposal, nameOf]); // eslint-disable-line react-hooks/exhaustive-deps

  const [selectedId, setSelectedId] = useState<string | null>(
    () => nextUnreviewed(order, session, null) ?? order[0]?.studentId ?? null,
  );
  const [filter, setFilter] = useState<StudentFilter>('all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(5);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const loads = useMemo(() => caseloads(session, roster), [session, roster]);
  const counts = progress(session);

  const q = query.trim().toLowerCase();
  const visible = order.filter(
    (s) => (filter === 'all' || statusOf(session, s) === filter) && (!q || nameOf(s.studentId).toLowerCase().includes(q)),
  );
  const selected = order.find((s) => s.studentId === selectedId) ?? null;

  // Previous/next follow the list as filtered, falling back to the full order if the student was filtered out.
  const within = visible.some((s) => s.studentId === selectedId) ? visible : order;
  const index = within.findIndex((s) => s.studentId === selectedId);
  const previousId = index > 0 ? within[index - 1].studentId : null;
  const nextId = index >= 0 && index < within.length - 1 ? within[index + 1].studentId : null;

  useEffect(() => {
    const top = panel.current?.getBoundingClientRect().top;
    if (top !== undefined && top < 0) panel.current?.scrollIntoView({ block: 'start' });
  }, [selectedId]);

  const closeRoster = useCallback(() => setRosterOpen(false), []);

  const goToNextToReview = (after: ReviewSession) => {
    if (selectedId === null) return;
    const next = nextUnreviewed(order, after, selectedId);
    if (next) setSelectedId(next);
  };

  const saveProgressFile = () =>
    downloadText(`mentor-review-progress-${today()}.json`, serializeSession(session), 'application/json');

  return (
    <section className="review">
      <div className="panel review-toolbar">
        <div className="review-title">
          <h1>Review suggestions</h1>
          <div className="review-progress">
            <div
              className="progress"
              role="progressbar"
              aria-label="Students reviewed"
              aria-valuemin={0}
              aria-valuemax={counts.total}
              aria-valuenow={counts.reviewed}
            >
              <div className="progress-bar" style={{ width: `${(counts.reviewed / Math.max(1, counts.total)) * 100}%` }} />
            </div>
            <span>
              <strong>{counts.reviewed}</strong> of {counts.total} reviewed
            </span>
          </div>
          {saveState === 'saved' && <span className="save-state">Saved in this browser</span>}
          {saveState === 'failed' && (
            <span className="save-state is-failed">This browser couldn’t save your progress. Use “Save progress file”.</span>
          )}
        </div>
        <div className="review-actions">
          <button type="button" className="secondary" aria-expanded={rosterOpen} onClick={() => setRosterOpen((o) => !o)}>
            Mentor caseloads
          </button>
          <button type="button" className="secondary" onClick={saveProgressFile}>
            Save progress file
          </button>
          <button type="button" className="primary" onClick={() => setExporting(true)}>
            Export for Airtable
          </button>
          <button type="button" className="link-button" onClick={onChangeSettings}>
            Change settings
          </button>
        </div>
      </div>

      {notices.map((notice) => (
        <div key={notice} className="callout note">
          {notice}
        </div>
      ))}
      {counts.unreviewed === 0 && (
        <div className="callout success" role="status">
          Every student has been reviewed. Export for Airtable when you’re ready.
        </div>
      )}

      <div className="review-body">
        <StudentList
          students={visible}
          session={session}
          roster={roster}
          selectedId={selectedId}
          onSelect={setSelectedId}
          filter={filter}
          onFilterChange={setFilter}
          query={query}
          onQueryChange={setQuery}
          counts={counts}
        />
        <div ref={panel} className="student-panel-wrap">
          {selected ? (
            <StudentPanel
              key={selected.studentId}
              student={selected}
              session={session}
              roster={roster}
              loads={loads}
              shown={shown}
              onShownChange={setShown}
              dispatch={dispatch}
              hasNextToReview={nextUnreviewed(order, session, selected.studentId) !== null}
              onNextToReview={goToNextToReview}
              position={{ index: order.indexOf(selected), count: order.length }}
              onPrevious={previousId ? () => setSelectedId(previousId) : null}
              onNext={nextId ? () => setSelectedId(nextId) : null}
            />
          ) : (
            <div className="panel">Choose a student from the list.</div>
          )}
        </div>
      </div>

      {rosterOpen && (
        <MentorRoster
          roster={roster}
          session={session}
          loads={loads}
          onClose={closeRoster}
          onSelectStudent={(id) => {
            setSelectedId(id);
            setRosterOpen(false);
          }}
        />
      )}
      {exporting && <ExportDialog session={session} roster={roster} onClose={() => setExporting(false)} />}
    </section>
  );
}
