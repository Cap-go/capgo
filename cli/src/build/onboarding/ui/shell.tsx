import type { FC } from 'react'
import type { Platform } from '../types.js'
// src/build/onboarding/ui/shell.tsx
//
// Top-level wizard shell, rendered ONCE inside the alt-screen buffer
// (render(<OnboardingShell/>, { alternateScreen: true })). It owns platform
// selection so the picker lives inside the alt screen, then mounts the chosen
// platform's existing app INLINE in the same Ink tree — no second render, no
// alt-screen flash.
//
// Progress is loaded BEFORE the app mounts, and crucially WITHOUT a visible
// loading interstitial on the picker path: pressing a platform kicks off the
// (few-ms) disk read while the picker stays on screen, then the app mounts
// directly once it resolves. So the user sees picker → app, never a 1-frame
// "Loading…" that appears and vanishes. (When the platform is pre-resolved via
// --platform / a single native dir there's no picker to keep, so we briefly
// show just the framed header until the app mounts — startup, not mid-flow.)
//
// `command.ts` passes `initialPlatform` to skip the picker, and
// `onResolvePlatform` so it can print the post-exit completion breadcrumb.
import { Box, useStdout } from 'ink'
import React, { useCallback, useEffect, useState } from 'react'
import { loadAndroidProgress } from '../android/progress.js'
import AndroidOnboardingApp from '../android/ui/app.js'
import { loadProgress } from '../progress.js'
import OnboardingApp from './app.js'
import { PICKER_MIN_COLS, PICKER_MIN_ROWS, terminalFitsPicker } from '../min-terminal-size.js'
import { Header } from './components.js'
import { pickPlatformLayout } from './frame-fit.js'
import { TerminalTooSmallPrompt } from './min-size-gate.js'
import { PlatformPicker } from './platform-picker.js'

// Progress shapes derived from the loaders so we don't re-import the type names.
type IosProgress = Awaited<ReturnType<typeof loadProgress>>
type AndroidProgress = Awaited<ReturnType<typeof loadAndroidProgress>>

// A loaded, ready-to-mount app (discriminated so the per-platform progress
// types stay precise without a union-of-progress field).
type ReadyApp
  = | { kind: 'ios', progress: IosProgress }
    | { kind: 'android', progress: AndroidProgress }

async function loadReady(platform: Platform, appId: string): Promise<ReadyApp> {
  if (platform === 'android')
    return { kind: 'android', progress: await loadAndroidProgress(appId) }
  return { kind: 'ios', progress: await loadProgress(appId) }
}

// Live terminal size, tracked through resize — drives the picker's cards↔list
// layout and the full-height frame.
//
// We read `stdout.rows/columns` DIRECTLY each render (not from state) and only
// use the resize listener to force a re-render. When the terminal resizes, Node
// updates stdout.rows/columns and Ink re-renders the tree — at which point the
// direct read is already current. Holding the size in state instead lags by one
// frame (the resize re-render runs with the stale state until setState flushes),
// which shows up as a 1-row "jump then correct" on the bottom-pinned legend.
//
// Exported so the resize harness in test/test-frame-fit-resize.mjs drives the
// REAL hook (not a copy) through a simulated resize.
export function useTerminalSize(): { cols: number, rows: number } {
  const { stdout } = useStdout()
  const [, forceRerender] = useState(0)
  useEffect(() => {
    if (!stdout)
      return
    const onResize = (): void => forceRerender(n => n + 1)
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout])
  return { cols: stdout?.columns ?? 80, rows: stdout?.rows ?? 24 }
}

export interface OnboardingShellProps {
  appId: string
  iosDir: string
  androidDir: string
  apikey?: string
  /** Pre-resolved platform (--platform flag or the single existing native dir); skips the picker. */
  initialPlatform?: Platform
  /** Called once a platform is chosen so the caller can print the completion breadcrumb. */
  onResolvePlatform?: (platform: Platform) => void
}

const OnboardingShell: FC<OnboardingShellProps> = ({ appId, iosDir, androidDir, apikey, initialPlatform, onResolvePlatform }) => {
  const { cols, rows } = useTerminalSize()
  const [ready, setReady] = useState<ReadyApp | null>(null)

  // Begin loading the chosen platform's progress; mount the app once it lands.
  // The picker stays on screen during the (few-ms) load, so there's no loading
  // frame on the picker path.
  const choose = useCallback((platform: Platform) => {
    onResolvePlatform?.(platform)
    void loadReady(platform, appId).then(setReady)
  }, [appId, onResolvePlatform])

  // Pre-resolved platform → load immediately (no picker shown).
  useEffect(() => {
    if (initialPlatform)
      choose(initialPlatform)
  }, [initialPlatform, choose])

  // Render the chosen app DIRECTLY (no MinSizeGate wrapper). Each app self-gates
  // internally (renders the resize prompt from its own render when the terminal
  // is too small) so it STAYS MOUNTED across resizes — wrapping it in a gate
  // here would unmount it on a mid-flow shrink, tearing down step state and
  // exiting the wizard. The app owns the size decision so a shrink→regrow keeps
  // the user exactly where they were.
  if (ready?.kind === 'ios')
    return <OnboardingApp appId={appId} initialProgress={ready.progress} iosDir={iosDir} apikey={apikey} />
  if (ready?.kind === 'android')
    return <AndroidOnboardingApp appId={appId} initialProgress={ready.progress} androidDir={androidDir} apikey={apikey} />

  // Not ready yet: the platform picker (or a brief framed load). The picker is
  // NOT gated to the full 80×49 onboarding floor — it's small and adapts
  // cards↔list, so the user can always choose their platform first (the step
  // floor is enforced afterward by each app). BUT if the terminal is so small
  // the boxed banner can't even render, the picker screen is broken and
  // onboarding can't run anyway — so show the resize prompt instead of silently
  // clipping the banner. terminalFitsPicker is the tiny banner-fits floor
  // (44×11), well below the step floor, so the middle band still shows the
  // picker. Resize-reactive via cols/rows from useTerminalSize.
  if (!terminalFitsPicker(cols, rows))
    return <TerminalTooSmallPrompt cols={cols} rows={rows} minCols={PICKER_MIN_COLS} minRows={PICKER_MIN_ROWS} />

  return (
    <Box flexDirection="column" minHeight={rows} padding={1}>
      <Header />
      {!initialPlatform && <PlatformPicker layout={pickPlatformLayout(cols, rows)} onSelect={choose} />}
    </Box>
  )
}

export default OnboardingShell
