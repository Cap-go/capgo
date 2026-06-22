// src/build/onboarding/ui/appflow-app.tsx
//
// Interactive Ink renderer for the Appflow migration flow. Unlike the bespoke
// iOS / Android wizard apps, this is a GENERIC neutral-StepView renderer: it
// drives the platform-agnostic appflowFlow (flow/contract.ts StepView) and maps
// each kind to an Ink primitive —
//   'choice'              -> @inkjs/ui Select(options)
//   'input'               -> FilteredTextInput per StepView.collect field
//   'info' / 'human_gate' -> message + a single "Continue" Select
//   'auto'                -> runs the flow effect in a bounded loop (spinner)
//   'done' / 'error'      -> terminal line + exit
//
// The flow is a CREDENTIAL SOURCE: on completion the collected per-platform
// Capgo creds are persisted into the real credential store (persistAppflowCredentials)
// and the wizard reports `completed` so the shell prints the breadcrumb. Build /
// CI convergence is intentionally left to the standalone `capgo build request`
// path (see the report notes) — this app finishes the migration with creds saved.
import type { FC } from 'react'
import { Box, Text, useApp } from 'ink'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Select } from '@inkjs/ui'
import type { OnboardingResult } from '../types.js'
import type { StepView } from '../flow/contract.js'
import type { AppflowEffectResult } from '../appflow/flow.js'
import type { AppflowProgress, AppflowStep, MigrationScope } from '../appflow/types.js'
import { appflowFlow } from '../appflow/flow.js'
import { buildAppflowEffectDeps, persistAppflowCredentials } from '../appflow/deps.js'
import { Header, ErrorLine, SpinnerLine, SuccessLine, FilteredTextInput } from './components.js'
import { exitAfterOnboardingBeforeExit } from './exit.js'
import type { OnboardingBeforeExit } from './exit.js'

export interface AppflowAppProps {
  appId: string
  /** Migration scope: 'both' (picker) or 'ios' / 'android' (single-platform gate). */
  scope: MigrationScope
  apikey?: string
  supaHost?: string
  journeyId: string
  onStep?: (step: string) => void
  onResult?: (result: OnboardingResult) => void
  onBeforeExit?: OnboardingBeforeExit
}

const AppflowApp: FC<AppflowAppProps> = ({ appId, scope, onStep, onResult, onBeforeExit }) => {
  const { exit } = useApp()
  const [progress, setProgress] = useState<AppflowProgress>(() => ({ scope, migratable: { ios: false, android: false }, completedSteps: [] }))
  const [step, setStep] = useState<AppflowStep>(() => appflowFlow.resumeStep(null))
  const [ctx, setCtx] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState<{ kind: 'done' | 'error', message: string } | null>(null)
  // Guards a single deps build + a single in-flight auto effect per step.
  const depsRef = useRef(buildAppflowEffectDeps({ appId, packageName: appId }))

  const exitNow = useCallback(() => exitAfterOnboardingBeforeExit(onBeforeExit, exit), [onBeforeExit, exit])

  // Report step transitions (drop-off tracking) — same hook the native apps use.
  useEffect(() => {
    onStep?.(`appflow-${step}`)
  }, [step, onStep])

  const view: StepView = appflowFlow.viewForStep(step, progress, ctx)

  // ── auto steps: run the flow effect, then advance to `next` ──────────────────
  useEffect(() => {
    if (view.kind !== 'auto' || busy || finished)
      return
    let cancelled = false
    setBusy(true)
    void (async () => {
      try {
        const result = (await appflowFlow.runEffect(step, progress, depsRef.current)) as AppflowEffectResult
        if (cancelled)
          return
        setProgress(result.progress)
        setCtx(result.transient ?? {})
        if (result.next)
          setStep(result.next)
        else
          await finishMigration(result.progress)
      }
      catch (err) {
        if (cancelled)
          return
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        setFinished({ kind: 'error', message: `Appflow migration error at "${step}": ${message}. Email support@capgo.app if this persists.` })
      }
      finally {
        if (!cancelled)
          setBusy(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, view.kind])

  const finishMigration = useCallback(async (finalProgress: AppflowProgress) => {
    try {
      await persistAppflowCredentials(appId, finalProgress)
    }
    catch {
      // Persisting is best-effort here; the credentials still live in progress.
    }
    onResult?.({ outcome: 'completed' })
    setFinished({ kind: 'done', message: 'Appflow migration complete. Your imported credentials are saved — run `capgo build request` to build.' })
    setTimeout(exitNow, 50)
  }, [appId, onResult, exitNow])

  // Advance an interactive step with the user's answer (a choice value or a
  // collected input field), then re-derive the next step.
  const advance = useCallback((value?: string, text?: string) => {
    const next = appflowFlow.applyInput(step, progress, { value, text })
    setProgress(next)
    // handoff-build with 'skip' finishes; 'build' would converge onto the build
    // tail — left to `capgo build request` for now (see report). Either way the
    // migration is complete once creds are persisted.
    if (step === 'handoff-build') {
      void finishMigration(next)
      return
    }
    setCtx({})
    setStep(appflowFlow.resumeStep(next))
  }, [step, progress, finishMigration])

  if (finished) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header />
        <Box marginTop={1}>
          {finished.kind === 'done' ? <SuccessLine text={finished.message} /> : <ErrorLine text={finished.message} />}
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header />
      <Box marginTop={1} flexDirection="column">
        <Text>{view.prompt}</Text>
        {error && <Box marginTop={1}><ErrorLine text={error} /></Box>}
        <Box marginTop={1}>
          {renderBody(view, busy, advance)}
        </Box>
      </Box>
    </Box>
  )
}

/** Render the interactive body for the current StepView kind. */
function renderBody(view: StepView, busy: boolean, advance: (value?: string, text?: string) => void): React.ReactNode {
  if (busy || view.kind === 'auto')
    return <SpinnerLine text="Working…" />
  if (view.kind === 'choice') {
    return (
      <Select
        options={(view.options ?? []).map(o => ({ label: o.note ? `${o.label}  (${o.note})` : o.label, value: o.value }))}
        onChange={value => advance(value)}
      />
    )
  }
  if (view.kind === 'input') {
    // Collect the FIRST field; multi-field collects advance one field per submit
    // via the flow's applyInput (the appflow flow does not currently emit 'input',
    // but the renderer supports it for completeness / future steps).
    const field = view.collect?.[0]
    return (
      <FilteredTextInput
        placeholder={field?.desc ?? ''}
        mask={Boolean(field?.secret)}
        onSubmit={text => advance(undefined, text)}
      />
    )
  }
  // 'info' / 'human_gate' / 'done' / 'error': a single continue.
  return (
    <Select
      options={[{ label: 'Continue', value: 'continue' }]}
      onChange={() => advance('continue')}
    />
  )
}

export default AppflowApp
