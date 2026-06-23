// src/build/prescan/checks/android-manifest.ts
//
// Group A — Android manifest prescan checks (spec section 2). Every check
// shares the parse primitives in ../manifest (readAndroidManifest,
// stripXmlComments, scanElements, ...) so each detection stays ~20 lines and
// the manifest is scanned once per projectDir.
import type { Finding, PrescanCheck, ScanContext } from '../types'
import type { ScannedElement } from '../manifest'
import { gradleApplicationId, resolveSdk } from '../gradle'
import {
  editDistance,
  hasNamespaceXmlns,
  MANIFEST_VALID_TAGS,
  readAndroidManifest,
  scanElements,
  SCHEME_RE,
  stripXmlComments,
} from '../manifest'

/** appliesTo guard reused by the manifest-present checks. */
function manifestPresent(ctx: ScanContext): boolean {
  return readAndroidManifest(ctx.projectDir) !== null
}

/** Comment-stripped raw manifest, or null when the file is absent. */
function strippedManifest(ctx: ScanContext): string | null {
  const m = readAndroidManifest(ctx.projectDir)
  return m === null ? null : stripXmlComments(m.raw)
}

/** Component element types that carry a class via android:name. */
const COMPONENT_TYPES: ReadonlySet<string> = new Set([
  'activity',
  'activity-alias',
  'service',
  'receiver',
  'provider',
])

/**
 * Slice the body of an element from the end of its open tag to its matching
 * `</tag>`. Self-closing open tags (`/>`) have an empty body. A missing close
 * tag falls back to end-of-source so callers degrade rather than crash.
 */
function elementBody(raw: string, el: ScannedElement): string {
  if (el.rawOpenTag.trimEnd().endsWith('/>'))
    return ''
  const close = raw.indexOf(`</${el.tag}>`, el.end)
  return raw.slice(el.end, close === -1 ? raw.length : close)
}

export const manifestWellFormed: PrescanCheck = {
  id: 'android/manifest-well-formed',
  platforms: ['android'],
  appliesTo: manifestPresent,
  async run(ctx): Promise<Finding[]> {
    const raw = strippedManifest(ctx)
    if (raw === null)
      return []
    const error = (title: string): Finding[] => [{
      id: 'android/manifest-well-formed',
      severity: 'error',
      title,
      fix: 'Manifest must have exactly one <application> nested in <manifest>; remove the duplicate/extra block or close the unclosed tag.',
    }]
    if ((raw.match(/<manifest\b/g) ?? []).length > 1)
      return error('AndroidManifest.xml declares more than one <manifest> root element')
    if (!/<\/manifest>/.test(raw))
      return error('AndroidManifest.xml is missing its closing </manifest> tag')
    // Count non-self-closed <application opens vs </application> closes.
    const opens = scanElements(raw).filter(el => el.tag === 'application' && !el.rawOpenTag.trimEnd().endsWith('/>')).length
    const closes = (raw.match(/<\/application>/g) ?? []).length
    const selfClosed = scanElements(raw).filter(el => el.tag === 'application' && el.rawOpenTag.trimEnd().endsWith('/>')).length
    const applications = opens + selfClosed
    if (applications !== 1)
      return error(`AndroidManifest.xml must have exactly one <application> element (found ${applications})`)
    if (opens !== closes)
      return error('AndroidManifest.xml has an unclosed <application> element')
    return []
  },
}

export const manifestTagTypo: PrescanCheck = {
  id: 'android/manifest-tag-typo',
  platforms: ['android'],
  appliesTo: manifestPresent,
  async run(ctx): Promise<Finding[]> {
    const raw = strippedManifest(ctx)
    if (raw === null)
      return []
    const findings: Finding[] = []
    const seen = new Set<string>()
    for (const el of scanElements(raw)) {
      const tag = el.tag
      // Skip valid tags, namespaced/custom tags, and tags we already reported.
      if (MANIFEST_VALID_TAGS.has(tag) || tag.includes(':') || seen.has(tag))
        continue
      // Only flag a true single-char typo (distance == 1). Distance 2..3 fuzzy
      // matches (e.g. profile->provider, paths->data) are too weak to justify a
      // BLOCKING error against a hardcoded allowlist, so we never guess at them.
      let best: string | null = null
      for (const valid of MANIFEST_VALID_TAGS) {
        if (editDistance(tag, valid, 1) === 1) {
          best = valid
          break
        }
      }
      if (best === null)
        continue
      seen.add(tag)
      findings.push({
        id: 'android/manifest-tag-typo',
        severity: 'error',
        title: `Unknown manifest tag <${tag}> — did you mean <${best}>?`,
        fix: 'Rename the misspelled tag to the suggested valid manifest element.',
      })
    }
    return findings
  },
}

const ANDROID_XMLNS_URI = 'http://schemas.android.com/apk/res/android'

export const manifestNamespaceUri: PrescanCheck = {
  id: 'android/manifest-namespace-uri',
  platforms: ['android'],
  appliesTo: manifestPresent,
  async run(ctx): Promise<Finding[]> {
    const raw = strippedManifest(ctx)
    if (raw === null)
      return []
    const ns = hasNamespaceXmlns(raw)
    const usesAndroidAttr = /\bandroid:[\w.-]+\s*=/.test(raw)
    const usesToolsAttr = /\btools:[\w.-]+\s*=/.test(raw)
    // A near-miss xmlns:android URI: an xmlns:android decl is present but it is
    // not the exact canonical URI.
    const xmlnsDecl = raw.match(/xmlns:android\s*=\s*"([^"]*)"/)
    const findings: Finding[] = []
    if (xmlnsDecl && xmlnsDecl[1] !== ANDROID_XMLNS_URI) {
      findings.push({
        id: 'android/manifest-namespace-uri',
        severity: 'error',
        title: 'xmlns:android declares the wrong namespace URI',
        detail: `expected "${ANDROID_XMLNS_URI}"`,
        fix: 'Declare the exact xmlns:android (and xmlns:tools when tools: attrs used) URI on <manifest>.',
      })
    }
    else if (usesAndroidAttr && !ns.android) {
      findings.push({
        id: 'android/manifest-namespace-uri',
        severity: 'error',
        title: 'android:-prefixed attributes are used but xmlns:android is not declared',
        fix: 'Declare the exact xmlns:android (and xmlns:tools when tools: attrs used) URI on <manifest>.',
      })
    }
    if (usesToolsAttr && !ns.tools) {
      findings.push({
        id: 'android/manifest-namespace-uri',
        severity: 'error',
        title: 'tools:-prefixed attributes are used but xmlns:tools is not declared',
        fix: 'Declare xmlns:tools="http://schemas.android.com/tools" on <manifest>.',
      })
    }
    return findings
  },
}

// Attributes that are ALWAYS android-namespaced on the elements they appear on.
// A bare (unprefixed) occurrence of one of these is a missing-prefix error.
const ALWAYS_ANDROID_ATTRS: ReadonlySet<string> = new Set([
  'name',
  'exported',
  'label',
  'icon',
  'theme',
  'permission',
  'authorities',
  'debuggable',
  'allowBackup',
  'targetSdkVersion',
  'minSdkVersion',
  'value',
])

export const manifestMissingPrefix: PrescanCheck = {
  id: 'android/manifest-missing-prefix',
  platforms: ['android'],
  appliesTo: manifestPresent,
  async run(ctx): Promise<Finding[]> {
    const raw = strippedManifest(ctx)
    if (raw === null)
      return []
    const bare = new Set<string>()
    for (const el of scanElements(raw)) {
      // The root <manifest> legitimately carries bare attrs (xmlns, package).
      if (el.tag === 'manifest' || el.tag === 'queries')
        continue
      for (const attr of Object.keys(el.attrs)) {
        // Already prefixed (android:, tools:, app:, ...) => not a bare attr.
        if (attr.includes(':'))
          continue
        if (ALWAYS_ANDROID_ATTRS.has(attr))
          bare.add(attr)
      }
    }
    if (bare.size === 0)
      return []
    return [{
      id: 'android/manifest-missing-prefix',
      severity: 'error',
      title: 'Manifest attribute is missing the android: namespace prefix',
      detail: `bare attribute(s): ${[...bare].sort().join(', ')}`,
      fix: 'Prefix with android: (e.g. android:name, android:exported).',
    }]
  },
}

const INTENT_COMPONENTS: ReadonlySet<string> = new Set(['activity', 'activity-alias', 'service', 'receiver'])

/**
 * An android:exported value the prescan cannot statically resolve to a boolean:
 * a present value that is neither the literal "true" nor "false" (e.g. a
 * `${manifestPlaceholder}` substitution that Gradle resolves at merge time).
 * Absent (undefined) is NOT unresolved — that is a genuine missing-exported case.
 */
function isUnresolvedExported(value: string | undefined): boolean {
  return value !== undefined && value !== 'true' && value !== 'false'
}

export const manifestExportedMissing: PrescanCheck = {
  id: 'android/manifest-exported-missing',
  platforms: ['android'],
  // Android 12 (API 31) made android:exported mandatory for intent-filter
  // components. Treat unknown target as >= 31 for modern Capacitor.
  appliesTo: (ctx) => {
    if (readAndroidManifest(ctx.projectDir) === null)
      return false
    const target = resolveSdk(ctx.projectDir, 'targetSdk')
    return target === null || target >= 31
  },
  async run(ctx): Promise<Finding[]> {
    const raw = strippedManifest(ctx)
    if (raw === null)
      return []
    const elements = scanElements(raw)
    const findings: Finding[] = []
    for (const el of elements) {
      if (!INTENT_COMPONENTS.has(el.tag))
        continue
      const body = elementBody(raw, el)
      const hasIntentFilter = /<intent-filter\b/.test(body)
      const hasExported = el.attrs['android:exported'] !== undefined
      const exportedValue = el.attrs['android:exported']
      const isLauncher = /android\.intent\.category\.LAUNCHER/.test(body) && /android\.intent\.action\.MAIN/.test(body)
      // A manifestPlaceholders substitution (e.g. android:exported="${isExported}")
      // is a valid AGP pattern that resolves at merge time; the prescan sees the
      // unresolved `${...}` token, so treat any non-true/false value as unresolved
      // and do not block the launcher on it.
      const launcherNeedsExported = isLauncher
        && exportedValue !== 'true'
        && !isUnresolvedExported(exportedValue)
      if (launcherNeedsExported) {
        findings.push({
          id: 'android/manifest-exported-missing',
          severity: 'error',
          title: 'The MAIN/LAUNCHER activity must declare android:exported="true"',
          detail: `<${el.tag} android:name="${el.attrs['android:name'] ?? ''}">`,
          fix: 'Add android:exported="true" to launcher/deep-link components and ="false" to internal components that have intent-filters.',
        })
        continue
      }
      if (hasIntentFilter && !hasExported) {
        findings.push({
          id: 'android/manifest-exported-missing',
          severity: 'error',
          title: `<${el.tag}> has an intent-filter but no android:exported (required on Android 12+)`,
          detail: `<${el.tag} android:name="${el.attrs['android:name'] ?? ''}">`,
          fix: 'Add android:exported="true" to launcher/deep-link components and ="false" to internal components that have intent-filters.',
        })
      }
    }
    return findings
  },
}

export const manifestMultipleUsesSdk: PrescanCheck = {
  id: 'android/manifest-multiple-uses-sdk',
  platforms: ['android'],
  appliesTo: manifestPresent,
  async run(ctx): Promise<Finding[]> {
    const raw = strippedManifest(ctx)
    if (raw === null)
      return []
    const count = (raw.match(/<uses-sdk\b/g) ?? []).length
    if (count <= 1)
      return []
    return [{
      id: 'android/manifest-multiple-uses-sdk',
      severity: 'error',
      title: `AndroidManifest.xml declares ${count} <uses-sdk> elements`,
      fix: 'Keep at most one <uses-sdk>; prefer setting SDKs in android/variables.gradle.',
    }]
  },
}

/**
 * Resolve the package prefix used to normalize relative component names:
 * gradle applicationId first, then the manifest package= attribute. Returns
 * null when neither is available (the check then skips, never guesses).
 */
function resolvePackage(ctx: ScanContext, raw: string): string | null {
  const fromGradle = gradleApplicationId(ctx.projectDir)
  if (fromGradle)
    return fromGradle
  const pkg = raw.match(/<manifest\b[^>]*\spackage\s*=\s*"([\w.]+)"/)
  return pkg?.[1] ?? null
}

/** Expand a relative (`.X` / bare `X`) component name against the package. */
function normalizeComponentName(name: string, pkg: string): string {
  if (name.startsWith('.'))
    return pkg + name
  if (!name.includes('.'))
    return `${pkg}.${name}`
  return name
}

export const manifestDuplicateComponent: PrescanCheck = {
  id: 'android/manifest-duplicate-component',
  platforms: ['android'],
  appliesTo: manifestPresent,
  async run(ctx): Promise<Finding[]> {
    const raw = strippedManifest(ctx)
    if (raw === null)
      return []
    const pkg = resolvePackage(ctx, raw)
    // activity-alias shares the activity namespace.
    const namespaceFor = (tag: string): string => (tag === 'activity-alias' ? 'activity' : tag)
    const byType = new Map<string, Map<string, number>>()
    for (const el of scanElements(raw)) {
      if (!COMPONENT_TYPES.has(el.tag))
        continue
      const rawName = el.attrs['android:name']
      if (!rawName)
        continue
      const isRelative = rawName.startsWith('.') || !rawName.includes('.')
      // Without a resolvable package we cannot compare a relative name against
      // an absolute one — skip relative names rather than guess.
      if (isRelative && pkg === null)
        continue
      const name = pkg === null ? rawName : normalizeComponentName(rawName, pkg)
      const ns = namespaceFor(el.tag)
      const counts = byType.get(ns) ?? new Map<string, number>()
      counts.set(name, (counts.get(name) ?? 0) + 1)
      byType.set(ns, counts)
    }
    const findings: Finding[] = []
    for (const [, counts] of byType) {
      for (const [name, n] of counts) {
        if (n >= 2) {
          findings.push({
            id: 'android/manifest-duplicate-component',
            severity: 'error',
            title: `Component android:name="${name}" is declared ${n} times`,
            fix: 'Remove the duplicate declaration; each component android:name must be unique.',
          })
        }
      }
    }
    return findings
  },
}

export const manifestUniquePermission: PrescanCheck = {
  id: 'android/manifest-unique-permission',
  platforms: ['android'],
  appliesTo: manifestPresent,
  async run(ctx): Promise<Finding[]> {
    const raw = strippedManifest(ctx)
    if (raw === null)
      return []
    const counts = new Map<string, number>()
    for (const el of scanElements(raw)) {
      if (el.tag !== 'permission' && el.tag !== 'permission-group')
        continue
      const name = el.attrs['android:name']
      if (name)
        counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    const findings: Finding[] = []
    for (const [name, n] of counts) {
      if (n > 1) {
        findings.push({
          id: 'android/manifest-unique-permission',
          severity: 'error',
          title: `Custom permission "${name}" is declared ${n} times`,
          fix: 'Declare each custom <permission> name exactly once.',
        })
      }
    }
    return findings
  },
}

export const manifestHardcodedDebuggable: PrescanCheck = {
  id: 'android/manifest-hardcoded-debuggable',
  platforms: ['android'],
  appliesTo: manifestPresent,
  async run(ctx): Promise<Finding[]> {
    const raw = strippedManifest(ctx)
    if (raw === null)
      return []
    const app = scanElements(raw).find(el => el.tag === 'application')
    const value = app?.attrs['android:debuggable']
    if (value === undefined)
      return []
    if (value === 'true') {
      return [{
        id: 'android/manifest-hardcoded-debuggable',
        severity: 'error',
        title: 'android:debuggable="true" in the manifest — Play rejects debuggable release uploads',
        fix: 'Remove android:debuggable from the manifest; the release build type sets it automatically.',
      }]
    }
    return [{
      id: 'android/manifest-hardcoded-debuggable',
      severity: 'warning',
      title: 'android:debuggable="false" in the manifest is redundant — Gradle owns this',
      fix: 'Remove android:debuggable from the manifest; the release build type sets it automatically.',
    }]
  },
}

export const manifestMockLocation: PrescanCheck = {
  id: 'android/manifest-mock-location',
  platforms: ['android'],
  appliesTo: manifestPresent,
  async run(ctx): Promise<Finding[]> {
    const raw = strippedManifest(ctx)
    if (raw === null)
      return []
    const hasMock = scanElements(raw).some(el => el.tag === 'uses-permission'
      && el.attrs['android:name'] === 'android.permission.ACCESS_MOCK_LOCATION')
    if (!hasMock)
      return []
    return [{
      id: 'android/manifest-mock-location',
      severity: 'error',
      title: 'ACCESS_MOCK_LOCATION is a test-only permission and must not ship',
      fix: 'Remove the test-only ACCESS_MOCK_LOCATION permission.',
    }]
  },
}

export const manifestExportedUnprotected: PrescanCheck = {
  id: 'android/manifest-exported-unprotected',
  platforms: ['android'],
  appliesTo: manifestPresent,
  async run(ctx): Promise<Finding[]> {
    const raw = strippedManifest(ctx)
    if (raw === null)
      return []
    // Pre-31 targets export intent-filter components implicitly; >=31 requires
    // an explicit android:exported="true" to be exported.
    const target = resolveSdk(ctx.projectDir, 'targetSdk')
    const preThirtyOne = target !== null && target < 31
    const findings: Finding[] = []
    for (const el of scanElements(raw)) {
      // Exclude activities — exported activities are normal.
      if (el.tag !== 'service' && el.tag !== 'receiver' && el.tag !== 'provider')
        continue
      const exported = el.attrs['android:exported']
      const body = elementBody(raw, el)
      const hasIntentFilter = /<intent-filter\b/.test(body)
      const isExported = exported === 'true' || (exported === undefined && preThirtyOne && hasIntentFilter)
      if (!isExported)
        continue
      if (el.attrs['android:permission'] === undefined) {
        findings.push({
          id: 'android/manifest-exported-unprotected',
          severity: 'warning',
          title: `Exported <${el.tag}> "${el.attrs['android:name'] ?? ''}" has no android:permission`,
          fix: 'Add android:permission to the exported component, or set android:exported="false"; narrow over-broad grant-uri paths.',
        })
      }
      // Over-broad grant-uri-permission on an exported provider.
      if (el.tag === 'provider' && el.attrs['android:grantUriPermissions'] === 'true') {
        const overBroad = scanElements(body).some(child => child.tag === 'grant-uri-permission'
          && (child.attrs['android:path'] === '/' || child.attrs['android:pathPattern'] === '.*'))
        if (overBroad) {
          findings.push({
            id: 'android/manifest-exported-unprotected',
            severity: 'warning',
            title: `Exported <provider> "${el.attrs['android:name'] ?? ''}" grants URI permission over an over-broad path`,
            fix: 'Add android:permission to the exported component, or set android:exported="false"; narrow over-broad grant-uri paths.',
          })
        }
      }
    }
    return findings
  },
}

export const manifestQueryAllPackages: PrescanCheck = {
  id: 'android/manifest-query-all-packages',
  platforms: ['android'],
  appliesTo: manifestPresent,
  async run(ctx): Promise<Finding[]> {
    const raw = strippedManifest(ctx)
    if (raw === null)
      return []
    const hasQap = scanElements(raw).some(el => el.tag === 'uses-permission'
      && el.attrs['android:name'] === 'android.permission.QUERY_ALL_PACKAGES')
    if (!hasQap)
      return []
    return [{
      id: 'android/manifest-query-all-packages',
      severity: 'warning',
      title: 'QUERY_ALL_PACKAGES requires Play package-visibility justification',
      fix: 'Use a scoped <queries> element, or justify via Play\'s permission-declaration form.',
      docsUrl: 'https://support.google.com/googleplay/android-developer/answer/10158779',
    }]
  },
}

export const manifestDeeplinkValid: PrescanCheck = {
  id: 'android/manifest-deeplink-valid',
  platforms: ['android'],
  appliesTo: (ctx) => {
    const m = readAndroidManifest(ctx.projectDir)
    if (m === null)
      return false
    return hasViewBrowsableFilter(stripXmlComments(m.raw))
  },
  async run(ctx): Promise<Finding[]> {
    const raw = strippedManifest(ctx)
    if (raw === null)
      return []
    const findings: Finding[] = []
    for (const filter of viewBrowsableFilters(raw)) {
      const autoVerify = /android:autoVerify\s*=\s*"true"/.test(filter.openTag)
      // Android App Links are canonically split across sibling <data> tags
      // (`<data android:scheme="https"/>` + `<data android:host="example.com"/>`),
      // so aggregate scheme/host across ALL <data> children before judging the
      // filter rather than requiring both on one element.
      const schemes: string[] = []
      let hasHost = false
      let hasHttpScheme = false
      for (const data of scanElements(filter.body)) {
        if (data.tag !== 'data')
          continue
        if (data.attrs['android:host'] !== undefined)
          hasHost = true
        const scheme = data.attrs['android:scheme']
        if (scheme === undefined)
          continue
        schemes.push(scheme)
        if (scheme === 'http' || scheme === 'https')
          hasHttpScheme = true
      }
      // Validate each scheme individually.
      for (const scheme of schemes) {
        const isHttp = scheme === 'http' || scheme === 'https'
        if (autoVerify && !isHttp)
          findings.push(deeplinkWarning(`autoVerify deep link uses a non-http(s) scheme "${scheme}"`))
        else if (!isHttp && !SCHEME_RE.test(scheme))
          findings.push(deeplinkWarning(`deep-link android:scheme "${scheme}" is not a valid RFC-3986 scheme`))
      }
      // An autoVerify http(s) filter needs at least one host somewhere in it.
      if (autoVerify && hasHttpScheme && !hasHost)
        findings.push(deeplinkWarning('autoVerify http(s) deep link has no android:host'))
    }
    return findings
  },
}

function deeplinkWarning(title: string): Finding {
  return {
    id: 'android/manifest-deeplink-valid',
    severity: 'warning',
    title,
    fix: 'Give deep-link <data> a valid lowercase RFC-3986 scheme + host; only use autoVerify on http/https filters with a host.',
  }
}

interface IntentFilterSlice {
  openTag: string
  body: string
}

/** All <intent-filter> blocks that contain VIEW action + BROWSABLE category. */
function viewBrowsableFilters(raw: string): IntentFilterSlice[] {
  const out: IntentFilterSlice[] = []
  const re = /<intent-filter\b[^>]*>/g
  for (const m of raw.matchAll(re)) {
    const start = m.index
    const bodyStart = start + m[0].length
    const close = raw.indexOf('</intent-filter>', bodyStart)
    const body = raw.slice(bodyStart, close === -1 ? raw.length : close)
    if (/android\.intent\.action\.VIEW/.test(body) && /android\.intent\.category\.BROWSABLE/.test(body))
      out.push({ openTag: m[0], body })
  }
  return out
}

function hasViewBrowsableFilter(raw: string): boolean {
  return viewBrowsableFilters(raw).length > 0
}
