// src/build/prescan/gradle.ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function readTextIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

/** Parse android/gradle.properties into a key→value map (ignores comments/blank lines). */
export function gradleProperties(projectDir: string): Record<string, string> {
  const raw = readTextIfExists(join(projectDir, 'android', 'gradle.properties'))
  const out: Record<string, string> = {}
  if (!raw)
    return out
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || t.startsWith('//'))
      continue
    const eq = t.indexOf('=')
    if (eq > 0)
      out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
  }
  return out
}

/** Count `include ':…'` modules in android/capacitor.settings.gradle (proxy for plugin module count). */
export function settingsGradleModuleCount(projectDir: string): number {
  const raw = readTextIfExists(join(projectDir, 'android', 'capacitor.settings.gradle'))
  if (!raw)
    return 0
  return (raw.match(/^\s*include\s+':/gm) ?? []).length
}

export function appBuildGradle(projectDir: string): string | null {
  return readTextIfExists(join(projectDir, 'android', 'app', 'build.gradle'))
    ?? readTextIfExists(join(projectDir, 'android', 'app', 'build.gradle.kts'))
}

export function gradleApplicationId(projectDir: string): string | null {
  const gradle = appBuildGradle(projectDir)
  const m = gradle?.match(/applicationId\s*[=( ]\s*["']([\w.]+)["']/)
  return m?.[1] ?? null
}
