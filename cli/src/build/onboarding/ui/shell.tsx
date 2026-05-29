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
//   • platform unknown → the responsive PlatformPicker (cards / list), framed
//     with the same Header + full-height Box as the rest of the wizard.
//   • platform chosen  → load that platform's progress, then mount
//     <OnboardingApp/> or <AndroidOnboardingApp/> (each owns its own framing).
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

// Loads iOS progress then mounts the iOS app. The brief spinner only shows
// during the (fast) disk read.
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
    return <SpinnerLine text="Loading…" />
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
    return <SpinnerLine text="Loading…" />
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

  useEffect(() => {
    if (platform)
      onResolvePlatform?.(platform)
  }, [platform, onResolvePlatform])

  // Live terminal size: drives the picker's cards↔list layout and lets the
  // picker frame fill the viewport (minHeight) for a ghost-free redraw on resize.
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

  if (platform === 'android')
    return <AndroidApp appId={appId} androidDir={androidDir} apikey={apikey} />
  if (platform === 'ios')
    return <IosApp appId={appId} iosDir={iosDir} apikey={apikey} />

  const layout = pickPlatformLayout(size.cols, size.rows)
  return (
    <Box flexDirection="column" minHeight={size.rows} padding={1}>
      <Header compact={layout === 'list'} />
      <PlatformPicker layout={layout} onSelect={setPlatform} />
    </Box>
  )
}

export default OnboardingShell
