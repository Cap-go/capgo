// src/build/prescan/prompt.ts
import type { PrescanOutcome } from './types'
import { confirm, isCancel } from '@clack/prompts'
import { canPromptInteractively } from '../../utils'

export interface WarningGateOptions {
  silent?: boolean
  /** test seam; defaults to canPromptInteractively() at call time */
  interactive?: boolean
  /** test seam; defaults to @clack/prompts confirm */
  confirmImpl?: (opts: { message: string }) => Promise<boolean | symbol>
}

/**
 * Resolve an 'ask' outcome: interactive → user decides; non-interactive → proceed (per spec).
 * Returns the final go/no-go.
 */
export async function resolveWarningGate(outcome: PrescanOutcome, opts: WarningGateOptions = {}): Promise<'proceed' | 'block'> {
  if (outcome !== 'ask') return outcome === 'block' ? 'block' : 'proceed'
  const interactive = opts.interactive ?? canPromptInteractively({ silent: opts.silent })
  if (!interactive) return 'proceed'
  const ask = opts.confirmImpl ?? confirm
  const answer = await ask({ message: 'Prescan found warnings. Proceed with the build anyway?' })
  // anything but an explicit "yes" (including clack cancel) blocks
  if (isCancel(answer) || answer !== true) return 'block'
  return 'proceed'
}
