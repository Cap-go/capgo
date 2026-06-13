import type { AndroidOnboardingProgress, AndroidOnboardingStep } from '../android/types.js'
import { getAndroidResumeStep } from '../android/progress.js'
import { androidViewForStep, applyAndroidInput, runAndroidEffect } from '../android/flow.js'
import type { AndroidStepView } from '../android/flow.js'
import type { PlatformFlow, StepView } from './contract.js'

/** Explicit total mapper: AndroidStepView → the platform-agnostic StepView. */
function mapAndroidViewToStepView(v: AndroidStepView): StepView {
  return {
    kind: v.kind,
    prompt: v.prompt ?? v.title ?? v.message ?? '',
    options: v.options?.map(o => ({ value: o.value, label: o.label ?? o.value, note: o.note })),
    collect: v.collect?.map(field => ({ field, desc: field })),
    context: { step: v.step, title: v.title, message: v.message },
  }
}

export const androidFlow: PlatformFlow<AndroidOnboardingStep, AndroidOnboardingProgress, Record<string, unknown>> = {
  resumeStep: progress => getAndroidResumeStep(progress),
  viewForStep: (step, progress, ctx) => mapAndroidViewToStepView(androidViewForStep(step, progress, ctx as never)),
  applyInput: (step, progress, input) => applyAndroidInput(step, progress, input as never),
  runEffect: (step, progress, deps) => runAndroidEffect(step, progress, deps as never),
}
