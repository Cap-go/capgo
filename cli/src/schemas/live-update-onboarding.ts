// src/schemas/live-update-onboarding.ts
import { z } from 'zod'

export const liveUpdateNextStepSchema = z.object({
  resumeChoice: z.enum(['continue', 'restart']).optional().describe('Answer to the resume prompt: "continue" resumes saved progress, "restart" wipes it'),
  encryptionChoice: z.enum(['enable', 'skip']).optional().describe('Answer at setup-encryption: "enable" turns on bundle encryption, "skip" leaves it off'),
  platform: z.enum(['ios', 'android']).optional().describe('Answer at select-platform: target device platform'),
  dirtyGitAction: z.enum(['check-again', 'continue-dirty']).optional().describe('Answer at dirty-git: re-check after cleaning the repo, or continue with uncommitted changes'),
  deviceRunConfirmed: z.boolean().optional().describe('Set true after the user ran the app on a device/simulator (run-on-device step)'),
  otaReceivedConfirmed: z.boolean().optional().describe('Set true after the user confirms the OTA update appeared on device (test-update step)'),
})

export type LiveUpdateNextStepInput = z.infer<typeof liveUpdateNextStepSchema>
