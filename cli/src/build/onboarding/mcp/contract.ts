// src/build/onboarding/mcp/contract.ts
// Result contract for the MCP-conducted Capgo Builder onboarding.
// The `kind` tells the AI how to behave; `next` tells it the literal next move.
// Returned both as JSON and as a rendered directive (see renderResult).

export type StepKind = 'auto' | 'human_gate' | 'choice' | 'done' | 'error' | 'info'
export type OnboardingPhase = 'preflight' | 'app' | 'credentials' | 'build' | 'done'
export type Platform = 'ios' | 'android'

export interface ChoiceOption {
  value: string
  label?: string
  note?: string
}

export interface CollectField {
  field: string
  desc: string
}

export interface NextAction {
  /** The exact tool to call next. */
  tool: string
  /** Argument hint for the model. */
  with?: Record<string, unknown>
  /** A literal, copy-pasteable example call the model can pattern-match. */
  call?: string
  /** Plain-English directive. */
  instruction: string
}

export interface NextStepResult {
  onboarding: 'capgo-builder'
  phase: OnboardingPhase
  /** Granular step name (reuses OnboardingStep vocabulary where applicable). */
  state: string
  platform?: Platform
  /** 0–100. */
  progress: number
  kind: StepKind
  summary: string
  /** Human-facing journey overview; informational, not an execution list. */
  roadmap?: string[]
  context?: Record<string, unknown>
  /** Present when kind === 'choice'. */
  options?: ChoiceOption[]
  /** Present when kind === 'human_gate'. */
  human?: { instruction: string, resourceUri?: string }
  /** Present when kind === 'human_gate': what to bring back. */
  collect?: CollectField[]
  next?: NextAction
  /** Rules of engagement; included on the first result of a session. */
  rules?: string[]
}

export const ONBOARDING_RULES: string[] = [
  'You are conducting Capgo Builder onboarding. Do not plan the steps yourself.',
  'Do exactly what the result\'s `next` says — never improvise the order or call other tools mid-flow.',
  'If kind is "human_gate", show `human.instruction` to the user, wait, then call `next.tool` with the values in `collect`. Never ask the user to paste secrets into the chat.',
  'If kind is "choice", present `options` and call `next.tool` with the user\'s pick.',
  'Never tell the user a step succeeded unless a result confirms it.',
  'If the user is confused, asks what a step means, or does not understand the options, call capgo_builder_onboarding_explain for a plain-language explanation — do not guess.',
]

/** Render a result into MCP text content: imperative directive first, structured data last. */
export function renderResult(result: NextStepResult): string {
  const lines: string[] = []
  lines.push(`Capgo Builder onboarding — phase: ${result.phase} · step: ${result.state} · ${result.progress}%`)
  lines.push('')
  lines.push(result.summary)

  // Surface a saved keystore path as a human line (not only inside the JSON blob).
  if (result.context && typeof result.context.keystorePath === 'string') {
    lines.push('')
    lines.push(`Saved keystore: ${result.context.keystorePath} (keep this file — you need it for every release)`)
  }

  // Surface a random-generated keystore password as a human line so the user can
  // save it (only set when the password was auto-generated — manual passwords the
  // user already knows are never echoed here).
  if (result.context && typeof result.context.keystorePassword === 'string') {
    lines.push(`Keystore password: ${result.context.keystorePassword} (save this with the keystore — you need both for every release)`)
  }

  if (result.roadmap?.length) {
    lines.push('')
    lines.push('PLAN (show the user):')
    for (const item of result.roadmap)
      lines.push(`  • ${item}`)
  }
  if (result.human?.instruction) {
    lines.push('')
    lines.push(`ACTION FOR THE USER:\n${result.human.instruction}`)
    if (result.human.resourceUri)
      lines.push(`(Detailed guide: ${result.human.resourceUri})`)
  }
  if (result.options?.length) {
    lines.push('')
    lines.push('OPTIONS:')
    for (const o of result.options)
      lines.push(`  - ${o.value}${o.label ? ` (${o.label})` : ''}${o.note ? ` — ${o.note}` : ''}`)
  }
  if (result.collect?.length) {
    lines.push('')
    lines.push('COLLECT FROM THE USER (never via chat if secret — use file paths / local login):')
    for (const c of result.collect)
      lines.push(`  - ${c.field}: ${c.desc}`)
  }
  if (result.next) {
    lines.push('')
    lines.push(`DO THIS NEXT: ${result.next.instruction}`)
    if (result.next.call)
      lines.push(`Example call: ${result.next.call}`)
  }
  lines.push('')
  lines.push('---')
  lines.push(JSON.stringify(result, null, 2))
  return lines.join('\n')
}
