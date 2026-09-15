/**
 * Page-side handle to the embedding worker. Remembers every vector it has
 * produced this session, so changing weights or excluding someone and
 * recalculating doesn't re-run the model.
 */

import { EMBEDDING_SIZE, type WorkerRequest, type WorkerResponse } from './protocol';

export interface LoadProgress {
  loadedBytes: number;
  totalBytes: number;
}

interface PendingEmbed {
  texts: string[];
  resolve: () => void;
  reject: (error: Error) => void;
  onProgress?: (done: number, total: number) => void;
}

export class Embedder {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((error: Error) => void) | null = null;
  private loadListeners = new Set<(progress: LoadProgress) => void>();
  private pending = new Map<number, PendingEmbed>();
  private nextRequestId = 1;
  private cache = new Map<string, Float32Array>();

  /** Downloads (or reads from cache) and starts the model. Safe to call repeatedly. */
  load(onProgress?: (progress: LoadProgress) => void): Promise<void> {
    if (onProgress) this.loadListeners.add(onProgress);
    if (!this.ready) {
      this.ready = new Promise<void>((resolve, reject) => {
        this.resolveReady = resolve;
        this.rejectReady = reject;
      });
      this.send({ type: 'load' });
    }
    const ready = this.ready;
    return onProgress ? ready.finally(() => this.loadListeners.delete(onProgress)) : ready;
  }

  /** Unit-length vectors for each text. Texts already embedded this session are not recomputed. */
  async embed(
    texts: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<Map<string, Float32Array>> {
    const missing = [...new Set(texts)].filter((t) => !this.cache.has(t));

    if (missing.length > 0) {
      await this.load();
      const requestId = this.nextRequestId++;
      await new Promise<void>((resolve, reject) => {
        this.pending.set(requestId, { texts: missing, resolve, reject, onProgress });
        this.send({ type: 'embed', requestId, texts: missing });
      });
    } else {
      onProgress?.(0, 0);
    }

    return new Map(texts.map((t) => [t, this.cache.get(t)!]));
  }

  private send(request: WorkerRequest) {
    this.ensureWorker().postMessage(request);
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => this.receive(event.data));
    worker.addEventListener('error', (event) => {
      this.failAll(new Error(event.message || 'The matching engine stopped unexpectedly.'));
      worker.terminate();
      this.worker = null;
    });
    this.worker = worker;
    return worker;
  }

  private receive(message: WorkerResponse) {
    switch (message.type) {
      case 'load-progress':
        for (const listener of this.loadListeners) listener(message);
        break;
      case 'ready':
        this.resolveReady?.();
        break;
      case 'embed-progress':
        this.pending.get(message.requestId)?.onProgress?.(message.done, message.total);
        break;
      case 'embedded': {
        const request = this.pending.get(message.requestId);
        if (!request) break;
        request.texts.forEach((text, i) => {
          const start = i * EMBEDDING_SIZE;
          this.cache.set(text, message.vectors.slice(start, start + EMBEDDING_SIZE));
        });
        this.pending.delete(message.requestId);
        request.resolve();
        break;
      }
      case 'error': {
        const error = new Error(message.message);
        if (message.requestId === undefined) {
          this.rejectReady?.(error);
          this.ready = null; // allow retry
        } else {
          this.pending.get(message.requestId)?.reject(error);
          this.pending.delete(message.requestId);
        }
        break;
      }
    }
  }

  private failAll(error: Error) {
    this.rejectReady?.(error);
    this.ready = null;
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
}

export const embedder = new Embedder();
