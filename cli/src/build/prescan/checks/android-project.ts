// src/build/prescan/checks/android-project.ts
import type { Finding, PrescanCheck, ScanContext } from '../types'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { appBuildGradle, gradleProperties, readTextIfExists, settingsGradleModuleCount } from '../gradle'

function hasCordovaPlugins(ctx: ScanContext): boolean {
  const pkgRaw = readTextIfExists(join(ctx.projectDir, 'package.json'))
  if (!pkgRaw)
    return false
  try {
    const deps = Object.keys((JSON.parse(pkgRaw).dependencies ?? {}) as Record<string, string>)
    return deps.some(d => d.startsWith('cordova-plugin-') || d.startsWith('@awesome-cordova-plugins/'))
  }
  catch {
    return false
  }
}

export const cordovaVarsPresent: PrescanCheck = {
  id: 'android/cordova-vars-present',
  platforms: ['android'],
  appliesTo: hasCordovaPlugins,
  async run(ctx): Promise<Finding[]> {
    const path = join(ctx.projectDir, 'android', 'capacitor-cordova-android-plugins', 'cordova.variables.gradle')
    if (existsSync(path))
      return []
    return [{
      id: 'android/cordova-vars-present',
      severity: 'error',
      title: 'cordova.variables.gradle is missing — the cloud build cannot compile your Cordova plugins',
      detail: 'This generated file is gitignored; `cap copy` does not create it, only `cap sync` does',
      fix: 'Run `npx cap sync android` before requesting the build',
    }]
  },
}

const MANY_MODULES = 30
const MIN_HEAP_MB_FOR_LARGE = 2048

function xmxMb(jvmargs: string | undefined): number | null {
  const m = jvmargs?.match(/-Xmx(\d+)([mMgG])/)
  if (!m)
    return null
  const n = Number.parseInt(m[1], 10)
  return /g/i.test(m[2]) ? n * 1024 : n
}

export const gradlePropsHeuristics: PrescanCheck = {
  id: 'android/gradle-props-heuristics',
  platforms: ['android'],
  async run(ctx): Promise<Finding[]> {
    const modules = settingsGradleModuleCount(ctx.projectDir)
    const props = gradleProperties(ctx.projectDir)
    const findings: Finding[] = []
    const parallel = props['org.gradle.parallel'] === 'true'

    if (modules > MANY_MODULES && !parallel) {
      findings.push({
        id: 'android/gradle-props-heuristics',
        severity: 'warning',
        title: `${modules} Gradle modules build serially — org.gradle.parallel is not enabled`,
        fix: 'Add `org.gradle.parallel=true` (and `org.gradle.caching=true`) to android/gradle.properties',
      })
    }
    if (parallel && props['org.gradle.workers.max'] === '1') {
      findings.push({
        id: 'android/gradle-props-heuristics',
        severity: 'warning',
        title: 'org.gradle.workers.max=1 makes org.gradle.parallel=true a no-op',
        fix: 'Remove the workers.max cap (or raise it) so parallel project execution can work',
      })
    }
    const heap = xmxMb(props['org.gradle.jvmargs'])
    if (modules > MANY_MODULES && heap !== null && heap < MIN_HEAP_MB_FOR_LARGE) {
      findings.push({
        id: 'android/gradle-props-heuristics',
        severity: 'warning',
        title: `Gradle heap -Xmx${heap}m is small for ${modules} modules — D8/R8 may stall or OOM`,
        fix: 'Raise org.gradle.jvmargs, e.g. `-Xmx4096m -XX:MaxMetaspaceSize=1024m`',
      })
    }
    return findings
  },
}

export const playSaJson: PrescanCheck = {
  id: 'android/play-sa-json',
  platforms: ['android'],
  appliesTo: ctx => Boolean(ctx.credentials?.PLAY_CONFIG_JSON),
  async run(ctx): Promise<Finding[]> {
    let parsed: unknown
    try {
      parsed = JSON.parse(Buffer.from(ctx.credentials!.PLAY_CONFIG_JSON, 'base64').toString('utf8'))
    }
    catch {
      parsed = undefined
    }
    // JSON.parse accepts scalars ('null', '42', '"x"') and arrays — none of which
    // are a service-account object, so guard before any property access.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return [{
        id: 'android/play-sa-json',
        severity: 'error',
        title: 'PLAY_CONFIG_JSON does not decode to valid JSON',
        fix: 'Base64-encode the raw service-account .json file',
      }]
    }
    const sa = parsed as Record<string, unknown>
    if (sa.type !== 'service_account') {
      return [{
        id: 'android/play-sa-json',
        severity: 'error',
        title: 'PLAY_CONFIG_JSON is not a service-account key',
        detail: `type: ${String(sa.type)}`,
        fix: 'Create a service-account key in Google Cloud Console (IAM → Service Accounts → Keys)',
      }]
    }
    const missing = ['private_key', 'client_email'].filter(k => !sa[k])
    if (missing.length > 0) {
      return [{
        id: 'android/play-sa-json',
        severity: 'error',
        title: 'Service-account JSON is incomplete',
        detail: `missing: ${missing.join(', ')}`,
        fix: 'Re-download the key file — it must contain private_key and client_email',
      }]
    }
    return []
  },
}

/**
 * Brace-counted extraction of the body of the first `keyword { ... }` block.
 * A greedy regex would capture to the LAST `}` in the file, swallowing
 * buildTypes/dependencies/etc. into the flavor list.
 */
export function extractBraceBlock(source: string, keyword: string): string | null {
  const headerMatch = source.match(new RegExp(`(?:^|[\\s;{}])${keyword}\\s*\\{`))
  if (headerMatch?.index === undefined)
    return null
  const open = source.indexOf('{', headerMatch.index + headerMatch[0].length - 1)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') {
      depth++
    }
    else if (source[i] === '}') {
      depth--
      if (depth === 0)
        return source.slice(open + 1, i)
    }
  }
  return null
}

/**
 * Names of the direct (depth-1) child blocks of a Gradle DSL block body.
 * Handles Groovy `demo { ... }` and Kotlin DSL `create("demo") { ... }`,
 * `register("demo") { ... }`, and `val demo by creating { ... }`.
 */
export function childBlockNames(block: string): string[] {
  const names: string[] = []
  let depth = 0
  let segmentStart = 0
  for (let i = 0; i < block.length; i++) {
    const ch = block[i]
    if (ch === '{') {
      if (depth === 0) {
        const header = block.slice(segmentStart, i)
        const kts = header.match(/(?:create|register)\s*\(\s*["'](\w+)["']\s*\)\s*$/)
        const creating = header.match(/val\s+(\w+)\s+by\s+creating\s*$/)
        const groovy = header.match(/(?:^|[\s;}])(\w+)\s*$/)
        const name = kts?.[1] ?? creating?.[1] ?? groovy?.[1]
        if (name)
          names.push(name)
      }
      depth++
    }
    else if (ch === '}') {
      depth = Math.max(0, depth - 1)
      if (depth === 0)
        segmentStart = i + 1
    }
    else if (depth === 0 && (ch === '\n' || ch === ';')) {
      segmentStart = i + 1
    }
  }
  return names
}

export const flavorExists: PrescanCheck = {
  id: 'android/flavor-exists',
  platforms: ['android'],
  appliesTo: ctx => Boolean(ctx.androidFlavor),
  async run(ctx): Promise<Finding[]> {
    const gradle = appBuildGradle(ctx.projectDir)
    if (!gradle)
      return []
    const block = extractBraceBlock(gradle, 'productFlavors')
    if (block === null) {
      return [{
        id: 'android/flavor-exists',
        severity: 'error',
        title: `--android-flavor "${ctx.androidFlavor}" passed but build.gradle declares no productFlavors`,
        fix: 'Drop the flag or add the flavor to android/app/build.gradle',
      }]
    }
    const flavors = childBlockNames(block).filter(f => f !== 'dimension')
    // a productFlavors block exists but our parser got nothing out of it
    // (exotic DSL): skip rather than emit a false blocking error
    if (flavors.length === 0)
      return []
    if (!flavors.includes(ctx.androidFlavor!)) {
      return [{
        id: 'android/flavor-exists',
        severity: 'error',
        title: `Product flavor "${ctx.androidFlavor}" not found in build.gradle`,
        detail: `declared flavors: ${flavors.join(', ')}`,
        fix: 'Use one of the declared flavors or add the missing one',
      }]
    }
    return []
  },
}

export const agp8PackageAttr: PrescanCheck = {
  id: 'android/agp8-package-attr',
  platforms: ['android'],
  async run(ctx): Promise<Finding[]> {
    const manifest = readTextIfExists(join(ctx.projectDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'))
    const gradle = appBuildGradle(ctx.projectDir)
    if (!manifest || !gradle)
      return []
    const hasPackageAttr = /<manifest[^>]*\spackage\s*=\s*"/.test(manifest)
    const hasNamespace = /namespace\s*[=( ]\s*["']/.test(gradle)
    if (hasPackageAttr && hasNamespace) {
      return [{
        id: 'android/agp8-package-attr',
        severity: 'error',
        title: 'AndroidManifest.xml still has a package= attribute — AGP 8+ fails the build',
        detail: 'build.gradle declares `namespace`, so the manifest attribute is forbidden',
        fix: 'Delete the package="…" attribute from android/app/src/main/AndroidManifest.xml',
      }]
    }
    return []
  },
}
