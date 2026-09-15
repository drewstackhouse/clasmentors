import { STATUS_LABEL, type ReviewStatus } from '../../review/session';

export function StatusIcon({ status }: { status: ReviewStatus }) {
  return <span className={`status-icon status-${status}`} aria-hidden="true" />;
}

export function StatusPill({ status }: { status: ReviewStatus }) {
  return (
    <span className={`status-pill status-${status}`}>
      <StatusIcon status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}
