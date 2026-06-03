import type { OnboardingProgress, OnboardingStep } from '../types.js'
import { getIosResumeStep } from '../ios/progress.js'
import { applyIosInput, iosViewForStep, runIosEffect } from '../ios/flow.js'
import type { IosStepView } from '../ios/flow.js'
import type { PlatformFlow, StepView } from './contract.js'

/** Explicit total mapper: IosStepView → the platform-agnostic StepView. */
function mapIosViewToStepView(v: IosStepView): StepView {
  return {
    kind: v.kind,
    prompt: v.prompt ?? v.title ?? v.message ?? '',
    options: v.options?.map(o => ({ value: o.value, label: o.label ?? o.value, note: o.note })),
    collect: v.collect?.map(field => ({ field, desc: field })),
    context: { step: v.step, title: v.title, message: v.message },
  }
}

export const iosFlow: PlatformFlow<OnboardingStep, OnboardingProgress, Record<string, unknown>> = {
  resumeStep: progress => getIosResumeStep(progress),
  viewForStep: (step, progress, ctx) => mapIosViewToStepView(iosViewForStep(step, progress, ctx as never)),
  applyInput: (step, progress, input) => applyIosInput(step, progress, input as never),
  runEffect: (step, progress, deps) => runIosEffect(step, progress, deps as never),
}
