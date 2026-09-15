import { useEffect, useRef, useState } from 'react';
import type { Roster } from '../../data/roster';
import { exportRows, progress, statusOf, toCsv, type ReviewSession } from '../../review/session';
import { today } from '../../ui/dates';
import { downloadText } from '../../ui/download';
import { plural } from '../../ui/format';

interface Props {
  session: ReviewSession;
  roster: Roster;
  onClose: () => void;
}

export function ExportDialog({ session, roster, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [includeUnreviewed, setIncludeUnreviewed] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const counts = progress(session);
  const pendingWithMentor = session.proposal.students.filter(
    (s) => statusOf(session, s) === 'unreviewed' && session.decisions[s.studentId].mentorId !== null,
  ).length;
  const rows = exportRows(session, roster, { includeUnreviewed });

  const download = () => {
    downloadText(`mentor-matches-${today()}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
    dialog.current?.close();
  };

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} aria-labelledby="export-title">
      <h2 id="export-title">Export for Airtable</h2>
      <p>
        Downloads a CSV with one row for each student and their mentor, identified by Airtable Person IDs. Names, the
        review status and how close each match was are included for reference.
      </p>

      <fieldset>
        <legend className="visually-hidden">Which matches to include</legend>
        <label className="check">
          <input type="radio" name="export-scope" checked={!includeUnreviewed} onChange={() => setIncludeUnreviewed(false)} />
          <span>
            <strong>Only students you’ve reviewed</strong>
            <span className="help">{plural(counts.confirmed + counts.changed, 'match', 'matches')}</span>
          </span>
        </label>
        <label className="check">
          <input
            type="radio"
            name="export-scope"
            checked={includeUnreviewed}
            disabled={pendingWithMentor === 0}
            onChange={() => setIncludeUnreviewed(true)}
          />
          <span>
            <strong>Also include suggestions nobody has reviewed yet</strong>
            <span className="help">
              {pendingWithMentor === 0
                ? 'None left'
                : `${plural(pendingWithMentor, 'more match', 'more matches')}, marked “Not yet reviewed”`}
            </span>
          </span>
        </label>
      </fieldset>

      {counts['no-mentor'] > 0 && (
        <p className="help">
          {plural(counts['no-mentor'], 'student')} marked “No mentor for now” won’t be included.
        </p>
      )}

      <div className="dialog-actions">
        <button type="button" className="secondary" onClick={() => dialog.current?.close()}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={rows.length === 0} onClick={download}>
          Download {plural(rows.length, 'match', 'matches')}
        </button>
      </div>
    </dialog>
  );
}
