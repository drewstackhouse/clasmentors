import { useRef, useState, type DragEvent } from 'react';
import type { Issue } from '../data/issues';

interface Props {
  onFile: (file: File) => void;
  /** Name of a file that was opened but couldn't be used. */
  rejectedFile?: string;
  problems: Issue[];
}

export function ImportStep({ onFile, rejectedFile, problems }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const errors = problems.filter((p) => p.severity === 'error');

  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <section className="panel import">
      <h1>Match students with alumni mentors</h1>
      <p className="lede">
        Start with the People export from Airtable: one CSV file with both current students and alumni
        mentors.
      </p>

      <div
        className={`dropzone${dragging ? ' is-dragging' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <p className="dropzone-title">Drop your CSV file here</p>
        <p className="dropzone-sub">
          or <span className="link">choose a file</span>
        </p>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          hidden
          data-testid="file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = '';
          }}
        />
      </div>

      <p className="privacy">
        Your file stays on this computer. Everything runs in your browser, and nothing is uploaded.
      </p>

      {rejectedFile && errors.length > 0 && (
        <div className="callout error" role="alert">
          <strong>{rejectedFile} couldn't be used.</strong>
          {errors.map((e) => (
            <p key={e.kind}>{e.message}</p>
          ))}
        </div>
      )}
    </section>
  );
}
