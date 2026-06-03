import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface PbxTarget {
  name: string
  bundleId: string
  productType: string
}

const SIGNABLE_PRODUCT_TYPES = new Set([
  'com.apple.product-type.application',
  'com.apple.product-type.app-extension',
  'com.apple.product-type.app-extension.messages',
  'com.apple.product-type.app-extension.messages-sticker-pack',
  'com.apple.product-type.application.watchapp2',
  'com.apple.product-type.watchkit2-extension',
  'com.apple.product-type.extensionkit-extension',
  'com.apple.product-type.application.on-demand-install-capable',
])

/**
 * Parse a pbxproj file's content and return all signable native targets
 * with their resolved bundle identifiers.
 */
export function findSignableTargets(pbxprojContent: string): PbxTarget[] {
  if (!pbxprojContent)
    return []

  // Step 1: Find all PBXNativeTarget blocks
  const targetRegex = /\w+\s*\/\*[^*]*\*\/\s*=\s*\{[^}]*isa\s*=\s*PBXNativeTarget;[^}]*\}/g
  const targets: PbxTarget[] = []

  for (const match of pbxprojContent.matchAll(targetRegex)) {
    const block = match[0]

    const nameMatch = block.match(/name\s*=\s*("[^"]*"|[^;\s]+)\s*;/)
    const productTypeMatch = block.match(/productType\s*=\s*"([^"]+)"/)
    const configListMatch = block.match(/buildConfigurationList\s*=\s*(\w+)/)

    if (!nameMatch || !productTypeMatch || !configListMatch)
      continue

    const name = nameMatch[1].replace(/^"|"$/g, '')
    const productType = productTypeMatch[1]
    const configListId = configListMatch[1]

    if (!SIGNABLE_PRODUCT_TYPES.has(productType))
      continue

    const bundleId = resolveBundleId(pbxprojContent, configListId)

    targets.push({ name, bundleId, productType })
  }

  return targets
}

/**
 * Given an XCConfigurationList ID, walk the pbxproj to find the
 * PRODUCT_BUNDLE_IDENTIFIER, preferring the Release configuration.
 */
function resolveBundleId(content: string, configListId: string): string {
  // Find XCConfigurationList block for the given ID
  const configListRegex = new RegExp(
    `${escapeRegex(configListId)}\\s*\\/\\*[^*]*\\*\\/\\s*=\\s*\\{[^}]*isa\\s*=\\s*XCConfigurationList;[^}]*\\}`,
  )
  const configListMatch = content.match(configListRegex)
  if (!configListMatch)
    return ''

  // Extract all build configuration IDs from buildConfigurations list
  const configIdsSection = configListMatch[0].match(/buildConfigurations\s*=\s*\(([^)]*)\)/)
  if (!configIdsSection)
    return ''
  const configIds = Array.from(configIdsSection[1].matchAll(/(\w+)/g), m => m[1])
  if (configIds.length === 0)
    return ''

  // Resolve each configuration to its name and bundle ID
  // Regex allows one level of nested braces (e.g. buildSettings = { ... })
  let fallbackBundleId = ''
  for (const configId of configIds) {
    const buildConfigRegex = new RegExp(
      `${escapeRegex(configId)}\\s*\\/\\*[^*]*\\*\\/\\s*=\\s*\\{(?:[^{}]*\\{[^}]*\\})*[^}]*\\}`,
    )
    const buildConfigMatch = content.match(buildConfigRegex)
    if (!buildConfigMatch)
      continue

    const block = buildConfigMatch[0]
    const bundleIdMatch = block.match(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*"?([^";\s]+)"?\s*;/)
    if (!bundleIdMatch)
      continue

    const nameMatch = block.match(/name\s*=\s*("[^"]*"|[^;\s]+)\s*;/)
    const configName = nameMatch ? nameMatch[1].replace(/^"|"$/g, '') : ''

    if (configName === 'Release')
      return bundleIdMatch[1]

    if (!fallbackBundleId)
      fallbackBundleId = bundleIdMatch[1]
  }

  return fallbackBundleId
}

/**
 * Search for an Xcode project.pbxproj file in standard locations:
 *   <searchDir>/ios/*.xcodeproj/project.pbxproj
 *   <searchDir>/*.xcodeproj/project.pbxproj
 * Returns the first found path, or null.
 */
export function findXcodeProject(searchDir: string): string | null {
  // Search ios/ subdirectory first (most common for Capacitor/RN projects)
  const iosDir = join(searchDir, 'ios')
  const found = findPbxprojInDir(iosDir)
  if (found)
    return found

  // Fall back to searching the root directory
  return findPbxprojInDir(searchDir)
}

function findPbxprojInDir(dir: string): string | null {
  if (!existsSync(dir))
    return null

  let entries: string[]
  try {
    entries = readdirSync(dir)
  }
  catch {
    return null
  }

  // 1) A .xcodeproj directly inside `dir` (React Native: ios/MyApp.xcodeproj).
  for (const entry of entries) {
    if (entry.endsWith('.xcodeproj')) {
      const pbxprojPath = join(dir, entry, 'project.pbxproj')
      if (existsSync(pbxprojPath)) {
        return pbxprojPath
      }
    }
  }

  // 2) A .xcodeproj one level down (Capacitor nests it at ios/App/App.xcodeproj).
  // Only reached when nothing matched directly, so the RN layout still wins first.
  for (const entry of entries) {
    const sub = join(dir, entry)
    let subEntries: string[]
    try {
      subEntries = readdirSync(sub)
    }
    catch {
      continue // not a directory / unreadable — skip
    }
    for (const subEntry of subEntries) {
      if (subEntry.endsWith('.xcodeproj')) {
        const pbxprojPath = join(sub, subEntry, 'project.pbxproj')
        if (existsSync(pbxprojPath)) {
          return pbxprojPath
        }
      }
    }
  }

  return null
}

/**
 * Convenience: find the Xcode project in projectDir and read its pbxproj content.
 * Returns null if no project is found.
 */
export function readPbxproj(projectDir: string): string | null {
  const pbxprojPath = findXcodeProject(projectDir)
  if (!pbxprojPath)
    return null

  try {
    return readFileSync(pbxprojPath, 'utf-8')
  }
  catch {
    return null
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replace every `PRODUCT_BUNDLE_IDENTIFIER = <fromId>;` assignment in pbxproj
 * content with `<toId>` (tolerates optional quotes and surrounding whitespace).
 * Pure — returns the new content and the number of replacements made.
 *
 * Matching by exact value (rather than by config block) is deliberate: callers
 * pass the resolved Release build id as `fromId`, and real Capacitor/RN projects
 * give extensions a SUFFIXED id (com.app.ext), so only the main target's
 * assignment(s) match. A Debug config that shares the exact same value is
 * updated too (keeping Debug == Release); a Debug config with a different value
 * is left untouched.
 */
export function replaceBundleIdInPbxproj(
  content: string,
  fromId: string,
  toId: string,
): { content: string, changed: number } {
  if (!content || !fromId || fromId === toId)
    return { content, changed: 0 }
  let changed = 0
  const re = new RegExp(
    `(PRODUCT_BUNDLE_IDENTIFIER\\s*=\\s*)"?${escapeRegex(fromId)}"?(\\s*;)`,
    'g',
  )
  const next = content.replace(re, (_match, prefix, suffix) => {
    changed++
    return `${prefix}${toId}${suffix}`
  })
  return { content: next, changed }
}

/**
 * Locate the project's pbxproj (same search order as detectIosBundleIds) and
 * rewrite its `PRODUCT_BUNDLE_IDENTIFIER = <fromId>;` assignments to `<toId>`,
 * writing the file back only when something changed. Returns the number of
 * replacements (0 when no project or no matching assignment was found). Throws
 * only on a filesystem read/write error.
 */
export function writeReleaseBundleId(
  cwd: string,
  iosDir: string,
  fromId: string,
  toId: string,
): { changed: number } {
  const pbxprojPath = findXcodeProject(join(cwd, iosDir)) ?? findXcodeProject(cwd)
  if (!pbxprojPath)
    return { changed: 0 }
  const content = readFileSync(pbxprojPath, 'utf-8')
  const { content: next, changed } = replaceBundleIdInPbxproj(content, fromId, toId)
  if (changed > 0)
    writeFileSync(pbxprojPath, next, 'utf-8')
  return { changed }
}
