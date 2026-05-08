import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, normalize, relative } from 'node:path'

export const CAPGO_UPDATER_PACKAGE = '@capgo/capacitor-updater'

type DependencySection = 'dependencies' | 'devDependencies' | 'optionalDependencies'

export interface UpdaterInstallState {
  packageJsonPath: string
  projectDir: string
  declaredVersion: string | null
  declaredIn: DependencySection | null
  installedVersion: string | null
  ready: boolean
  details: string[]
}

interface PackageJsonDependencies {
  dependencies?: Record<string, unknown>
  devDependencies?: Record<string, unknown>
  optionalDependencies?: Record<string, unknown>
  workspaces?: unknown
}

function readPackageJson(packageJsonPath: string): PackageJsonDependencies | null {
  if (!existsSync(packageJsonPath))
    return null

  try {
    return JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as PackageJsonDependencies
  }
  catch {
    return null
  }
}

function getDeclaredDependency(packageJsonPath: string, packageName: string) {
  const packageJson = readPackageJson(packageJsonPath)
  if (!packageJson)
    return { version: null, section: null }

  const sections: DependencySection[] = ['dependencies', 'devDependencies', 'optionalDependencies']
  for (const section of sections) {
    const dependencies = packageJson[section]
    if (!dependencies || !Object.hasOwn(dependencies, packageName))
      continue

    const version = dependencies[packageName]
    return {
      version: typeof version === 'string' ? version : String(version),
      section,
    }
  }

  return { version: null, section: null }
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = relative(parentPath, childPath)
  return relativePath === '' || (!!relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath))
}

function isWorkspaceRootCandidate(directory: string): boolean {
  const packageJson = readPackageJson(join(directory, 'package.json'))
  if (packageJson?.workspaces)
    return true

  return [
    'pnpm-workspace.yaml',
    'lerna.json',
    'nx.json',
    'turbo.json',
  ].some(marker => existsSync(join(directory, marker)))
}

function findWorkspaceRoot(projectDir: string): string {
  let workspaceRoot = projectDir
  let currentDir = projectDir

  while (true) {
    if (isWorkspaceRootCandidate(currentDir))
      workspaceRoot = currentDir

    const parentDir = dirname(currentDir)
    if (parentDir === currentDir)
      break
    currentDir = parentDir
  }

  return workspaceRoot
}

function isProjectPackageResolution(projectDir: string, workspaceRoot: string, packageName: string, resolvedPath: string): boolean {
  const normalizedResolvedPath = normalize(resolvedPath)
  const packageJsonSuffix = normalize(join(packageName, 'package.json'))
  if (!normalizedResolvedPath.endsWith(packageJsonSuffix))
    return false

  let currentDir = projectDir
  while (true) {
    if (isPathInside(join(currentDir, 'node_modules'), normalizedResolvedPath))
      return true

    if (currentDir === workspaceRoot)
      break

    const parentDir = dirname(currentDir)
    if (parentDir === currentDir || !isPathInside(workspaceRoot, parentDir))
      break
    currentDir = parentDir
  }

  return false
}

function readInstalledPackageVersion(packageJsonPath: string, packageName: string): string | null {
  const projectDir = dirname(packageJsonPath)
  const workspaceRoot = findWorkspaceRoot(projectDir)

  try {
    const requireFromProject = createRequire(join(projectDir, 'package.json'))
    const resolvedPath = requireFromProject.resolve(`${packageName}/package.json`)
    if (isProjectPackageResolution(projectDir, workspaceRoot, packageName, resolvedPath)) {
      const packageJson = JSON.parse(readFileSync(resolvedPath, 'utf-8')) as { version?: unknown }
      if (typeof packageJson.version === 'string')
        return packageJson.version
    }
  }
  catch {
    // Fall through to direct node_modules lookup.
  }

  let currentDir = projectDir
  while (true) {
    const packagePath = join(currentDir, 'node_modules', packageName, 'package.json')
    if (existsSync(packagePath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8')) as { version?: unknown }
        if (typeof packageJson.version === 'string')
          return packageJson.version
      }
      catch {
        return null
      }
    }

    if (currentDir === workspaceRoot)
      break

    const parentDir = dirname(currentDir)
    if (parentDir === currentDir || !isPathInside(workspaceRoot, parentDir))
      break
    currentDir = parentDir
  }

  return null
}

export function getUpdaterInstallState(packageJsonPath: string): UpdaterInstallState {
  const projectDir = dirname(packageJsonPath)
  const declaration = getDeclaredDependency(packageJsonPath, CAPGO_UPDATER_PACKAGE)
  const installedVersion = readInstalledPackageVersion(packageJsonPath, CAPGO_UPDATER_PACKAGE)
  const details: string[] = []

  if (!declaration.version)
    details.push(`Missing ${CAPGO_UPDATER_PACKAGE} in ${packageJsonPath}`)
  if (!installedVersion)
    details.push(`Cannot resolve ${CAPGO_UPDATER_PACKAGE} from ${projectDir}/node_modules`)

  return {
    packageJsonPath,
    projectDir,
    declaredVersion: declaration.version,
    declaredIn: declaration.section,
    installedVersion,
    ready: details.length === 0,
    details,
  }
}
