// src/build/prescan/prompt.ts
import type { PrescanOutcome } from './types'
import { confirm, isCancel } from '@clack/prompts'
import { canPromptInteractively } from '../../utils'

/**
 * Resolve an 'ask' outcome: interactive → user decides; non-interactive → proceed (per spec).
 * Returns the final go/no-go.
 */
export async function resolveWarningGate(outcome: PrescanOutcome, opts: { silent?: boolean } = {}): Promise<'proceed' | 'block'> {
  if (outcome !== 'ask') return outcome === 'block' ? 'block' : 'proceed'
  if (!canPromptInteractively({ silent: opts.silent })) return 'proceed'
  const answer = await confirm({ message: 'Prescan found warnings. Proceed with the build anyway?' })
  if (isCancel(answer) || answer === false) return 'block'
  return 'proceed'
}
