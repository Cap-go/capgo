// src/schemas/live-update-onboarding.ts
import { z } from 'zod'
import { capacitorConfigOptionSchema } from './sdk'

const packageJsonSchema = z.string().min(1).optional().describe('Package JSON for the Capacitor app to onboard. Use this with capacitorConfig when a monorepo config source lives outside the app directory.')
const mainFileSchema = z.string().min(1).optional().describe('Application entry file to update. Use this with capacitorConfig when a monorepo app has a separate main file.')

export const liveUpdateStartSchema = z.object({
  capacitorConfig: capacitorConfigOptionSchema.describe('Existing app-specific capacitor.config.* file to update while Capacitor loads the active root config (useful with dynamic monorepos).'),
  packageJson: packageJsonSchema,
  mainFile: mainFileSchema,
})

export const liveUpdateNextStepSchema = z.object({
  capacitorConfig: capacitorConfigOptionSchema.describe('The same app-specific capacitor.config.* source used to start onboarding when more than one source is active for this app.'),
  packageJson: packageJsonSchema,
  mainFile: mainFileSchema,
  resumeChoice: z.enum(['continue', 'restart']).optional().describe('Answer to the resume prompt: "continue" resumes saved progress, "restart" wipes it'),
  encryptionChoice: z.enum(['enable', 'skip']).optional().describe('Answer at setup-encryption: "enable" turns on bundle encryption, "skip" leaves it off'),
  platform: z.enum(['ios', 'android']).optional().describe('Answer at select-platform: target device platform'),
  dirtyGitAction: z.enum(['check-again', 'continue-dirty']).optional().describe('Answer at dirty-git: re-check after cleaning the repo, or continue with uncommitted changes'),
  deviceRunConfirmed: z.boolean().optional().describe('Set true after the user ran the app on a device/simulator (run-on-device step)'),
  otaReceivedConfirmed: z.boolean().optional().describe('Set true after the user confirms the OTA update appeared on device (test-update step)'),
})

export type LiveUpdateStartInput = z.infer<typeof liveUpdateStartSchema>
export type LiveUpdateNextStepInput = z.infer<typeof liveUpdateNextStepSchema>
