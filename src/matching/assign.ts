/**
 * Rectangular linear sum assignment (Jonker-Volgenant, shortest augmenting path).
 *
 * Mirrors scipy.optimize.linear_sum_assignment: solves the *minimum* cost
 * assignment over a dense rows x cols cost matrix, pairing min(rows, cols)
 * entries. No padding to square is required.
 */

export interface Assignment {
  row: number;
  col: number;
}

/**
 * @param cost row-major cost matrix, `rows * cols` entries
 * @returns one pair per row (or per column when cols < rows), ascending by row
 */
export function linearSumAssignment(cost: Float64Array, rows: number, cols: number): Assignment[] {
  if (rows === 0 || cols === 0) return [];
  if (cost.length !== rows * cols) {
    throw new Error(`cost matrix has ${cost.length} entries, expected ${rows * cols}`);
  }

  // The algorithm below requires rows <= cols; solve the transpose otherwise.
  if (rows > cols) {
    const transposed = new Float64Array(cost.length);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) transposed[c * rows + r] = cost[r * cols + c];
    }
    return linearSumAssignment(transposed, cols, rows)
      .map(({ row, col }) => ({ row: col, col: row }))
      .sort((a, b) => a.row - b.row);
  }

  const INF = Infinity;
  const u = new Float64Array(rows + 1); // row potentials
  const v = new Float64Array(cols + 1); // column potentials
  const colToRow = new Int32Array(cols + 1).fill(-1);
  const way = new Int32Array(cols + 1).fill(-1); // predecessor column in the alternating tree

  for (let r = 0; r < rows; r++) {
    colToRow[cols] = r;
    let j0 = cols; // the "virtual" free column the search starts from
    const minv = new Float64Array(cols + 1).fill(INF);
    const used = new Uint8Array(cols + 1);
    way.fill(-1);

    // Grow a shortest augmenting path until it reaches an unmatched column.
    do {
      used[j0] = 1;
      const i0 = colToRow[j0];
      let delta = INF;
      let j1 = -1;

      for (let j = 0; j < cols; j++) {
        if (used[j]) continue;
        const cur = cost[i0 * cols + j] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }

      if (j1 === -1) throw new Error('assignment is infeasible: no reachable column');

      // Reweight so the tightened edges stay at zero reduced cost.
      for (let j = 0; j <= cols; j++) {
        if (used[j]) {
          u[colToRow[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (colToRow[j0] !== -1);

    // Flip the alternating path, matching one more row.
    do {
      const j1 = way[j0];
      colToRow[j0] = colToRow[j1];
      j0 = j1;
    } while (j0 !== cols);
  }

  const out: Assignment[] = [];
  for (let j = 0; j < cols; j++) {
    if (colToRow[j] !== -1 && colToRow[j] < rows) out.push({ row: colToRow[j], col: j });
  }
  return out.sort((a, b) => a.row - b.row);
}

/** Total cost of an assignment, for verifying optimality against a reference solver. */
export function assignmentCost(cost: Float64Array, cols: number, pairs: Assignment[]): number {
  return pairs.reduce((sum, { row, col }) => sum + cost[row * cols + col], 0);
}
