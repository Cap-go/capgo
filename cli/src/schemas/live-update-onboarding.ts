// src/schemas/live-update-onboarding.ts
import { type } from './arktype'
import { capacitorConfigOptionSchema } from './sdk'

const packageJsonSchema = type('string > 0').describe('Package JSON for the Capacitor app to onboard. Use this with capacitorConfig when a monorepo config source lives outside the app directory.')
const mainFileSchema = type('string > 0').describe('Application entry file to update. Use this with capacitorConfig when a monorepo app has a separate main file.')

export const liveUpdateStartSchema = type({
  '+': 'delete',
  'capacitorConfig?': capacitorConfigOptionSchema.describe('Existing app-specific capacitor.config.* file to update while Capacitor loads the active root config (useful with dynamic monorepos).'),
  'packageJson?': packageJsonSchema,
  'mainFile?': mainFileSchema,
})

export const liveUpdateNextStepSchema = type({
  '+': 'delete',
  'capacitorConfig?': capacitorConfigOptionSchema.describe('The same app-specific capacitor.config.* source used to start onboarding when more than one source is active for this app.'),
  'packageJson?': packageJsonSchema,
  'mainFile?': mainFileSchema,
  'resumeChoice?': type("'continue' | 'restart'").describe('Answer to the resume prompt: "continue" resumes saved progress, "restart" wipes it'),
  'encryptionChoice?': type("'enable' | 'skip'").describe('Answer at setup-encryption: "enable" turns on bundle encryption, "skip" leaves it off'),
  'platform?': type("'ios' | 'android'").describe('Answer at select-platform: target device platform'),
  'dirtyGitAction?': type("'check-again' | 'continue-dirty'").describe('Answer at dirty-git: re-check after cleaning the repo, or continue with uncommitted changes'),
  'deviceRunConfirmed?': type('boolean').describe('Set true after the user ran the app on a device/simulator (run-on-device step)'),
  'otaReceivedConfirmed?': type('boolean').describe('Set true after the user confirms the OTA update appeared on device (test-update step)'),
})

export type LiveUpdateStartInput = typeof liveUpdateStartSchema.infer
export type LiveUpdateNextStepInput = typeof liveUpdateNextStepSchema.infer

export const liveUpdateExplainInputSchema = type({
  '+': 'delete',
  'state?': type('string').describe('Optional state name to explain (from a prior result state field).'),
  'capacitorConfig?': capacitorConfigOptionSchema.describe('The same app-specific capacitor.config.* source used to start onboarding when more than one source is active for this app.'),
})
