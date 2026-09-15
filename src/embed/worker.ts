/// <reference lib="webworker" />
/**
 * Runs the embedding model off the main thread so the page stays responsive.
 *
 * Texts are embedded one at a time, never batched. The model is dynamically
 * quantized: int8 scales are computed over the whole input, padding included,
 * so a text's vector shifts depending on what it's batched with. On the real
 * cohort, batching 16 at a time changed the suggested mentor for 20 of 105
 * students. One at a time, each vector depends only on its own text - which is
 * also what makes caching by text correct.
 */

import { AutoModel, AutoTokenizer, env } from '@huggingface/transformers';
// Vite copies ONNX Runtime's binary into the build under a content hash, so this site serves it
// (transformers.js would otherwise fetch it from a CDN) and browsers can cache it indefinitely.
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { EMBEDDING_SIZE, type WorkerRequest, type WorkerResponse } from './protocol';
import { meanPoolNormalized } from './pool';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

/**
 * all-MiniLM-L6-v2 was trained on sequences capped at 256 tokens, and that's
 * what sentence-transformers uses. transformers.js would otherwise fall back
 * to the architecture's 512, silently changing vectors for long answers.
 */
const MAX_TOKENS = 256;

// Everything is served by this site: no requests to huggingface.co or a CDN.
const base = import.meta.env.BASE_URL;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = `${base}models/`;
const wasm = env.backends.onnx.wasm;
if (wasm) {
  wasm.wasmPaths = { wasm: ortWasmUrl };
  // GitHub Pages can't send cross-origin isolation headers, so WASM threads are unavailable.
  wasm.numThreads = 1;
}

const post = (message: WorkerResponse, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer);

interface DownloadEvent {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}

type Engine = {
  tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
  model: Awaited<ReturnType<typeof AutoModel.from_pretrained>>;
};

let engine: Promise<Engine> | null = null;

function loadEngine(): Promise<Engine> {
  if (engine) return engine;

  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (event: DownloadEvent) => {
    if (event.status !== 'progress' || !event.file || !event.total) return;
    files.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
    let loadedBytes = 0;
    let totalBytes = 0;
    for (const f of files.values()) {
      loadedBytes += f.loaded;
      totalBytes += f.total;
    }
    post({ type: 'load-progress', loadedBytes, totalBytes });
  };

  engine = Promise.all([
    AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback }),
    AutoModel.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm', progress_callback }),
  ])
    .then(([tokenizer, model]) => ({ tokenizer, model }))
    .catch((error) => {
      engine = null; // let a later attempt retry, e.g. after a network blip
      throw error;
    });

  return engine;
}

async function embed(requestId: number, texts: string[]) {
  const { tokenizer, model } = await loadEngine();
  const vectors = new Float32Array(texts.length * EMBEDDING_SIZE);
  let lastReport = 0;

  for (let i = 0; i < texts.length; i++) {
    const inputs = tokenizer(texts[i], { truncation: true, max_length: MAX_TOKENS });
    const { last_hidden_state: hidden } = await model(inputs);
    const [, tokenCount, size] = hidden.dims as number[];
    if (size !== EMBEDDING_SIZE) throw new Error(`Model produced ${size}-dimensional vectors, expected ${EMBEDDING_SIZE}.`);

    meanPoolNormalized(hidden.data, tokenCount, size, inputs.attention_mask.data, vectors, i * EMBEDDING_SIZE);
    hidden.dispose?.();

    const now = performance.now();
    if (now - lastReport > 100 || i === texts.length - 1) {
      post({ type: 'embed-progress', requestId, done: i + 1, total: texts.length });
      lastReport = now;
    }
  }

  post({ type: 'embedded', requestId, vectors }, [vectors.buffer]);
}

// The ONNX session can't run two inferences at once, so handle one message at a time.
let queue: Promise<void> = Promise.resolve();

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  queue = queue.then(async () => {
    try {
      if (request.type === 'load') {
        await loadEngine();
        post({ type: 'ready' });
      } else {
        await embed(request.requestId, request.texts);
      }
    } catch (error) {
      post({
        type: 'error',
        requestId: request.type === 'embed' ? request.requestId : undefined,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
});
