import { useMemo, useState } from 'react';
import { decodeCsv, parseRoster, type ParseResult } from './data/parse';
import { buildRoster } from './data/roster';
import { embedder } from './embed/client';
import { DEFAULT_SETTINGS, proposeMatches, type MatchSettings, type Proposal } from './matching/run';
import { ImportStep } from './components/ImportStep';
import { PrepareStep } from './components/PrepareStep';
import { RunningStep, type RunProgress } from './components/RunningStep';
import { ResultsPreview } from './components/ResultsPreview';

interface LoadedFile {
  name: string;
  parsed: ParseResult;
}

const STEPS = ['Upload', 'Check and set up', 'Suggestions'] as const;

export default function App() {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [settings, setSettings] = useState<MatchSettings>(() => structuredClone(DEFAULT_SETTINGS));
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);

  const roster = useMemo(
    () => (file && file.parsed.people.length > 0 ? buildRoster(file.parsed.people, file.parsed.issues, excluded) : null),
    [file, excluded],
  );

  async function openFile(chosen: File) {
    const parsed = parseRoster(decodeCsv(await chosen.arrayBuffer()));
    setFile({ name: chosen.name, parsed });
    setExcluded(new Set());
    setProposal(null);
    setRunError(null);
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
    if (!roster) return;
    setRunError(null);
    setProposal(null);
    setProgress({ stage: 'engine', loadedBytes: 0, totalBytes: 0 });
    try {
      await embedder.load((p) => setProgress({ stage: 'engine', ...p }));
      setProgress({ stage: 'answers', done: 0, total: 0 });
      const result = await proposeMatches(roster, settings, embedder, (done, total) =>
        setProgress({ stage: 'answers', done, total }),
      );
      setProposal(result);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setProgress(null);
    }
  }

  function startOver() {
    setFile(null);
    setExcluded(new Set());
    setProposal(null);
    setRunError(null);
  }

  const stepIndex = proposal ? 2 : roster ? 1 : 0;

  let view;
  if (progress) {
    view = <RunningStep progress={progress} />;
  } else if (roster && proposal) {
    view = <ResultsPreview roster={roster} proposal={proposal} onChangeSettings={() => setProposal(null)} />;
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
      />
    );
  } else {
    view = <ImportStep onFile={openFile} rejectedFile={file?.name} problems={file?.parsed.issues ?? []} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          CLAS Mentor Match
        </div>
        {file && !progress && (
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
