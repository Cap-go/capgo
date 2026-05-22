// src/build/onboarding/bundle-id-detector.ts
//
// Detect the iOS bundle ID for Apple-side operations (cert/profile lookup,
// provisioning_map keys). Falls back to capacitor.config.appId only when the
// pbxproj / Info.plist sources can't be read.
//
// We split this off from the existing pbxproj-parser.ts because that module
// returns ALL signable targets (multi-target apps with extensions) and the
// onboarding flow only cares about the main app's bundle ID for the
// confirm-app-id step. Routing through one mainline-target helper keeps the
// UI simple ("Use X from pbxproj / Use Y from capacitor.config / type your
// own") and the detection deterministic.
//
// All sources are read as plain text. project.pbxproj is a NeXT-step plist
// (mostly regex-friendly) and Info.plist is XML — we use simple regexes
// rather than pulling in a plist parser, matching the conservative approach
// already taken in src/app/updateProbe.ts.

import { readFileSync } from 'node:fs'

import { findXcodeProject } from '../pbxproj-parser.js'

export type BundleIdSource = 'pbxproj-release' | 'pbxproj-fallback' | 'plist' | 'capacitor-config'

export interface BundleIdCandidate {
  value: string
  source: BundleIdSource
  /** Short human-readable label for the picker, e.g. "project.pbxproj (Release)". */
  label: string
}

export interface DetectedBundleIds {
  /** PRODUCT_BUNDLE_IDENTIFIER from project.pbxproj, preferring Release config. */
  pbxproj: BundleIdCandidate | null
  /**
   * Info.plist CFBundleIdentifier when it's a literal value (not the common
   * `$(PRODUCT_BUNDLE_IDENTIFIER)` placeholder, which we drop because it
   * adds nothing the pbxproj source doesn't already cover).
   */
  plist: BundleIdCandidate | null
  /** capacitor.config.ts/json's appId — always present (it's a required arg). */
  capacitor: BundleIdCandidate
  /**
   * The best-guess Apple-side bundle ID, picked in priority order:
   * pbxproj-release > pbxproj-fallback > plist > capacitor. Returned for
   * convenience so callers don't have to re-implement the precedence.
   */
  recommended: BundleIdCandidate
  /**
   * True when the recommended value differs from capacitor.config.appId.
   * Used by the confirm-app-id step to decide whether to surface a question
   * at all — when they match, nothing's worth asking about.
   */
  mismatch: boolean
  /**
   * Deduplicated, ordered list of candidates ready to render as Select
   * options. Empty list is impossible (capacitor is always included).
   */
  candidates: BundleIdCandidate[]
}

/**
 * Parse `PRODUCT_BUNDLE_IDENTIFIER = "..."` lines from pbxproj content.
 * Returns the Release-config value if present, else the first non-Release
 * value. Returns null when no bundle id can be extracted.
 *
 * Looks like a re-implementation of pbxproj-parser.ts's resolveBundleId, but
 * that one needs an XCConfigurationList id (it walks from a target). This
 * one needs to work standalone given only the file contents — so it
 * collects all PRODUCT_BUNDLE_IDENTIFIER values, groups by adjacent
 * `name = Release`/`name = Debug` markers, and prefers Release. Less
 * accurate for multi-target projects but good enough for the "what should
 * we pre-fill" use case here.
 */
export function parsePbxprojBundleId(pbxprojContent: string): BundleIdCandidate | null {
  if (!pbxprojContent)
    return null

  // Look for XCBuildConfiguration blocks (one level of nested braces tolerated
  // for `buildSettings = { ... }`). Each block has a `name = Release;` and
  // a `PRODUCT_BUNDLE_IDENTIFIER = "...";` somewhere inside.
  //
  // Capacitor app extensions (e.g. NotificationServiceExtension) have their
  // own PRODUCT_BUNDLE_IDENTIFIER in the same pbxproj — typically a child
  // of the main bundle id (com.example.app.notif). We prefer the main app
  // target by looking for a configuration block whose containing pbxproj
  // section has a target name containing "App" (the Capacitor default).
  // Since we don't have target context here, we settle for the heuristic
  // "shortest bundle id" — the parent is always a prefix of any child.

  const buildConfigRegex = /\w+\s*\/\*[^*]*\*\/\s*=\s*\{[^{}]*(?:\{[^}]*\}[^{}]*)*\}/g
  const candidates: { value: string, configName: string }[] = []

  for (const match of pbxprojContent.matchAll(buildConfigRegex)) {
    const block = match[0]
    if (!block.includes('XCBuildConfiguration'))
      continue
    const nameMatch = block.match(/name\s*=\s*("[^"]*"|[^;\s]+)\s*;/)
    const bundleIdMatch = block.match(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*"?([^";\s]+)"?\s*;/)
    if (!nameMatch || !bundleIdMatch)
      continue
    const configName = nameMatch[1].replace(/^"|"$/g, '')
    const value = bundleIdMatch[1]
    // Skip pbxproj variable references like $(PRODUCT_BUNDLE_IDENTIFIER:rfc1034identifier)
    if (value.includes('$('))
      continue
    candidates.push({ value, configName })
  }

  if (candidates.length === 0)
    return null

  // Heuristic: prefer the shortest bundle id at the Release level (the main
  // app, not an extension). Falls back to the shortest at any level.
  const release = candidates
    .filter(c => c.configName === 'Release')
    .sort((a, b) => a.value.length - b.value.length)[0]
  if (release) {
    return {
      value: release.value,
      source: 'pbxproj-release',
      label: 'project.pbxproj (Release config)',
    }
  }

  const fallback = candidates.sort((a, b) => a.value.length - b.value.length)[0]
  return {
    value: fallback.value,
    source: 'pbxproj-fallback',
    label: `project.pbxproj (${fallback.configName} config)`,
  }
}

/**
 * Parse Info.plist's CFBundleIdentifier from raw XML.
 * Returns null when the file is empty, when CFBundleIdentifier is absent,
 * or when it's a `$(PRODUCT_BUNDLE_IDENTIFIER)` variable reference (we drop
 * the placeholder so the picker doesn't list a non-actionable option).
 */
export function parseInfoPlistBundleId(plistContent: string): BundleIdCandidate | null {
  if (!plistContent)
    return null
  const match = plistContent.match(/<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/)
  if (!match)
    return null
  const value = match[1].trim()
  if (!value || value.includes('$('))
    return null
  return {
    value,
    source: 'plist',
    label: 'Info.plist (CFBundleIdentifier)',
  }
}

/**
 * Read project.pbxproj and Info.plist from the iOS dir and return all
 * available bundle id candidates, plus the recommended one and a
 * mismatch flag.
 *
 * Filesystem reads are best-effort — when either file is missing or
 * unreadable, we silently skip that source. The capacitor candidate is
 * always present.
 */
export function detectIosBundleIds(opts: {
  /** Project root (typically `process.cwd()`). */
  cwd: string
  /** Subdirectory under cwd holding the iOS project (typically "ios"). */
  iosDir: string
  /** Bundle id read from capacitor.config.ts/json — always known. */
  capacitorAppId: string
}): DetectedBundleIds {
  const { cwd, iosDir, capacitorAppId } = opts

  const capacitor: BundleIdCandidate = {
    value: capacitorAppId,
    source: 'capacitor-config',
    label: 'capacitor.config.ts (appId)',
  }

  let pbxproj: BundleIdCandidate | null = null
  let plist: BundleIdCandidate | null = null

  // pbxproj — use the existing finder so we agree with the rest of the CLI
  // on what counts as the canonical iOS project location.
  const pbxprojPath = findXcodeProject(`${cwd}/${iosDir}`) ?? findXcodeProject(cwd)
  if (pbxprojPath) {
    try {
      const content = readFileSync(pbxprojPath, 'utf-8')
      pbxproj = parsePbxprojBundleId(content)
    }
    catch {
      // unreadable — silently skip
    }
  }

  // Info.plist — most Capacitor templates put it at ios/App/App/Info.plist.
  // We try that path first; absence is fine (Info.plist is a weaker source
  // than pbxproj anyway).
  const plistPaths = [
    `${cwd}/${iosDir}/App/App/Info.plist`,
    `${cwd}/${iosDir}/App/Info.plist`,
  ]
  for (const path of plistPaths) {
    try {
      const content = readFileSync(path, 'utf-8')
      plist = parseInfoPlistBundleId(content)
      if (plist)
        break
    }
    catch {
      // missing — try the next candidate path
    }
  }

  // Build a deduplicated candidate list. Order is priority-first so the
  // confirm-app-id step renders the recommended choice on top.
  const seen = new Set<string>()
  const ordered: BundleIdCandidate[] = []
  for (const c of [pbxproj, plist, capacitor]) {
    if (!c || seen.has(c.value))
      continue
    seen.add(c.value)
    ordered.push(c)
  }

  const recommended = ordered[0]
  const mismatch = recommended.value !== capacitor.value

  return {
    pbxproj,
    plist,
    capacitor,
    recommended,
    mismatch,
    candidates: ordered,
  }
}
