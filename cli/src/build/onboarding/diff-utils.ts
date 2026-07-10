/**
 * Line-by-line diff utilities for the workflow-file preview viewer.
 *
 * Uses a textbook longest-common-subsequence algorithm. O(m·n) time/space
 * which is fine for the workflow-file scale we expect (≤200 lines either
 * side); no dep needed.
 */

export type DiffKind = 'add' | 'del' | 'eq'

export interface DiffLine {
  kind: DiffKind
  text: string
}

/**
 * Compute a line-level diff between `before` and `after`.
 *
 * Returns an ordered list of lines where:
 *   - `kind: 'eq'`  → present in both, unchanged
 *   - `kind: 'add'` → present only in `after` (will be added by the write)
 *   - `kind: 'del'` → present only in `before` (will be removed by the write)
 *
 * When `before` is the empty string, every line in `after` is returned as
 * `add` — the natural "new file" rendering.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const beforeLines = before.length === 0 ? [] : before.split('\n')
  const afterLines = after.length === 0 ? [] : after.split('\n')

  const m = beforeLines.length
  const n = afterLines.length

  // Fast path: new file → everything is an addition.
  if (m === 0)
    return afterLines.map(text => ({ kind: 'add', text }))
  // Fast path: file being deleted → everything is a deletion.
  if (n === 0)
    return beforeLines.map(text => ({ kind: 'del', text }))

  // Standard LCS table.
  const lcs: number[][] = []
  for (let i = 0; i <= m; i += 1)
    lcs.push(Array.from({ length: n + 1 }).fill(0) as number[])
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (beforeLines[i - 1] === afterLines[j - 1])
        lcs[i][j] = lcs[i - 1][j - 1] + 1
      else
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1])
    }
  }

  // Backtrack from (m, n) producing the diff in reverse.
  const out: DiffLine[] = []
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (beforeLines[i - 1] === afterLines[j - 1]) {
      out.unshift({ kind: 'eq', text: beforeLines[i - 1] })
      i -= 1
      j -= 1
    }
    // Tie-breaker: prefer the add path when LCS values are equal. Combined
    // with unshift-based assembly, this puts deletions BEFORE additions in the
    // visible output (matching the standard `-` then `+` convention of
    // `diff -u` / git diff).
    else if (lcs[i - 1][j] > lcs[i][j - 1]) {
      out.unshift({ kind: 'del', text: beforeLines[i - 1] })
      i -= 1
    }
    else {
      out.unshift({ kind: 'add', text: afterLines[j - 1] })
      j -= 1
    }
  }
  while (i > 0) {
    out.unshift({ kind: 'del', text: beforeLines[i - 1] })
    i -= 1
  }
  while (j > 0) {
    out.unshift({ kind: 'add', text: afterLines[j - 1] })
    j -= 1
  }
  return out
}
