// Size-search: find the MINIMAL terminal (cols, rows) at which every onboarding
// frame fits without clipping static content.
//
// This is the harness the goal asks for — "try different terminal sizes until we
// find one that passes all tests". It reuses the VT grid harness (vt-grid.mjs):
// a size "passes" when no checked frame clips at that size.
//
// The search is two independent 1-D searches because cols and rows affect fit
// almost separably: cols drives text WRAPPING (narrower → taller frames), rows
// is the vertical budget. We:
//   1. Pick a generous rows budget, linearly scan upward for the minimal COLS at
//      which no frame's natural width is mangled and wrapping stays bounded.
//   2. At that cols, find the minimal ROWS = max over frames of naturalRows
//      (the tallest frame's height) — that's the vertical floor.
//   3. Verify the (cols, rows) pair passes all checks together.
//
// `checkAtSize(cols, rows)` must return { pass: boolean, failures: string[] }.

/**
 * Find the minimal rows at a fixed cols such that checkAtSize passes, scanning
 * upward from `minRows` to `maxRows`. Returns the first passing rows, or null.
 * @param {(cols:number, rows:number)=>Promise<{pass:boolean, failures:string[]}>} checkAtSize
 */
export async function minRowsAt(checkAtSize, cols, { minRows = 8, maxRows = 60 } = {}) {
  // Monotonic in rows (more rows never un-fits a frame), so a linear scan from
  // the bottom finds the exact floor; we keep it linear for a clear failure list.
  let lastFailures = []
  for (let rows = minRows; rows <= maxRows; rows++) {
    const { pass, failures } = await checkAtSize(cols, rows)
    if (pass)
      return { rows, failures: [] }
    lastFailures = failures
  }
  return { rows: null, failures: lastFailures }
}

/**
 * Find the minimal cols at a fixed (generous) rows such that checkAtSize passes.
 * Narrower terminals wrap text taller and can mangle fixed-width chrome (the
 * boxed banner), so there's a floor below which no rows budget helps.
 */
export async function minColsAt(checkAtSize, rows, { minCols = 40, maxCols = 120 } = {}) {
  let lastFailures = []
  for (let cols = minCols; cols <= maxCols; cols++) {
    const { pass, failures } = await checkAtSize(cols, rows)
    if (pass)
      return { cols, failures: [] }
    lastFailures = failures
  }
  return { cols: null, failures: lastFailures }
}

/**
 * Full search: minimal (cols, rows) pair that passes all checks.
 *
 * @param {(cols:number, rows:number)=>Promise<{pass:boolean, failures:string[]}>} checkAtSize
 * @param {{ minCols?, maxCols?, minRows?, maxRows?, tallRows?, wideCols? }} [opts]
 *   tallRows: a generous rows budget used while searching for min cols.
 *   wideCols: a generous cols budget used while searching for min rows.
 * @returns {Promise<{ cols:number|null, rows:number|null, failures:string[] }>}
 */
export async function findMinSize(checkAtSize, opts = {}) {
  const {
    minCols = 40,
    maxCols = 120,
    minRows = 8,
    maxRows = 60,
    tallRows = 60,
    wideCols = 120,
  } = opts

  // 1. Minimal cols at a tall budget (isolates the horizontal/wrapping floor).
  const colRes = await minColsAt(checkAtSize, tallRows, { minCols, maxCols })
  if (colRes.cols == null)
    return { cols: null, rows: null, failures: [`no cols in [${minCols},${maxCols}] passes at ${tallRows} rows`, ...colRes.failures] }

  // 2. Minimal rows at a wide budget (isolates the vertical floor).
  const rowRes = await minRowsAt(checkAtSize, wideCols, { minRows, maxRows })
  if (rowRes.rows == null)
    return { cols: colRes.cols, rows: null, failures: [`no rows in [${minRows},${maxRows}] passes at ${wideCols} cols`, ...rowRes.failures] }

  // 3. Verify the corner (minCols, minRows) actually passes together — wrapping
  //    at min cols may push some frame taller than the min-rows found at wide
  //    cols, so bump rows until the pair passes.
  let rows = rowRes.rows
  let failures = []
  while (rows <= maxRows) {
    const res = await checkAtSize(colRes.cols, rows)
    if (res.pass) {
      failures = []
      break
    }
    failures = res.failures
    rows++
  }
  return { cols: colRes.cols, rows: rows > maxRows ? null : rows, failures }
}
