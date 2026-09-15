export type IssueSeverity = 'error' | 'warning' | 'info';

export type IssueKind =
  | 'missing-columns'
  | 'missing-id'
  | 'unknown-role'
  | 'duplicate-id'
  | 'unreadable-link'
  | 'duplicate-email'
  | 'no-profile-text'
  | 'answered-other-role'
  | 'unresolved-link'
  | 'same-role-link'
  | 'one-sided-link'
  | 'no-students'
  | 'no-mentors';

export interface Issue {
  kind: IssueKind;
  /** error: matching can't run. warning: worth a look. info: handled automatically. */
  severity: IssueSeverity;
  /** Plain-language, written for the person running the match. */
  message: string;
  /** People this issue is about, so the interface can offer to exclude them. */
  personIds: string[];
}

const ORDER: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };

export const bySeverity = (a: Issue, b: Issue) => ORDER[a.severity] - ORDER[b.severity];
