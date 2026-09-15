import { megabytes } from '../ui/format';

export type RunProgress =
  | { stage: 'engine'; loadedBytes: number; totalBytes: number }
  | { stage: 'answers'; done: number; total: number };

export function RunningStep({ progress }: { progress: RunProgress }) {
  let title: string;
  let detail: string;
  let fraction: number | null;

  if (progress.stage === 'engine') {
    title = 'Getting the matching engine ready';
    if (progress.totalBytes > 0) {
      fraction = progress.loadedBytes / progress.totalBytes;
      detail = `Downloading ${megabytes(progress.loadedBytes)} of ${megabytes(progress.totalBytes)} MB. This can take a minute the first time.`;
    } else {
      fraction = null;
      detail = 'This usually takes a few seconds.';
    }
  } else {
    title = 'Reading everyone’s answers';
    fraction = progress.total > 0 ? progress.done / progress.total : null;
    detail = progress.total > 0 ? `${progress.done} of ${progress.total} answers` : 'Almost done…';
  }

  return (
    <section className="panel running" aria-live="polite" aria-busy="true">
      <h1>{title}</h1>
      <div
        className={`progress${fraction === null ? ' is-indeterminate' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}
      >
        <div className="progress-bar" style={fraction === null ? undefined : { width: `${fraction * 100}%` }} />
      </div>
      <p className="muted">{detail}</p>
    </section>
  );
}
