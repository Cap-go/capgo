import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const NON_SEGMENT_RE = /[^\w.-]+/g
const DASHES_RE = /-+/g
const EDGE_DASH_RE = /^-|-$/g
const TIMESTAMP_RE = /[:.]/g

export interface OnboardingSupportSection {
  title: string
  lines: string[]
}

export interface OnboardingSupportBundleInput {
  kind: 'init' | 'build-init'
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
