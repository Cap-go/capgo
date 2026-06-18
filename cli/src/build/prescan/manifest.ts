// src/build/prescan/manifest.ts
//
// Shared manifest parse primitives for the Android manifest prescan checks.
//
// Decision (see spec section 1): regex + a tiny shared scanner, NOT a full XML
// parser. Capacitor's AndroidManifest.xml is small, single-file, hand-shaped
// from a known template, and object-mode parsers lose sibling order. One
// element scanner covers every manifest check while keeping each check ~20
// lines and avoiding a dozen redundant regex passes.
import { join } from 'node:path'
import { readTextIfExists } from './gradle'

// Re-export the iOS plist scheme grammar so the Android deep-link check
// validates URL schemes with the exact same RFC-3986 rule as the iOS check.
export { SCHEME_RE } from './checks/ios-plist'

export interface ManifestFile {
  raw: string
  path: string
}

export interface ScannedElement {
  tag: string
  attrs: Record<string, string>
  /** byte offset of the element's opening `<` in the source */
  start: number
  /** byte offset just past the element's closing `>` in the source */
  end: number
  /** the raw open tag text, e.g. `<activity android:name=".X">` */
  rawOpenTag: string
}

// A scan opens the same manifest in many checks (typo, missing-prefix,
// exported, duplicate-component, ...) - memoize the read per projectDir like
// the P12 cache in ios-certs.ts so a malformed/large manifest is read once.
const MANIFEST_CACHE_MAX = 8
const manifestCache = new Map<string, ManifestFile | null>()

/**
 * Read android/app/src/main/AndroidManifest.xml. Returns null when absent.
 * Memoized per projectDir (bounded cache) so repeat reads return the same
 * object.
 */
export function readAndroidManifest(projectDir: string): ManifestFile | null {
  if (manifestCache.has(projectDir))
    return manifestCache.get(projectDir) ?? null
  const path = join(projectDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')
  const raw = readTextIfExists(path)
  const result: ManifestFile | null = raw === null ? null : { raw, path }
  rememberManifest(projectDir, result)
  return result
}

function rememberManifest(key: string, value: ManifestFile | null): void {
  if (manifestCache.size >= MANIFEST_CACHE_MAX)
    manifestCache.delete(manifestCache.keys().next().value!)
  manifestCache.set(key, value)
}

/**
 * Remove `<!-- ... -->` comment blocks so typo/duplicate/exported scans don't
 * trip on commented-out elements. Replaces each comment with an equal-length
 * run of spaces so byte offsets stay stable for callers that slice the source.
 */
export function stripXmlComments(raw: string): string {
  return raw.replace(/<!--[\s\S]*?-->/g, match => ' '.repeat(match.length))
}

const TAG_RE = /<([a-z][\w:-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*\/?>/gi
const ATTR_RE = /([\w:.-]+)\s*=\s*"([^"]*)"/g

/**
 * The one parse primitive consumed by every manifest check. Matches each
 * element open tag (self-closing or not) and parses its `name="value"`
 * attributes into a map. Closing tags (`</application>`) never match.
 */
export function scanElements(raw: string): ScannedElement[] {
  const out: ScannedElement[] = []
  for (const m of raw.matchAll(TAG_RE)) {
    const rawOpenTag = m[0]
    const tag = m[1]
    const attrs: Record<string, string> = {}
    for (const a of (m[2] ?? '').matchAll(ATTR_RE))
      attrs[a[1]] = a[2]
    const start = m.index
    out.push({
      tag,
      attrs,
      start,
      end: start + rawOpenTag.length,
      rawOpenTag,
    })
  }
  return out
}

export interface NamespaceFlags {
  android: boolean
  tools: boolean
}

/** Detect the android + tools xmlns declarations anywhere in the source. */
export function hasNamespaceXmlns(raw: string): NamespaceFlags {
  return {
    android: /xmlns:android\s*=\s*"http:\/\/schemas\.android\.com\/apk\/res\/android"/.test(raw),
    tools: /xmlns:tools\s*=\s*"http:\/\/schemas\.android\.com\/tools"/.test(raw),
  }
}

export interface ApplicationBlock {
  openTag: string
  body: string
  start: number
  end: number
}

/**
 * Slice the `<application ...>` ... `</application>` block (the XML analogue of
 * extractBraceBlock). Returns null when there is no application element.
 */
export function applicationBlock(raw: string): ApplicationBlock | null {
  const openMatch = raw.match(/<application\b[^>]*>/)
  if (openMatch?.index === undefined)
    return null
  const openTag = openMatch[0]
  const start = openMatch.index
  const bodyStart = start + openTag.length
  const closeIdx = raw.indexOf('</application>', bodyStart)
  const bodyEnd = closeIdx === -1 ? raw.length : closeIdx
  const end = closeIdx === -1 ? raw.length : closeIdx + '</application>'.length
  return {
    openTag,
    body: raw.slice(bodyStart, bodyEnd),
    start,
    end,
  }
}

/**
 * The 32 Android Lint valid manifest tags. A tag NOT in this set (and not
 * namespaced/custom) within edit distance 1..3 of one of these is a typo.
 */
export const MANIFEST_VALID_TAGS: Set<string> = new Set([
  'manifest',
  'application',
  'activity',
  'activity-alias',
  'service',
  'provider',
  'receiver',
  'instrumentation',
  'intent',
  'meta-data',
  'action',
  'category',
  'data',
  'uses-permission',
  'uses-permission-sdk-23',
  'permission',
  'permission-tree',
  'permission-group',
  'uses-feature',
  'uses-library',
  'uses-native-library',
  'uses-sdk',
  'uses-configuration',
  'supports-screens',
  'compatible-screens',
  'supports-gl-texture',
  'grant-uri-permission',
  'path-permission',
  'queries',
  'package',
  'profileable',
  'property',
])

/**
 * Bounded Levenshtein distance capped at `max` (Android Lint uses 3). Returns a
 * value > max as soon as the distance is provably over the cap so distant
 * strings never pay the full O(a*b) compute. No npm string-distance package.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b)
    return 0
  if (Math.abs(a.length - b.length) > max)
    return max + 1
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr = new Array<number>(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    let rowMin = curr[0]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      if (curr[j] < rowMin)
        rowMin = curr[j]
    }
    if (rowMin > max)
      return max + 1
    for (let j = 0; j <= b.length; j++)
      prev[j] = curr[j]
  }
  return prev[b.length]
}
