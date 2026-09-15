import { useRef } from 'react';
import type { Issue, IssueKind } from '../data/issues';
import type { Roster } from '../data/roster';
import { ROLE_LABEL } from '../data/schema';
import { capacityCheck, type MatchSettings } from '../matching/run';
import { progress as reviewProgress, type Compatibility, type ReviewSession } from '../review/session';
import { formatWhen } from '../ui/dates';
import { plural } from '../ui/format';
import { PairingsEditor } from './PairingsEditor';

/** Issues about particular people where leaving them out of the run is a sensible fix. */
const OFFER_EXCLUSION: ReadonlySet<IssueKind> = new Set(['duplicate-email', 'answered-other-role', 'no-profile-text']);

const MAX_PER_MENTOR_LIMIT = 10;

interface Props {
  roster: Roster;
  columns: string[];
  fileName: string;
  settings: MatchSettings;
  onSettingsChange: (settings: MatchSettings) => void;
  onToggleExcluded: (personId: string) => void;
  onSuggest: () => void;
  runError: string | null;
  /** Reviews saved in this browser that fit this file. */
  resumable: { saved: ReviewSession; compat: Compatibility }[];
  onResume: (saved: ReviewSession, compat: Compatibility) => void;
  onOpenProgressFile: (file: File) => void;
  resumeError: string | null;
}

export function PrepareStep({
  roster,
  columns,
  fileName,
  settings,
  onSettingsChange,
  onToggleExcluded,
  onSuggest,
  runError,
  resumable,
  onResume,
  onOpenProgressFile,
  resumeError,
}: Props) {
  const progressInput = useRef<HTMLInputElement>(null);

  const blocking = roster.issues.filter((i) => i.severity === 'error');
  const notes = roster.issues.filter((i) => i.severity !== 'error');
  const capacity = capacityCheck(roster, settings.maxPerMentor);
  const hasComparison = settings.pairings.some((p) => p.weight > 0);
  const canSuggest = blocking.length === 0 && hasComparison && capacity.students > 0 && roster.mentors.length > 0;

  const excludedMentors = roster.people.filter((p) => p.role === 'mentor' && roster.excluded.has(p.id)).length;
  const excludedStudents = roster.people.filter(
    (p) => p.role === 'student' && roster.excluded.has(p.id) && !roster.mentorsOfStudent.get(p.id)?.length,
  ).length;

  const setMax = (value: number) =>
    onSettingsChange({ ...settings, maxPerMentor: Math.min(MAX_PER_MENTOR_LIMIT, Math.max(1, Math.round(value) || 1)) });

  return (
    <section className="panel">
      <h1>Check your data and set up matching</h1>
      <p className="lede">
        From <strong>{fileName}</strong>
      </p>

      {resumable.map(({ saved, compat }) => {
        const done = reviewProgress(saved);
        return (
          <div className="callout resume" key={saved.id}>
            <div>
              <strong>You have a review in progress for these students.</strong>
              <p>
                {done.reviewed} of {done.total} reviewed · last changed {formatWhen(saved.updatedAt)}
              </p>
            </div>
            <button type="button" className="primary" onClick={() => onResume(saved, compat)}>
              Continue review
            </button>
          </div>
        );
      })}
      <p className="resume-file">
        Continuing a review from another computer?{' '}
        <button type="button" className="link-button inline" onClick={() => progressInput.current?.click()}>
          Open a progress file
        </button>
        <input
          ref={progressInput}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="progress-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onOpenProgressFile(file);
            e.target.value = '';
          }}
        />
      </p>
      {resumeError && (
        <div className="callout error" role="alert">
          {resumeError}
        </div>
      )}

      <div className="stats">
        <div className="stat">
          <span className="stat-value">{capacity.students}</span>
          <span className="stat-label">
            students need a mentor
            {excludedStudents > 0 && <span className="muted"> ({excludedStudents} left out)</span>}
          </span>
        </div>
        <div className="stat">
          <span className="stat-value">{roster.mentors.length}</span>
          <span className="stat-label">
            mentors available
            {excludedMentors > 0 && <span className="muted"> ({excludedMentors} left out)</span>}
          </span>
        </div>
        <div className="stat">
          <span className="stat-value">{roster.alreadyMatchedStudents.length}</span>
          <span className="stat-label">students already have a mentor and won't be changed</span>
        </div>
      </div>

      {blocking.length > 0 && (
        <div className="callout error" role="alert">
          {blocking.map((issue) => (
            <p key={issue.kind}>{issue.message}</p>
          ))}
        </div>
      )}

      <h2>Worth a look</h2>
      {notes.length === 0 ? (
        <p className="all-clear">Everything in this file looks ready to match.</p>
      ) : (
        <ul className="issues">
          {notes.map((issue, i) => (
            <IssueItem key={`${issue.kind}-${i}`} issue={issue} roster={roster} onToggleExcluded={onToggleExcluded} />
          ))}
        </ul>
      )}

      <h2>Matching settings</h2>

      <div className="field">
        <label className="field-label" htmlFor="max-per-mentor">
          Most students per mentor
        </label>
        <div className="stepper">
          <button
            type="button"
            aria-label="Fewer students per mentor"
            disabled={settings.maxPerMentor <= 1}
            onClick={() => setMax(settings.maxPerMentor - 1)}
          >
            −
          </button>
          <input
            id="max-per-mentor"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_PER_MENTOR_LIMIT}
            value={settings.maxPerMentor}
            onChange={(e) => setMax(Number(e.target.value))}
          />
          <button
            type="button"
            aria-label="More students per mentor"
            disabled={settings.maxPerMentor >= MAX_PER_MENTOR_LIMIT}
            onClick={() => setMax(settings.maxPerMentor + 1)}
          >
            +
          </button>
        </div>
        <p className="help">
          Suggestions won't give a mentor more students than this, counting anyone they already mentor. You can
          still assign more when reviewing.
        </p>
      </div>

      <label className="check check-block">
        <input
          type="checkbox"
          checked={settings.levelCaseloads}
          onChange={(e) => onSettingsChange({ ...settings, levelCaseloads: e.target.checked })}
        />
        <span>
          <strong>Give every mentor a student before anyone gets a second</strong>
          <span className="help">
            Recommended. More of your volunteers get a mentee, and suggestions are only very slightly less close
            on average.
          </span>
        </span>
      </label>

      <p className={`capacity${capacity.shortfall > 0 ? ' is-short' : ''}`} role="status">
        {capacity.shortfall === 0
          ? `There's room for ${plural(capacity.openSlots, 'student')}, enough for all ${capacity.students} who need a mentor.`
          : `There's only room for ${capacity.openSlots} of the ${capacity.students} students who need a mentor, so ${plural(
              capacity.shortfall,
              'student',
            )} won't get a suggestion. Allow more students per mentor, or add mentors.`}
      </p>

      <details className="advanced">
        <summary>
          What to compare <span className="muted">(advanced)</span>
        </summary>
        <p className="help">
          Suggestions come from comparing what students wrote with what mentors wrote. The recommended
          comparisons suit most cohorts.
        </p>
        <PairingsEditor
          pairings={settings.pairings}
          columns={columns}
          onChange={(pairings) => onSettingsChange({ ...settings, pairings })}
        />
      </details>

      {runError && (
        <div className="callout error" role="alert">
          <strong>Something went wrong while suggesting matches.</strong>
          <p>{runError}</p>
          <p>Please try again. If it keeps happening, reload the page.</p>
        </div>
      )}

      <div className="actions">
        <button type="button" className="primary" disabled={!canSuggest} onClick={onSuggest}>
          Suggest matches
        </button>
        {!hasComparison && <span className="muted">Add at least one comparison to continue.</span>}
      </div>
    </section>
  );
}

function IssueItem({
  issue,
  roster,
  onToggleExcluded,
}: {
  issue: Issue;
  roster: Roster;
  onToggleExcluded: (personId: string) => void;
}) {
  const people = OFFER_EXCLUSION.has(issue.kind)
    ? issue.personIds.map((id) => roster.byId.get(id)).filter((p) => p !== undefined)
    : [];

  return (
    <li className={`issue issue-${issue.severity}`}>
      {issue.severity === 'info' && <span className="issue-badge">FYI</span>}
      <p>{issue.message}</p>
      {people.length > 0 && (
        <ul className="issue-people">
          {people.map((person) => (
            <li key={person.id}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={roster.excluded.has(person.id)}
                  onChange={() => onToggleExcluded(person.id)}
                />
                <span>
                  Leave <strong>{person.name}</strong> out of this run{' '}
                  <span className="muted">
                    ({ROLE_LABEL[person.role]}, row {person.row})
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
