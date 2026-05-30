// src/schemas/onboarding.ts
// Input schema for the guided Capgo Builder onboarding `next_step` MCP tool.
// Shared so the runtime validation and the handler's TS type stay in sync.
import { z } from 'zod'

export const onboardingNextStepSchema = z.object({
  platform: z.enum(['ios', 'android']).optional().describe('Platform choice, when the previous step asked for it'),
  serviceAccountJsonPath: z.string().optional().describe('Path to your Google Play service-account JSON file, when the previous step asked for it'),
  runBuild: z.boolean().optional().describe('Set true (with platform) to trigger the first cloud build; set false to skip it and finish onboarding'),
  keyId: z.string().optional().describe('App Store Connect Key ID (iOS), when asked'),
  issuerId: z.string().optional().describe('App Store Connect Issuer ID (iOS), when asked'),
  p8Path: z.string().optional().describe('Path to your App Store Connect .p8 key file (iOS), when asked'),
})

export type OnboardingNextStepInput = z.infer<typeof onboardingNextStepSchema>
