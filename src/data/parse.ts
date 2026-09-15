/**
 * CSV bytes -> people. Only structural problems are reported here (unreadable
 * file, missing columns, rows that can't be used at all); judgements about the
 * content of usable rows live in roster.ts.
 */

import Papa from 'papaparse';
import {
  COLUMN,
  REQUIRED_COLUMNS,
  ROLE_LABEL,
  RECORD_ID_PATTERN,
  type Person,
  type Role,
} from './schema';
import type { Issue } from './issues';

export interface ParseResult {
  people: Person[];
  columns: string[];
  issues: Issue[];
}

/**
 * Airtable exports UTF-8, but a file opened and re-saved in Excel on Windows
 * often comes back as Windows-1252, which would garble curly quotes and
 * accents. Try strict UTF-8 first and fall back only if it fails.
 */
export function decodeCsv(bytes: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return text.replace(/^﻿/, '');
}

const cleanText = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

function roleFromLabel(label: string): Role | null {
  const normalized = label.trim().toLowerCase();
  for (const role of Object.keys(ROLE_LABEL) as Role[]) {
    if (ROLE_LABEL[role].toLowerCase() === normalized) return role;
  }
  return null;
}

export function parseRoster(text: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.replace(/^﻿/, '').trim(),
  });

  const columns = parsed.meta.fields ?? [];
  const issues: Issue[] = [];

  const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length > 0) {
    issues.push({
      kind: 'missing-columns',
      severity: 'error',
      message:
        `This file is missing ${missing.length === 1 ? 'a column' : 'columns'} the matcher needs: ` +
        `${missing.map((c) => `"${c}"`).join(', ')}. ` +
        'Make sure you exported the full People table from Airtable.',
      personIds: [],
    });
    return { people: [], columns, issues };
  }

  const people: Person[] = [];
  const seenIds = new Map<string, Person>();
  const unknownRoleRows: number[] = [];
  const missingIdRows: number[] = [];

  parsed.data.forEach((raw, index) => {
    const row = index + 2; // header occupies row 1
    const fields: Record<string, string> = {};
    for (const column of columns) fields[column] = cleanText(raw[column]);

    const id = fields[COLUMN.id];
    const role = roleFromLabel(fields[COLUMN.role]);
    const name = fields[COLUMN.name] || '(no name)';

    if (!id) {
      missingIdRows.push(row);
      return;
    }
    if (!role) {
      unknownRoleRows.push(row);
      return;
    }

    const existing = seenIds.get(id);
    if (existing) {
      issues.push({
        kind: 'duplicate-id',
        severity: 'warning',
        message:
          `${name} (row ${row}) has the same Person ID as ${existing.name} (row ${existing.row}). ` +
          `Only row ${existing.row} will be used.`,
        personIds: [id],
      });
      return;
    }

    const linkColumn = role === 'student' ? COLUMN.linkedMentors : COLUMN.linkedStudents;
    const linkText = fields[linkColumn] ?? '';
    const linkedIds = [...new Set(linkText.match(RECORD_ID_PATTERN) ?? [])];

    if (linkText && linkedIds.length === 0) {
      issues.push({
        kind: 'unreadable-link',
        severity: 'warning',
        message:
          `${name}'s "${linkColumn}" says "${linkText}", but it doesn't contain a record id the matcher ` +
          'can read. Their existing match will be ignored. Check that the column exports record ids, not names.',
        personIds: [id],
      });
    }

    const person: Person = { id, role, name, email: fields[COLUMN.email] ?? '', fields, linkedIds, row };
    seenIds.set(id, person);
    people.push(person);
  });

  if (missingIdRows.length > 0) {
    issues.push({
      kind: 'missing-id',
      severity: 'warning',
      message: `${plural(missingIdRows.length, 'row has', 'rows have')} no Person ID and will be skipped (${rowList(missingIdRows)}).`,
      personIds: [],
    });
  }
  if (unknownRoleRows.length > 0) {
    issues.push({
      kind: 'unknown-role',
      severity: 'warning',
      message:
        `${plural(unknownRoleRows.length, 'row has', 'rows have')} a Role other than ` +
        `"${ROLE_LABEL.student}" or "${ROLE_LABEL.mentor}" and will be skipped (${rowList(unknownRoleRows)}).`,
      personIds: [],
    });
  }

  return { people, columns, issues };
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function rowList(rows: number[]) {
  const shown = rows.slice(0, 8).join(', ');
  return rows.length > 8 ? `rows ${shown} and ${rows.length - 8} more` : `row${rows.length === 1 ? '' : 's'} ${shown}`;
}
