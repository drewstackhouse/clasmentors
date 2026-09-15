/**
 * Mean of the token vectors over real (unpadded) tokens, scaled to unit
 * length: the pooling sentence-transformers applies for all-MiniLM-L6-v2.
 * Unit length means cosine similarity is a plain dot product.
 */
export function meanPoolNormalized(
  hidden: ArrayLike<number>,
  tokenCount: number,
  size: number,
  mask: ArrayLike<number | bigint>,
  out: Float32Array,
  offset = 0,
): void {
  const sum = new Float64Array(size);
  let counted = 0;

  for (let t = 0; t < tokenCount; t++) {
    if (Number(mask[t]) === 0) continue;
    counted++;
    const row = t * size;
    for (let d = 0; d < size; d++) sum[d] += hidden[row + d];
  }

  let norm = 0;
  for (let d = 0; d < size; d++) norm += sum[d] * sum[d];
  norm = Math.sqrt(norm);

  for (let d = 0; d < size; d++) out[offset + d] = counted > 0 && norm > 0 ? sum[d] / norm : 0;
}

/** Dot product of two unit vectors stored at offsets in flat arrays. */
export function dot(a: ArrayLike<number>, aOffset: number, b: ArrayLike<number>, bOffset: number, size: number) {
  let total = 0;
  for (let d = 0; d < size; d++) total += a[aOffset + d] * b[bOffset + d];
  return total;
}
