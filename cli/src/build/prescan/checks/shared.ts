// src/build/prescan/checks/shared.ts
import type { Finding, PrescanCheck, ScanContext } from '../types'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { gradleApplicationId, readTextIfExists } from '../gradle'

/** dependencies that are capacitor plugins (heuristic: @capacitor/* minus tooling, plus capacitor-* community names) */
function capacitorPluginDeps(projectDir: string): string[] {
  const pkgRaw = readTextIfExists(join(projectDir, 'package.json'))
  if (!pkgRaw)
    return []
  let pkg: { dependencies?: Record<string, string> }
  try {
    pkg = JSON.parse(pkgRaw)
  }
  catch {
    return []
  }
  const NON_PLUGINS = new Set(['@capacitor/core', '@capacitor/cli', '@capacitor/ios', '@capacitor/android', '@capacitor/assets', '@capacitor/synapse'])
  return Object.keys(pkg.dependencies ?? {}).filter(d => d.startsWith('@capacitor/') && !NON_PLUGINS.has(d))
}

/** '@capacitor/camera' -> 'capacitor-camera' (cap sync's gradle project naming) */
function gradleModuleName(dep: string): string {
  return dep.replace(/^@/, '').replace(/\//g, '-')
}

export const capSyncStale: PrescanCheck = {
  id: 'shared/cap-sync-stale',
  platforms: ['ios', 'android'],
  async run(ctx: ScanContext): Promise<Finding[]> {
    const findings: Finding[] = []
    const webDir = ctx.config?.webDir ?? 'dist'
    if (!existsSync(join(ctx.projectDir, webDir))) {
      findings.push({
        id: 'shared/cap-sync-stale',
        severity: 'error',
        title: `webDir "${webDir}" does not exist — web assets were never built`,
        fix: 'Run your web build (e.g. `npm run build`) then `npx cap sync` before requesting a build',
      })
      return findings
    }
    const plugins = capacitorPluginDeps(ctx.projectDir)
    if (ctx.platform === 'android' && plugins.length > 0) {
      const settings = readTextIfExists(join(ctx.projectDir, 'android', 'capacitor.settings.gradle'))
      if (settings === null) {
        findings.push({
          id: 'shared/cap-sync-stale',
          severity: 'error',
          title: 'android/capacitor.settings.gradle is missing — `npx cap sync android` was never run',
          fix: 'Run `npx cap sync android`',
        })
      }
      else {
        const missing = plugins.filter(p => !settings.includes(`:${gradleModuleName(p)}`))
        if (missing.length > 0) {
          findings.push({
            id: 'shared/cap-sync-stale',
            severity: 'error',
            title: `${missing.length} Capacitor plugin(s) not synced into the Android project`,
            detail: `missing from capacitor.settings.gradle: ${missing.join(', ')}`,
            fix: 'Run `npx cap sync android` (sync, not copy — copy does not regenerate plugin projects)',
          })
        }
      }
    }
    if (ctx.platform === 'ios' && plugins.length > 0) {
      const podfile = readTextIfExists(join(ctx.projectDir, 'ios', 'App', 'Podfile'))
      if (podfile === null) {
        findings.push({
          id: 'shared/cap-sync-stale',
          severity: 'error',
          title: 'ios/App/Podfile is missing — `npx cap sync ios` was never run',
          fix: 'Run `npx cap sync ios`',
        })
      }
    }
    return findings
  },
}

export const nodeLinkerLayout: PrescanCheck = {
  id: 'shared/node-linker-layout',
  platforms: ['ios', 'android'],
  async run(ctx: ScanContext): Promise<Finding[]> {
    const nm = join(ctx.projectDir, 'node_modules')
    if (existsSync(join(nm, '.bun'))) {
      return [{
        id: 'shared/node-linker-layout',
        severity: 'error',
        title: 'bun isolated node_modules layout detected — Capacitor Gradle/Pod paths will not resolve ("No variants exist")',
        fix: 'Reinstall with `bun install --linker=hoisted`',
      }]
    }
    if (existsSync(join(nm, '.pnpm'))) {
      return [{
        id: 'shared/node-linker-layout',
        severity: 'warning',
        title: 'pnpm symlinked node_modules layout detected — Capacitor native builds often need a hoisted layout',
        fix: 'If the build fails resolving @capacitor/* paths, set `node-linker=hoisted` in .npmrc and reinstall',
      }]
    }
    return []
  },
}

export const bundleIdConsistency: PrescanCheck = {
  id: 'shared/bundle-id-consistency',
  platforms: ['ios', 'android'],
  async run(ctx: ScanContext): Promise<Finding[]> {
    const expected = ctx.config?.appId ?? ctx.appId
    if (ctx.platform === 'android') {
      const actual = gradleApplicationId(ctx.projectDir)
      if (actual && actual !== expected) {
        return [{
          id: 'shared/bundle-id-consistency',
          severity: 'warning',
          title: 'Gradle applicationId differs from the Capacitor appId',
          detail: `capacitor.config appId: ${expected} — android/app/build.gradle applicationId: ${actual}`,
          fix: 'Align them (or pass the intended appId explicitly to `build request`)',
        }]
      }
      return []
    }
    // ios: compare against pbxproj signable targets
    const { findSignableTargets, readPbxproj } = await import('../../pbxproj-parser')
    // readPbxproj expects the project root — it searches <root>/ios/*.xcodeproj
    // and one level deeper (Capacitor's ios/App/App.xcodeproj) itself.
    const pbx = readPbxproj(ctx.projectDir)
    if (!pbx)
      return []
    const targets = findSignableTargets(pbx)
    if (targets.length > 0 && !targets.some(t => t.bundleId === expected)) {
      return [{
        id: 'shared/bundle-id-consistency',
        severity: 'warning',
        title: 'No Xcode target uses the Capacitor appId as its bundle identifier',
        detail: `capacitor appId: ${expected} — targets: ${targets.map(t => `${t.name}=${t.bundleId}`).join(', ')}`,
        fix: 'Align PRODUCT_BUNDLE_IDENTIFIER with the appId, or build with the intended appId',
      }]
    }
    return []
  },
}
