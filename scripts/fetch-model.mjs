#!/usr/bin/env node
/**
 * Downloads the embedding model into public/models so the deployed site serves
 * it from its own origin: no runtime dependency on huggingface.co (which campus
 * networks may block), and no chance of the upstream repo changing under us.
 *
 * Pinned to an exact revision and verified by SHA-256. Safe to re-run; files
 * already present with the right hash are skipped.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';

const FILES = {
  'config.json': '7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7',
  'tokenizer.json': 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0',
  'tokenizer_config.json': '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3',
  'onnx/model_quantized.onnx': 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1',
};

const destRoot = fileURLToPath(new URL(`../public/models/${MODEL}/`, import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function alreadyValid(path, expected) {
  try {
    return sha256(await readFile(path)) === expected;
  } catch {
    return false;
  }
}

for (const [file, expected] of Object.entries(FILES)) {
  const dest = destRoot + file;
  if (await alreadyValid(dest, expected)) {
    console.log(`  ok        ${file}`);
    continue;
  }

  const url = `https://huggingface.co/${MODEL}/resolve/${REVISION}/${file}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`);

  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${file}: expected ${expected}, got ${actual}`);
  }

  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, bytes);
  console.log(`  fetched   ${file} (${(bytes.length / 1e6).toFixed(1)} MB)`);
}
