import { MENTOR_TEXT_FIELDS, SHARED_FIELDS, STUDENT_TEXT_FIELDS } from '../data/schema';
import { DEFAULT_PAIRINGS, type FieldPairing } from '../matching/score';

const IMPORTANCE = [
  { weight: 1, label: 'High' },
  { weight: 0.75, label: 'Medium' },
  { weight: 0.5, label: 'Low' },
  { weight: 0.25, label: 'Very low' },
] as const;

const nearestImportance = (weight: number) =>
  IMPORTANCE.reduce((best, option) => (Math.abs(option.weight - weight) < Math.abs(best.weight - weight) ? option : best))
    .weight;

interface Props {
  pairings: FieldPairing[];
  columns: string[];
  onChange: (pairings: FieldPairing[]) => void;
}

export function PairingsEditor({ pairings, columns, onChange }: Props) {
  const studentFields = [...STUDENT_TEXT_FIELDS, ...SHARED_FIELDS].filter((f) => columns.includes(f));
  const mentorFields = [...MENTOR_TEXT_FIELDS, ...SHARED_FIELDS].filter((f) => columns.includes(f));

  const update = (index: number, patch: Partial<FieldPairing>) =>
    onChange(pairings.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  return (
    <div className="pairings">
      {pairings.map((pairing, index) => (
        <div className="pairing" key={index}>
          <label>
            <span className="pairing-label">Student's answer to</span>
            <select value={pairing.studentField} onChange={(e) => update(index, { studentField: e.target.value })}>
              <FieldOptions fields={studentFields} current={pairing.studentField} />
            </select>
          </label>
          <span className="pairing-join" aria-hidden="true">
            compared with
          </span>
          <label>
            <span className="pairing-label">Mentor's answer to</span>
            <select value={pairing.mentorField} onChange={(e) => update(index, { mentorField: e.target.value })}>
              <FieldOptions fields={mentorFields} current={pairing.mentorField} />
            </select>
          </label>
          <label>
            <span className="pairing-label">Importance</span>
            <select
              value={nearestImportance(pairing.weight)}
              onChange={(e) => update(index, { weight: Number(e.target.value) })}
            >
              {IMPORTANCE.map((option) => (
                <option key={option.weight} value={option.weight}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="link-button"
            disabled={pairings.length === 1}
            onClick={() => onChange(pairings.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}

      <div className="pairing-actions">
        <button
          type="button"
          className="secondary"
          disabled={studentFields.length === 0 || mentorFields.length === 0}
          onClick={() => onChange([...pairings, { studentField: studentFields[0], mentorField: mentorFields[0], weight: 0.5 }])}
        >
          Add a comparison
        </button>
        <button type="button" className="link-button" onClick={() => onChange(DEFAULT_PAIRINGS.map((p) => ({ ...p })))}>
          Reset to recommended
        </button>
      </div>
    </div>
  );
}

function FieldOptions({ fields, current }: { fields: string[]; current: string }) {
  return (
    <>
      {!fields.includes(current) && <option value={current}>{current} (not in this file)</option>}
      {fields.map((field) => (
        <option key={field} value={field}>
          {field}
        </option>
      ))}
    </>
  );
}
