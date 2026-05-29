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
//   • platform unknown → the responsive PlatformPicker (cards / list).
//   • platform chosen  → load that platform's progress, then mount
//     <OnboardingApp/> or <AndroidOnboardingApp/>.
//
// Every shell frame (picker, the brief progress-load, and each app) is a
// FULL-HEIGHT framed box with the same Header, so transitions only change the
// body — never collapse the screen to a stray 1-line frame (which read as a
// flash when selecting a platform). The apps render their own identical
// full-height frame, so picker → loading → app is seamless.
//
// `command.ts` passes `initialPlatform` (from --platform or the single existing
// native dir) to skip the picker, and `onResolvePlatform` so it can print the
// post-exit completion breadcrumb with the resolved platform.
import { Box, useStdout } from 'ink'
import React, { useEffect, useState } from 'react'
import { loadAndroidProgress } from '../android/progress.js'
import AndroidOnboardingApp from '../android/ui/app.js'
import { loadProgress } from '../progress.js'
import OnboardingApp from './app.js'
import { Header, SpinnerLine } from './components.js'
import { pickPlatformLayout } from './frame-fit.js'
import { PlatformPicker } from './platform-picker.js'

// Progress shapes derived from the loaders so we don't re-import the type names.
type IosProgress = Awaited<ReturnType<typeof loadProgress>>
type AndroidProgress = Awaited<ReturnType<typeof loadAndroidProgress>>

// Live terminal size, tracked through resize. Shared by the picker frame and
// the loading frame so both fill the viewport (and reflow on resize).
function useTerminalSize(): { cols: number, rows: number } {
  const { stdout } = useStdout()
  const [size, setSize] = useState<{ cols: number, rows: number }>({
    cols: stdout?.columns ?? 80,
    rows: stdout?.rows ?? 24,
  })
  useEffect(() => {
    if (!stdout)
      return
    const onResize = (): void => setSize({ cols: stdout.columns ?? 80, rows: stdout.rows ?? 24 })
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout])
  return size
}

// The full-height framed shell box (header + body), shared by the picker and
// the loading frame so the screen never collapses between them.
const ShellFrame: FC<{ cols: number, rows: number, children: React.ReactNode }> = ({ cols, rows, children }) => (
  <Box flexDirection="column" minHeight={rows} padding={1}>
    <Header compact={pickPlatformLayout(cols, rows) === 'list'} />
    {children}
  </Box>
)

// Brief framed loading state shown while a platform's progress loads from disk.
const LoadingScreen: FC = () => {
  const { cols, rows } = useTerminalSize()
  return (
    <ShellFrame cols={cols} rows={rows}>
      <Box marginTop={1}>
        <SpinnerLine text="Loading…" />
      </Box>
    </ShellFrame>
  )
}

// Loads iOS progress (framed spinner during the read) then mounts the iOS app.
const IosApp: FC<{ appId: string, iosDir: string, apikey?: string }> = ({ appId, iosDir, apikey }) => {
  const [loaded, setLoaded] = useState<{ progress: IosProgress } | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadProgress(appId).then((progress) => {
      if (!cancelled)
        setLoaded({ progress })
    })
    return () => {
      cancelled = true
    }
  }, [appId])
  if (!loaded)
    return <LoadingScreen />
  return <OnboardingApp appId={appId} initialProgress={loaded.progress} iosDir={iosDir} apikey={apikey} />
}

const AndroidApp: FC<{ appId: string, androidDir: string, apikey?: string }> = ({ appId, androidDir, apikey }) => {
  const [loaded, setLoaded] = useState<{ progress: AndroidProgress } | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadAndroidProgress(appId).then((progress) => {
      if (!cancelled)
        setLoaded({ progress })
    })
    return () => {
      cancelled = true
    }
  }, [appId])
  if (!loaded)
    return <LoadingScreen />
  return <AndroidOnboardingApp appId={appId} initialProgress={loaded.progress} androidDir={androidDir} apikey={apikey} />
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
  const [platform, setPlatform] = useState<Platform | null>(initialPlatform ?? null)
  const { cols, rows } = useTerminalSize()

  useEffect(() => {
    if (platform)
      onResolvePlatform?.(platform)
  }, [platform, onResolvePlatform])

  if (platform === 'android')
    return <AndroidApp appId={appId} androidDir={androidDir} apikey={apikey} />
  if (platform === 'ios')
    return <IosApp appId={appId} iosDir={iosDir} apikey={apikey} />

  return (
    <ShellFrame cols={cols} rows={rows}>
      <PlatformPicker layout={pickPlatformLayout(cols, rows)} onSelect={setPlatform} />
    </ShellFrame>
  )
}

export default OnboardingShell
