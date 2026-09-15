/**
 * Automatic saving to this browser, so closing the tab doesn't lose a review.
 *
 * Best effort only: storage can be full, cleared, or blocked, which is why the
 * interface also offers a downloadable progress file. Only the few most recent
 * reviews are kept.
 */

import { parseSavedSession, serializeSession, type ReviewSession } from './session';

const KEY = 'clasmentors:saved-reviews';
const KEEP = 3;

function readStored(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** Reviews saved in this browser, most recently changed first. Unreadable entries are skipped. */
export function savedReviews(): ReviewSession[] {
  return readStored()
    .flatMap((text) => {
      try {
        return [parseSavedSession(text)];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** @returns false if the browser wouldn't store it. */
export function saveReview(session: ReviewSession): boolean {
  try {
    const others = savedReviews().filter((s) => s.id !== session.id).slice(0, KEEP - 1);
    localStorage.setItem(KEY, JSON.stringify([session, ...others].map(serializeSession)));
    return true;
  } catch {
    return false;
  }
}

export function forgetReview(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(savedReviews().filter((s) => s.id !== id).map(serializeSession)));
  } catch {
    // Nothing useful to do; it will be pruned when newer reviews are saved.
  }
}
