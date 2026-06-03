import type { AndroidOnboardingProgress, AndroidOnboardingStep } from '../android/types.js'
import { getAndroidResumeStep } from '../android/progress.js'
import { androidViewForStep, applyAndroidInput, runAndroidEffect } from '../android/flow.js'
import type { PlatformFlow, StepView } from './contract.js'

export const androidFlow: PlatformFlow<AndroidOnboardingStep, AndroidOnboardingProgress, Record<string, unknown>> = {
  resumeStep: progress => getAndroidResumeStep(progress),
  viewForStep: (step, progress, ctx) => androidViewForStep(step, progress, ctx as never) as unknown as StepView,
  applyInput: (step, progress, input) => applyAndroidInput(step, progress, input as never),
  runEffect: (step, progress, deps) => runAndroidEffect(step, progress, deps as never),
}
