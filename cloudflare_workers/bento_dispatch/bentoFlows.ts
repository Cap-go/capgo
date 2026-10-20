import type { QueuedEvaluation } from './contracts.ts'
import { invitationEvaluation } from './flows/invitations.ts'
import { lifecycleEvaluation } from './flows/lifecycle/index.ts'
import { lifecyclePreparation } from './flows/lifecycle/prepare.ts'

// Executable registry: add a named evaluation and its cadence here. Each
// Business finders remain read-only; preparation is an explicit queued task.
export const bentoFlows: Record<string, QueuedEvaluation> = Object.fromEntries([
  invitationEvaluation('new', 1, { everyMinutes: 1 }),
  invitationEvaluation('new', 2, { everyMinutes: 1 }),
  invitationEvaluation('existing', 1, { everyMinutes: 1 }),
  invitationEvaluation('existing', 2, { everyMinutes: 1 }),
  lifecycleEvaluation('ota'),
  lifecycleEvaluation('builder'),
  lifecyclePreparation,
].map(evaluation => [evaluation.key, evaluation]))
