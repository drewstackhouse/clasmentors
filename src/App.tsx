import { useEffect, useMemo, useState } from 'react';
import { decodeCsv, parseRoster, type ParseResult } from './data/parse';
import { buildRoster } from './data/roster';
import { embedder } from './embed/client';
import { DEFAULT_SETTINGS, proposeMatches, type MatchSettings } from './matching/run';
import {
  checkCompatibility,
  parseSavedSession,
  progress as reviewProgress,
  reviewReducer,
  startReview,
  type Compatibility,
  type ReviewAction,
  type ReviewSession,
} from './review/session';
import { saveReview, savedReviews } from './review/storage';
import { plural } from './ui/format';
import { ImportStep } from './components/ImportStep';
import { PrepareStep } from './components/PrepareStep';
import { RunningStep, type RunProgress } from './components/RunningStep';
import { ReviewScreen } from './components/review/ReviewScreen';

interface LoadedFile {
  name: string;
  parsed: ParseResult;
}

const STEPS = ['Upload', 'Check and set up', 'Review'] as const;

const DISCARD_WARNING =
  'This closes the review you’re working on. It stays saved in this browser, and you can download a progress file first if you’d like a copy.\n\nContinue?';

function resumeNotices({ newStudents, nowMatchedInAirtable }: Compatibility): string[] {
  const notices: string[] = [];
  if (newStudents > 0) {
    notices.push(
      `${plural(newStudents, 'student')} in this file ${newStudents === 1 ? 'wasn’t' : 'weren’t'} part of this review. ` +
        'To include them, choose Change settings and suggest matches again.',
    );
  }
  if (nowMatchedInAirtable > 0) {
    notices.push(
      `${plural(nowMatchedInAirtable, 'student')} in this review ${nowMatchedInAirtable === 1 ? 'has' : 'have'} been matched ` +
        'in Airtable since the review started. Check for duplicates before exporting.',
    );
  }
  return notices;
}

export default function App() {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [settings, setSettings] = useState<MatchSettings>(() => structuredClone(DEFAULT_SETTINGS));
  const [runProgress, setRunProgress] = useState<RunProgress | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [resumeError, setResumeError] = useState<string | null>(null);

  const roster = useMemo(
    () => (file && file.parsed.people.length > 0 ? buildRoster(file.parsed.people, file.parsed.issues, excluded) : null),
    [file, excluded],
  );

  const reviewing = session !== null;
  const resumable = useMemo(() => {
    if (!file || file.parsed.people.length === 0 || reviewing) return [];
    return savedReviews()
      .map((saved) => ({
        saved,
        compat: checkCompatibility(saved, buildRoster(file.parsed.people, file.parsed.issues, new Set(saved.excludedIds))),
      }))
      .filter(({ compat }) => compat.ok);
  }, [file, reviewing]);

  // Save to this browser shortly after every change.
  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => setSaveState(saveReview(session) ? 'saved' : 'failed'), 400);
    return () => window.clearTimeout(timer);
  }, [session]);

  const confirmDiscard = () => !session || reviewProgress(session).reviewed === 0 || window.confirm(DISCARD_WARNING);

  async function openFile(chosen: File) {
    const parsed = parseRoster(decodeCsv(await chosen.arrayBuffer()));
    setFile({ name: chosen.name, parsed });
    setExcluded(new Set());
    setSession(null);
    setNotices([]);
    setRunError(null);
    setResumeError(null);
  }

  function toggleExcluded(id: string) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function suggestMatches() {
    if (!roster || !file) return;
    setRunError(null);
    setRunProgress({ stage: 'engine', loadedBytes: 0, totalBytes: 0 });
    try {
      await embedder.load((p) => setRunProgress({ stage: 'engine', ...p }));
      setRunProgress({ stage: 'answers', done: 0, total: 0 });
      const proposal = await proposeMatches(roster, settings, embedder, (done, total) =>
        setRunProgress({ stage: 'answers', done, total }),
      );
      setSession(startReview(proposal, file.name, excluded));
      setNotices([]);
      setSaveState('idle');
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunProgress(null);
    }
  }

  function dispatch(action: ReviewAction): ReviewSession {
    if (!session) throw new Error('No review is in progress.');
    const next = reviewReducer(session, action);
    setSession(next);
    return next;
  }

  function resume(saved: ReviewSession, compat: Compatibility) {
    setExcluded(new Set(saved.excludedIds));
    setSettings(structuredClone(saved.proposal.settings));
    setSession(saved);
    setNotices(resumeNotices(compat));
    setResumeError(null);
    setSaveState('idle');
  }

  async function openProgressFile(chosen: File) {
    if (!file) return;
    setResumeError(null);
    try {
      const saved = parseSavedSession(await chosen.text());
      const compat = checkCompatibility(saved, buildRoster(file.parsed.people, file.parsed.issues, new Set(saved.excludedIds)));
      if (!compat.ok) {
        setResumeError(
          `This progress file doesn’t match ${file.name}: ${plural(compat.missingPeople, 'person', 'people')} in the review ` +
            `${compat.missingPeople === 1 ? 'isn’t' : 'aren’t'} in it. Open the Airtable export the review was started from, then try again.`,
        );
        return;
      }
      resume(saved, compat);
    } catch (error) {
      setResumeError(error instanceof Error ? error.message : String(error));
    }
  }

  function changeSettings() {
    if (!confirmDiscard()) return;
    setSession(null);
    setNotices([]);
  }

  function startOver() {
    if (!confirmDiscard()) return;
    setFile(null);
    setExcluded(new Set());
    setSession(null);
    setNotices([]);
    setRunError(null);
    setResumeError(null);
  }

  const stepIndex = session ? 2 : roster ? 1 : 0;

  let view;
  if (runProgress) {
    view = <RunningStep progress={runProgress} />;
  } else if (roster && session) {
    view = (
      <ReviewScreen
        roster={roster}
        session={session}
        dispatch={dispatch}
        saveState={saveState}
        notices={notices}
        onChangeSettings={changeSettings}
      />
    );
  } else if (roster && file) {
    view = (
      <PrepareStep
        roster={roster}
        columns={file.parsed.columns}
        fileName={file.name}
        settings={settings}
        onSettingsChange={setSettings}
        onToggleExcluded={toggleExcluded}
        onSuggest={suggestMatches}
        runError={runError}
        resumable={resumable}
        onResume={resume}
        onOpenProgressFile={openProgressFile}
        resumeError={resumeError}
      />
    );
  } else {
    view = <ImportStep onFile={openFile} rejectedFile={file?.name} problems={file?.parsed.issues ?? []} />;
  }

  return (
    <div className={`app${session ? ' is-wide' : ''}`}>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          CLAS Mentor Match
        </div>
        {file && !runProgress && (
          <button type="button" className="link-button" onClick={startOver}>
            Start over with a different file
          </button>
        )}
      </header>

      <ol className="steps" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={i === stepIndex ? 'is-current' : i < stepIndex ? 'is-done' : undefined}
            aria-current={i === stepIndex ? 'step' : undefined}
          >
            <span className="step-number">{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <main>{view}</main>
    </div>
  );
}
