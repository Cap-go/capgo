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
// Build + finish: when the user picks 'build' at handoff-build the flow REUSES
// the shared onboarding tail inline (saving-credentials → ask-build →
// requesting-build → CI/CD secrets → build-complete) for the chosen platform —
// the SAME generic StepView renderer drives the tail's choice/input/info/auto
// steps, with ONE bespoke takeover: the fullscreen streaming build-output pane
// (FullscreenBuildOutput) at requesting-build, mirroring the native app.tsx.
// 'skip' finishes with creds persisted (build later via `capgo build request`).
import type { FC } from 'react'
import { Box, Text, useApp } from 'ink'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Select } from '@inkjs/ui'
import type { OnboardingResult } from '../types.js'
import type { StepView } from '../flow/contract.js'
import type { AppflowEffectResult } from '../appflow/flow.js'
import type { AppflowProgress, AppflowStep, MigrationScope } from '../appflow/types.js'
import { appflowFlow, isAppflowTailStep, markTailRunComplete, nextTailStep } from '../appflow/flow.js'
import type { TailStep } from '../tail/flow.js'
import { buildAppflowEffectDeps, persistAppflowCredentials } from '../appflow/deps.js'
import { sanitizeBuildLogLines } from '../build-log.js'
import { Header, ErrorLine, SpinnerLine, SuccessLine, FilteredTextInput, FullscreenBuildOutput } from './components.js'
import { useTerminalSize } from './shell.js'
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

const AppflowApp: FC<AppflowAppProps> = ({ appId, scope, apikey, supaHost, journeyId, onStep, onResult, onBeforeExit }) => {
  const { exit } = useApp()
  const { rows: terminalRows } = useTerminalSize()
  const [progress, setProgress] = useState<AppflowProgress>(() => ({ scope, migratable: { ios: false, android: false }, completedSteps: [] }))
  const [step, setStep] = useState<AppflowStep>(() => appflowFlow.resumeStep(null))
  const [ctx, setCtx] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState<{ kind: 'done' | 'error', message: string } | null>(null)
  // Streaming build-output lines for the fullscreen takeover at requesting-build.
  const [buildOutput, setBuildOutput] = useState<string[]>([])
  // Guards a single deps build (the appflow-side validators/token) + a single
  // in-flight auto effect per step.
  const depsRef = useRef(buildAppflowEffectDeps({ appId, packageName: appId }))

  const exitNow = useCallback(() => exitAfterOnboardingBeforeExit(onBeforeExit, exit), [onBeforeExit, exit])

  // Report step transitions (drop-off tracking) — same hook the native apps use.
  useEffect(() => {
    onStep?.(`appflow-${step}`)
  }, [step, onStep])

  const view: StepView = appflowFlow.viewForStep(step, progress, ctx)

  const finishMigration = useCallback(async (finalProgress: AppflowProgress) => {
    try {
      await persistAppflowCredentials(appId, finalProgress)
    }
    catch {
      // Persisting is best-effort here; the credentials still live in progress.
    }
    onResult?.({ outcome: 'completed' })
    const built = finalProgress.builtPlatforms ?? []
    const message = built.length > 0
      ? `Appflow migration complete. Build requested for: ${built.join(', ')}. Track it at https://capgo.app.`
      : 'Appflow migration complete. Your imported credentials are saved — run `capgo build request` to build.'
    setFinished({ kind: 'done', message })
    setTimeout(exitNow, 50)
  }, [appId, onResult, exitNow])

  // ── auto steps: run the flow effect, then advance to `next` ──────────────────
  useEffect(() => {
    if (view.kind !== 'auto' || busy || finished)
      return
    let cancelled = false
    setBusy(true)
    void (async () => {
      try {
        // The shared build/CI tail effects need their deps + the prior effect's
        // transient threaded back as `carried` (NEVER persisted). Build a per-effect
        // deps object: the appflow validators/token from depsRef PLUS the tail
        // wiring (api key / gateway / journey + build-output & side-log sinks) and
        // the carried transient = the current ctx.
        const effectDeps = {
          ...depsRef.current,
          carried: ctx,
          tailOptions: {
            apikey,
            supaHost,
            journeyId,
            carried: ctx as Record<string, unknown>,
            onBuildOutput: (line: string) => {
              if (!cancelled)
                setBuildOutput(prev => [...prev, ...sanitizeBuildLogLines(line)])
            },
            onLog: (_message: string, _color?: string) => {
              // Side-log lines (✔ Credentials saved, ✔ Uploaded …) are informational;
              // the wizard surfaces the build pane + step prompts, so we drop them here.
            },
          },
        }
        const result = (await appflowFlow.runEffect(step, progress, effectDeps)) as AppflowEffectResult
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

  // Advance an interactive step with the user's answer (a choice value or a
  // collected input field), then re-derive the next step.
  const advance = useCallback((value?: string, text?: string) => {
    const next = appflowFlow.applyInput(step, progress, { value, text })
    setProgress(next)

    // Shared tail interactive steps transition by the tail's driver table (NOT
    // the resume router). build-complete is the tail terminal: record the run and
    // route to the next platform's tail entry or finish.
    if (isAppflowTailStep(step)) {
      if (step === 'build-complete') {
        const { progress: marked, next: after } = markTailRunComplete(next)
        setProgress(marked)
        if (after === 'done') {
          void finishMigration(marked)
          return
        }
        setCtx({})
        setStep(after)
        return
      }
      setCtx({})
      setStep(nextTailStep(step as TailStep, value, next))
      return
    }

    const resumed = appflowFlow.resumeStep(next)
    // 'done' is terminal — finish (persist creds + report completed). Reached on a
    // 'skip' hand-off, a build-platform-pick 'skip', or after all builds complete.
    if (resumed === 'done') {
      void finishMigration(next)
      return
    }
    setCtx({})
    setStep(resumed)
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

  // Bespoke takeover: the streaming build-output pane (requesting-build). Owns the
  // whole terminal like the native app.tsx so the unbounded log can't trip the
  // wizard's body-measurement / too-small gate.
  if (step === 'requesting-build') {
    return <FullscreenBuildOutput title="Building..." lines={buildOutput} terminalRows={terminalRows} />
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
    // via the flow's applyInput (the tail's pick-build-script-custom uses this).
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
