/** Messages between the page and the embedding worker. */

/** Output size of all-MiniLM-L6-v2. */
export const EMBEDDING_SIZE = 384;

export type WorkerRequest =
  | { type: 'load' }
  | { type: 'embed'; requestId: number; texts: string[] };

export type WorkerResponse =
  | { type: 'load-progress'; loadedBytes: number; totalBytes: number }
  | { type: 'ready' }
  | { type: 'embed-progress'; requestId: number; done: number; total: number }
  /** `vectors` holds `texts.length * EMBEDDING_SIZE` values, one unit-length vector per text, in order. */
  | { type: 'embedded'; requestId: number; vectors: Float32Array }
  | { type: 'error'; requestId?: number; message: string };
