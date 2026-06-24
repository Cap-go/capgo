import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, posix } from 'node:path'

/** Matches native source files in standard Capacitor plugin layouts. */
export const NATIVE_PLUGIN_SOURCE_REGEX = /([A-Za-z0-9]+)\.(java|swift|kt|scala)$/
/** Matches native source files in @capacitor/ios and @capacitor/android layouts. */
export const NATIVE_PLATFORM_SOURCE_REGEX = /([A-Za-z0-9]+)\.(java|swift|kt|scala|m|mm|h)$/

const EXCLUDED_DIR_NAMES = new Set([
  'build',
  'node_modules',
  '.gradle',
  '.transforms',
  'intermediates',
  'generated',
  'outputs',
  'tmp',
  'Tests',
  'tests',
  '__tests__',
])

const IOS_ALTERNATE_ROOTS = ['Capacitor', 'CapacitorCordova'] as const
const ANDROID_ALTERNATE_ROOT = 'capacitor'

const TEXT_CHECKSUM_EXTENSIONS = new Set([
  '.swift',
  '.java',
  '.kt',
  '.scala',
  '.m',
  '.mm',
  '.h',
  '.gradle',
  '.kts',
  '.podspec',
])

function findChildDirectory(dependencyFolderPath: string, expectedName: string): string | undefined {
  try {
    for (const entry of readdirSync(dependencyFolderPath, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name === expectedName)
        return join(dependencyFolderPath, entry.name)
    }
  }
  catch {
    // Ignore errors reading directory
  }
  return undefined
}

function usesPlatformSourceRegex(scanRootName: string): boolean {
  return scanRootName === 'Capacitor'
    || scanRootName === 'CapacitorCordova'
    || scanRootName === ANDROID_ALTERNATE_ROOT
}

/** Returns whether a file path is a native source file for the given scan root layout. */
export function isNativeSourceFilePath(filePath: string, scanRootName: string): boolean {
  const regex = usesPlatformSourceRegex(scanRootName)
    ? NATIVE_PLATFORM_SOURCE_REGEX
    : NATIVE_PLUGIN_SOURCE_REGEX
  return regex.test(filePath)
}

/** Returns whether file content should be normalized to LF before checksum hashing. */
export function shouldNormalizeNativeFileContent(filePath: string): boolean {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('package.swift'))
    return true
  for (const ext of TEXT_CHECKSUM_EXTENSIONS) {
    if (lower.endsWith(ext))
      return true
  }
  return false
}

/** Normalizes native text file content to LF for deterministic cross-OS checksums. */
export function normalizeNativeFileContentForChecksum(content: Buffer, filePath: string): Buffer {
  if (!shouldNormalizeNativeFileContent(filePath))
    return content
  const text = content.toString('utf8')
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return Buffer.from(normalized, 'utf8')
}

/** Converts an absolute file path to a POSIX relative path from the dependency root. */
export function normalizeChecksumRelativePath(dependencyFolderPath: string, filePath: string): string {
  const toPosixPath = (input: string) => input.replace(/\\/g, posix.sep)
  return posix.relative(toPosixPath(dependencyFolderPath), toPosixPath(filePath))
}

/** Resolves iOS or Android native scan roots, including platform package layouts. */
export function getNativeScanRoots(dependencyFolderPath: string, platform: 'ios' | 'android'): string[] {
  const roots: string[] = []
  const primary = findChildDirectory(dependencyFolderPath, platform)
  if (primary)
    roots.push(primary)

  if (platform === 'ios') {
    for (const alt of IOS_ALTERNATE_ROOTS) {
      const altPath = findChildDirectory(dependencyFolderPath, alt)
      if (altPath)
        roots.push(altPath)
    }
  }
  else {
    const altPath = findChildDirectory(dependencyFolderPath, ANDROID_ALTERNATE_ROOT)
    if (altPath)
      roots.push(altPath)
  }

  return roots
}

function readDirRecursivelyFullPaths(dir: string): string[] {
  if (!existsSync(dir))
    return []

  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    return entries.flatMap((entry) => {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name))
          return []
        return readDirRecursivelyFullPaths(fullPath)
      }
      if (entry.isFile() || entry.isSymbolicLink())
        return fullPath
      return []
    })
  }
  catch {
    return []
  }
}

function collectNativeFilesFromRoots(roots: string[]): string[] {
  const files: string[] = []
  for (const root of roots) {
    const scanRootName = basename(root)
    const nativeFiles = readDirRecursivelyFullPaths(root)
      .filter(filePath => isNativeSourceFilePath(filePath, scanRootName))
    files.push(...nativeFiles)
  }
  return [...new Set(files)]
}

function getPlatformConfigFiles(dependencyFolderPath: string, platform: 'ios' | 'android'): string[] {
  const files: string[] = []

  if (platform === 'ios') {
    try {
      const rootFiles = readdirSync(dependencyFolderPath)
      for (const file of rootFiles) {
        if (file.endsWith('.podspec'))
          files.push(join(dependencyFolderPath, file))
      }
    }
    catch {
      // Ignore errors reading directory
    }

    const packageSwiftRoot = join(dependencyFolderPath, 'Package.swift')
    const packageSwiftIos = join(dependencyFolderPath, 'ios', 'Package.swift')
    if (existsSync(packageSwiftRoot))
      files.push(packageSwiftRoot)
    if (existsSync(packageSwiftIos))
      files.push(packageSwiftIos)
  }
  else if (platform === 'android') {
    for (const gradleDir of [
      join(dependencyFolderPath, 'android'),
      join(dependencyFolderPath, ANDROID_ALTERNATE_ROOT),
    ]) {
      const buildGradle = join(gradleDir, 'build.gradle')
      const buildGradleKts = join(gradleDir, 'build.gradle.kts')
      if (existsSync(buildGradle))
        files.push(buildGradle)
      if (existsSync(buildGradleKts))
        files.push(buildGradleKts)
    }
  }

  return files
}

function updateLengthPrefixedHash(hash: ReturnType<typeof createHash>, data: Buffer | string): void {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data
  const length = Buffer.alloc(4)
  length.writeUInt32BE(buffer.length, 0)
  hash.update(length)
  hash.update(buffer)
}

/** Returns true when a dependency contains native sources or platform config files. */
export function dependencyHasNativeFiles(dependencyFolderPath: string): boolean {
  const iosRoots = getNativeScanRoots(dependencyFolderPath, 'ios')
  const androidRoots = getNativeScanRoots(dependencyFolderPath, 'android')
  const iosConfigFiles = getPlatformConfigFiles(dependencyFolderPath, 'ios')
  const androidConfigFiles = getPlatformConfigFiles(dependencyFolderPath, 'android')
  return collectNativeFilesFromRoots(iosRoots).length > 0
    || collectNativeFilesFromRoots(androidRoots).length > 0
    || iosConfigFiles.length > 0
    || androidConfigFiles.length > 0
}

/** Computes deterministic SHA-256 checksums for iOS and Android native dependency content. */
export async function calculatePlatformChecksums(dependencyFolderPath: string): Promise<{ ios_checksum?: string, android_checksum?: string }> {
  const calculatePlatformChecksum = async (platform: 'ios' | 'android'): Promise<string | undefined> => {
    const roots = getNativeScanRoots(dependencyFolderPath, platform)
    const nativeFiles = collectNativeFilesFromRoots(roots)
    const configFiles = getPlatformConfigFiles(dependencyFolderPath, platform)
    const allFiles = [...new Set([...nativeFiles, ...configFiles])].sort((a, b) => a.localeCompare(b))

    if (allFiles.length === 0)
      return undefined

    const hash = createHash('sha256')

    for (const file of allFiles) {
      try {
        const content = readFileSync(file)
        const relativePath = normalizeChecksumRelativePath(dependencyFolderPath, file)
        const normalizedContent = normalizeNativeFileContentForChecksum(content, file)
        updateLengthPrefixedHash(hash, relativePath)
        updateLengthPrefixedHash(hash, normalizedContent)
      }
      catch {
        // Skip files that can't be read
      }
    }

    return hash.digest('hex')
  }

  const [ios_checksum, android_checksum] = await Promise.all([
    calculatePlatformChecksum('ios'),
    calculatePlatformChecksum('android'),
  ])

  return { ios_checksum, android_checksum }
}
