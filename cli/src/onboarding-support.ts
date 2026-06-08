import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { gzipSync } from 'node:zlib'
import pack from '../package.json'
import { redactSecrets } from './support/redact.js'

// Environment header so EVERY support bundle is self-contained — the "what
// version / which OS / which runtime" context support always needs but the flow
// itself never logs.
function diagnosticsLines(): string[] {
  const bun = (globalThis as { Bun?: { version: string } }).Bun
  return [
    `CLI version: ${pack.version}`,
    `OS: ${process.platform} ${process.arch}`,
    `Runtime: ${bun ? `bun ${bun.version}` : `node ${process.version}`}`,
    `cwd: ${process.cwd()}`,
  ]
}

const NON_SEGMENT_RE = /[^\w.-]+/g
const DASHES_RE = /-+/g
const EDGE_DASH_RE = /^-|-$/g
const TIMESTAMP_RE = /[:.]/g

export interface OnboardingSupportSection {
  title: string
  lines: string[]
}

export interface OnboardingSupportBundleInput {
  kind: 'init' | 'build-init' | 'build-request'
  error: string
  appId?: string
  currentStep?: string
  packageManager?: string
  cwd?: string
  commands?: string[]
  docs?: string[]
  logs?: string[]
  sections?: OnboardingSupportSection[]
}

function sanitizeSegment(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  if (!trimmed)
    return fallback
  return trimmed.replaceAll(NON_SEGMENT_RE, '-').replaceAll(DASHES_RE, '-').replaceAll(EDGE_DASH_RE, '') || fallback
}

function nowStamp(): string {
  return new Date().toISOString().replaceAll(TIMESTAMP_RE, '-')
}

function appendMetadataLine(lines: string[], label: string, value: string | undefined): void {
  if (value)
    lines.push(`${label}: ${value}`)
}

function appendBulletedSection(lines: string[], title: string, items: string[] | undefined): void {
  if (!items?.length)
    return
  lines.push('', `${title}:`, ...items.map(item => `- ${item}`))
}

function appendPlainSection(lines: string[], title: string, items: string[] | undefined): void {
  if (!items?.length)
    return
  lines.push('', `${title}:`, ...items)
}

export function renderOnboardingSupportBundle(input: OnboardingSupportBundleInput): string {
  const lines: string[] = [
    `Capgo ${input.kind} support bundle`,
    `Generated: ${new Date().toISOString()}`,
    ...diagnosticsLines(),
    `Error: ${input.error}`,
  ]

  appendMetadataLine(lines, 'App ID', input.appId)
  appendMetadataLine(lines, 'Current step', input.currentStep)
  appendMetadataLine(lines, 'Package manager', input.packageManager)
  appendMetadataLine(lines, 'Working directory', input.cwd)
  appendBulletedSection(lines, 'Recommended commands', input.commands)
  appendBulletedSection(lines, 'Docs', input.docs)

  for (const section of input.sections ?? []) {
    appendPlainSection(lines, section.title, section.lines)
  }

  appendPlainSection(lines, 'Recent logs', input.logs)

  return `${lines.join('\n')}\n`
}

// Matches the worker/proxy hard limit (see the support-logs spec): the upload is
// rejected with 413 above this, so the bundle must come in under it.
export const SUPPORT_GZ_CAP_BYTES = 10 * 1024 * 1024

function omittedMarker(removed: number, capBytes: number): string {
  return `[... ${removed} earlier lines omitted to fit the ${Math.round(capBytes / (1024 * 1024))} MB support upload limit ...]`
}

// Stop the binary search once we're within this many lines of the true minimum.
// Dropping up to ~RESOLUTION extra oldest lines is a fine trade for fewer gzip
// probes (each probe re-renders + re-gzips the bundle, which is the slow part).
const TRIM_RESOLUTION = 100
// Headroom reserved below the real cap so the omission marker(s) we prepend after
// trimming (at most one per trimmed section) can't tip the final bundle back over.
const MARKER_RESERVE_BYTES = 1024

interface TrimTarget {
  get: () => string[]
  set: (lines: string[]) => void
}

// Binary-search the FEWEST oldest lines to drop from one target so the WHOLE
// bundle's gz fits `capBytes`. gz shrinks monotonically as we drop more lines, so
// binary search is valid. We seed it with a size-ratio estimate (gz ≈ linear in
// retained lines) so we land near the answer immediately and skip re-gzipping the
// full (possibly huge) bundle on every step. Returns how many lines were dropped
// (0 = none needed; the target's length = even emptying it wasn't enough, so the
// caller moves on to the next target). `gzOf` re-renders `work` and returns its gz
// size; `onPass` fires once per gzip probe (used to surface progress / bound work).
function trimTargetToFit(
  target: TrimTarget,
  capBytes: number,
  currentGz: number,
  gzOf: () => number,
  onPass: () => void,
): number {
  const original = target.get()
  const n = original.length
  const probe = (drop: number): number => {
    onPass()
    target.set(original.slice(Math.min(drop, n)))
    return gzOf()
  }

  // Even with this target fully emptied, does the rest still bust the cap?
  if (probe(n) > capBytes) {
    target.set([])
    return n
  }

  let lo = 0 // known NOT to fit (we are only called while over the cap)
  let hi = n // known to fit (just checked)
  const estimate = Math.min(n, Math.max(1, Math.ceil(n * (1 - capBytes / currentGz))))
  if (probe(estimate) <= capBytes)
    hi = estimate
  else
    lo = estimate
  while (hi - lo > TRIM_RESOLUTION) {
    const mid = lo + Math.floor((hi - lo) / 2)
    if (probe(mid) <= capBytes)
      hi = mid
    else
      lo = mid
  }
  target.set(original.slice(hi))
  return hi
}

// Render + gzip the (secret-redacted) bundle, trimming the OLDEST lines if the gz
// would exceed the support upload cap. The failure and its context live at the
// TAIL of each log, so we drop from the front via binary search (the FEWEST lines
// needed); the error line, AI analysis, and other small sections are never
// touched. Trim priority: build output → recent logs → internal log. `onPass`
// fires once per gzip probe so callers can show progress. Returns the final
// rendered text and its gz (kept in sync).
export function renderBundleWithinGzCap(
  input: OnboardingSupportBundleInput,
  capBytes = SUPPORT_GZ_CAP_BYTES,
  onPass?: () => void,
): { rendered: string, gz: Buffer } {
  const render = (i: OnboardingSupportBundleInput): { rendered: string, gz: Buffer } => {
    const rendered = redactSecrets(renderOnboardingSupportBundle(i))
    return { rendered, gz: gzipSync(rendered) }
  }

  let out = render(input)
  onPass?.()
  if (out.gz.length <= capBytes)
    return out

  // Clone the trimmable line-arrays so we never mutate the caller's input.
  const sections = (input.sections ?? []).map(section => ({ ...section, lines: [...section.lines] }))
  const work: OnboardingSupportBundleInput = { ...input, sections, logs: input.logs ? [...input.logs] : input.logs }
  const gzOf = (): number => {
    out = render(work)
    return out.gz.length
  }

  const targets: TrimTarget[] = []
  const buildSection = sections.find(section => section.title.startsWith('Build output'))
  if (buildSection)
    targets.push({ get: () => buildSection.lines, set: (lines) => { buildSection.lines = lines } })
  if (work.logs)
    targets.push({ get: () => work.logs ?? [], set: (lines) => { work.logs = lines } })
  const internalSection = sections.find(section => section.title === 'Internal log')
  if (internalSection)
    targets.push({ get: () => internalSection.lines, set: (lines) => { internalSection.lines = lines } })

  // Trim against a slightly reduced cap so the marker line we add afterwards still
  // leaves the final bundle under the real cap.
  const fitCap = Math.max(1, capBytes - MARKER_RESERVE_BYTES)
  for (const target of targets) {
    if (out.gz.length <= capBytes)
      break
    const removed = trimTargetToFit(target, fitCap, out.gz.length, gzOf, () => onPass?.())
    if (removed > 0)
      target.set([omittedMarker(removed, capBytes), ...target.get()])
    out = render(work)
  }
  return out
}

export function writeOnboardingSupportBundle(input: OnboardingSupportBundleInput, supportDir = join(homedir(), '.capgo-credentials', 'support')): string | null {
  try {
    mkdirSync(supportDir, { recursive: true })

    const kind = sanitizeSegment(input.kind, 'onboarding')
    const app = sanitizeSegment(input.appId, 'unknown-app')
    const filename = `${kind}-${app}-${nowStamp()}.log`
    const filePath = join(supportDir, filename)

    writeFileSync(filePath, renderOnboardingSupportBundle(input), 'utf8')
    return filePath
  }
  catch {
    return null
  }
}

export interface SupportBundleFiles {
  logPath: string
  gzPath: string
}

// Writes the combined bundle as BOTH a plain .log and a .log.gz (same content).
export function writeSupportBundleFiles(
  input: OnboardingSupportBundleInput,
  supportDir = join(homedir(), '.capgo-credentials', 'support'),
): SupportBundleFiles | null {
  try {
    mkdirSync(supportDir, { recursive: true })
    const kind = sanitizeSegment(input.kind, 'onboarding')
    const app = sanitizeSegment(input.appId, 'unknown-app')
    const base = `builder-support-${kind}-${app}-${nowStamp()}`
    const logPath = join(supportDir, `${base}.log`)
    const gzPath = join(supportDir, `${base}.log.gz`)
    // Redact the WHOLE rendered bundle (logs + sections + error), not just the
    // internal-log lines — so the email's "secrets removed" promise holds for the
    // build-output section too. renderBundleWithinGzCap also trims the oldest
    // build-output lines if the gz would otherwise exceed the 10 MB upload cap.
    const { rendered, gz } = renderBundleWithinGzCap(input)
    writeFileSync(logPath, rendered, 'utf8')
    writeFileSync(gzPath, gz)
    return { logPath, gzPath }
  }
  catch {
    return null
  }
}
