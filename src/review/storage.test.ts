import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROPOSAL } from './__fixtures__/review';
import { reviewReducer, startReview, type ReviewSession } from './session';
import { forgetReview, saveReview, savedReviews } from './storage';

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
  });
});

afterEach(() => vi.unstubAllGlobals());

const reviewAt = (iso: string): ReviewSession => startReview(structuredClone(PROPOSAL), 'import.csv', [], new Date(iso));

describe('saving reviews in the browser', () => {
  it('saves and restores a review', () => {
    const session = reviewReducer(reviewAt('2026-09-15T10:00:00Z'), { type: 'confirm', studentId: 's1' });
    expect(saveReview(session)).toBe(true);
    expect(savedReviews()).toEqual([session]);
  });

  it('replaces an earlier save of the same review', () => {
    const first = reviewAt('2026-09-15T10:00:00Z');
    saveReview(first);
    const later = reviewReducer(first, { type: 'confirm', studentId: 's2' }, new Date('2026-09-15T11:00:00Z'));
    saveReview(later);
    expect(savedReviews()).toEqual([later]);
  });

  it('keeps only the three most recent reviews, newest first', () => {
    const reviews = ['01', '02', '03', '04'].map((day) => reviewAt(`2026-09-${day}T10:00:00Z`));
    reviews.forEach(saveReview);
    expect(savedReviews().map((r) => r.id)).toEqual([reviews[3].id, reviews[2].id, reviews[1].id]);
  });

  it('forgets a review on request', () => {
    const a = reviewAt('2026-09-01T10:00:00Z');
    const b = reviewAt('2026-09-02T10:00:00Z');
    saveReview(a);
    saveReview(b);
    forgetReview(a.id);
    expect(savedReviews().map((r) => r.id)).toEqual([b.id]);
  });

  it('skips unreadable entries instead of failing', () => {
    store.set('clasmentors:saved-reviews', JSON.stringify(['not json', 42]));
    expect(savedReviews()).toEqual([]);
    store.set('clasmentors:saved-reviews', '{broken');
    expect(savedReviews()).toEqual([]);
  });

  it('reports when the browser refuses to store it', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    });
    expect(saveReview(reviewAt('2026-09-15T10:00:00Z'))).toBe(false);
  });
});
