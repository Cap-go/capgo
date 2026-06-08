import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { redactSecrets } from './support/redact.js'

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

// Render + gzip the (secret-redacted) bundle, trimming the OLDEST lines if the gz
// would exceed the support upload cap. The failure and its context live at the
// TAIL of each log, so we drop from the front; the error line, AI analysis, and
// other small sections are never touched. Trim priority: build output → recent
// logs → internal log. Returns the final rendered text and its gz (kept in sync).
export function renderBundleWithinGzCap(
  input: OnboardingSupportBundleInput,
  capBytes = SUPPORT_GZ_CAP_BYTES,
): { rendered: string, gz: Buffer } {
  const renderGz = (i: OnboardingSupportBundleInput): { rendered: string, gz: Buffer } => {
    const rendered = redactSecrets(renderOnboardingSupportBundle(i))
    return { rendered, gz: gzipSync(rendered) }
  }

  let out = renderGz(input)
  if (out.gz.length <= capBytes)
    return out

  // Clone the trimmable line-arrays so we never mutate the caller's input.
  const sections = (input.sections ?? []).map(section => ({ ...section, lines: [...section.lines] }))
  const work: OnboardingSupportBundleInput = { ...input, sections, logs: input.logs ? [...input.logs] : input.logs }

  const targets: string[][] = []
  const buildSection = sections.find(section => section.title.startsWith('Build output'))
  if (buildSection)
    targets.push(buildSection.lines)
  if (work.logs)
    targets.push(work.logs)
  const internalSection = sections.find(section => section.title === 'Internal log')
  if (internalSection)
    targets.push(internalSection.lines)

  for (const lines of targets) {
    let removed = 0
    for (;;) {
      out = renderGz(work)
      if (out.gz.length <= capBytes || lines.length <= 1)
        break
      // Drop ~25% of the oldest lines per pass (min 500) so huge logs converge in
      // a handful of gzip probes instead of hundreds of single-line passes.
      const drop = Math.min(lines.length - 1, Math.max(500, Math.floor(lines.length * 0.25)))
      lines.splice(0, drop)
      removed += drop
    }
    if (removed > 0) {
      lines.unshift(omittedMarker(removed, capBytes))
      out = renderGz(work)
    }
    if (out.gz.length <= capBytes)
      break
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
