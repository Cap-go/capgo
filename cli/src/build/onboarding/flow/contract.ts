// Platform-agnostic onboarding flow contract. NO ink, NO MCP types. Both the
// ink TUI and the MCP server render a StepView and feed input back through it.
export type StepKind = 'auto' | 'human_gate' | 'choice' | 'info' | 'input' | 'done' | 'error'

export interface StepView {
  kind: StepKind
  prompt: string
  options?: { value: string, label: string, note?: string }[]
  collect?: { field: string, desc: string, secret?: boolean }[]
  context?: Record<string, unknown>
}

export interface PlatformFlow<Step extends string, Progress, Input> {
  resumeStep: (progress: Progress | null) => Step
  viewForStep: (step: Step, progress: Progress, ctx?: Record<string, unknown>) => StepView
  applyInput: (step: Step, progress: Progress, input: Input) => Progress
  runEffect: (step: Step, progress: Progress, deps: unknown) => Promise<unknown>
}

const KINDS: ReadonlySet<string> = new Set(['auto', 'human_gate', 'choice', 'info', 'input', 'done', 'error'])

/** Runtime guard used by tests + frontends to validate a view-model. */
export function isStepView(v: unknown): v is StepView {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.kind === 'string' && KINDS.has(o.kind) && typeof o.prompt === 'string'
}
