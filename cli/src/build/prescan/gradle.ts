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
  if (!gradle)
    return null
  // Comment-strip first so a commented `// applicationId "x"` line is ignored.
  const m = stripGradleComments(gradle).match(/applicationId\s*[=( ]\s*["']([\w.]+)["']/)
  return m?.[1] ?? null
}

const SDK_DIMENSIONS = {
  minSdk: 'minSdkVersion',
  targetSdk: 'targetSdkVersion',
  compileSdk: 'compileSdkVersion',
} as const

export type SdkDimension = keyof typeof SDK_DIMENSIONS

/**
 * Remove block and line (`//`) comments from a Gradle source. Required because
 * gradleApplicationId / resolveSdk must not match commented declarations.
 * Conservative: line stripping cuts from `//` to end-of-line, so a `//` inside
 * a string literal trims that line's tail - acceptable for the presence/value
 * scans these helpers perform.
 */
export function stripGradleComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, '')
}

/**
 * Parse android/variables.gradle `ext { name = <int> }` into a key->number map.
 * The canonical Capacitor template puts SDK literals here and app/build.gradle
 * only references rootProject.ext.*. Non-integer values are skipped.
 */
export function variablesGradle(projectDir: string): Record<string, number> {
  const raw = readTextIfExists(join(projectDir, 'android', 'variables.gradle'))
  const out: Record<string, number> = {}
  if (!raw)
    return out
  const stripped = stripGradleComments(raw)
  const extOpen = stripped.search(/\bext\s*\{/)
  // Scan the ext{...} body when present; otherwise scan the whole file.
  const body = extOpen === -1 ? stripped : sliceBraceBody(stripped, extOpen)
  for (const m of body.matchAll(/([A-Za-z_]\w*)\s*=\s*(\d+)\b/g))
    out[m[1]] = Number(m[2])
  return out
}

/** Slice the body of the first `{ ... }` starting at/after `from`. */
function sliceBraceBody(source: string, from: number): string {
  const open = source.indexOf('{', from)
  if (open === -1)
    return ''
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{')
      depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0)
        return source.slice(open + 1, i)
    }
  }
  return source.slice(open + 1)
}

/**
 * Resolve an SDK dimension: literal in comment-stripped app/build.gradle first,
 * then android/variables.gradle, then the manifest <uses-sdk>. Returns null
 * (skip the dimension) when unresolved so SDK checks agree on one source of
 * truth.
 */
export function resolveSdk(projectDir: string, dim: SdkDimension): number | null {
  const key = SDK_DIMENSIONS[dim]
  const gradle = appBuildGradle(projectDir)
  if (gradle) {
    // matches `targetSdkVersion 33`, `targetSdkVersion = 33`, `targetSdk = 33`
    const base = key.replace(/Version$/, '')
    const re = new RegExp(`\\b(?:${key}|${base})\\s*[=\\s]\\s*(\\d+)\\b`)
    const m = stripGradleComments(gradle).match(re)
    if (m)
      return Number(m[1])
  }
  const fromVars = variablesGradle(projectDir)[key]
  if (typeof fromVars === 'number')
    return fromVars
  const manifest = readTextIfExists(join(projectDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'))
  if (manifest) {
    const m = manifest.match(new RegExp(`android:${key}\\s*=\\s*"(\\d+)"`))
    if (m)
      return Number(m[1])
  }
  return null
}
