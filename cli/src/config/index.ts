import { AsyncLocalStorage } from 'node:async_hooks'
import { existsSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { cwd } from 'node:process'
import type { ExtConfigPairs } from '../schemas/config'
import { loadConfig as loadConfigCap, writeConfig as writeConfigCap } from '../capacitor-cli'

export type { CapacitorConfig, ExtConfigPairs } from '../schemas/config'

let configWriteTarget: string | undefined
const configWriteTargetStore = new AsyncLocalStorage<{ filePath: string | undefined }>()
const capacitorConfigFilePattern = /^capacitor\.config(?:\.[^.]+)*\.(?:ts|js|json)$/

/**
 * Overrides the config file Capacitor writes after loading the active root config.
 * This lets dynamic monorepos keep their root loader while Capgo updates the
 * selected app-specific source config.
 */
export function setConfigWriteTarget(filePath?: string): void {
  configWriteTarget = filePath
}

export function getConfigWriteTarget(): string | undefined {
  const scopedTarget = configWriteTargetStore.getStore()
  return scopedTarget === undefined ? configWriteTarget : scopedTarget.filePath
}

/**
 * Uses a request-local config target so concurrent MCP tool calls cannot
 * redirect one another's writes while awaiting async work.
 */
export function withConfigWriteTarget<T>(filePath: string | undefined, action: () => T): T {
  return configWriteTargetStore.run({ filePath }, action)
}

export function resolveCapacitorConfigTargetPath(value: string | undefined, initialCwd = cwd()): string | undefined {
  if (value === undefined)
    return undefined
  if (!value.trim())
    throw new Error('Capacitor config path must not be empty')

  const resolved = resolve(initialCwd, value)
  if (!existsSync(resolved) || !statSync(resolved).isFile())
    throw new Error(`Capacitor config path does not exist: ${resolved}`)
  if (!capacitorConfigFilePattern.test(basename(resolved)))
    throw new Error(`Capacitor config path must point to a capacitor.config.* file: ${resolved}`)
  return resolved
}

export async function loadConfig(): Promise<ExtConfigPairs | undefined> {
  const config = await loadConfigCap()
  return {
    config: config.app.extConfig,
    path: getConfigWriteTarget() ?? config.app.extConfigFilePath,
  }
}

export async function writeConfig(key: string, config: ExtConfigPairs, raw = false): Promise<void> {
  const oldConfig = await loadConfigCap()

  let { extConfig } = oldConfig.app
  if (extConfig) {
    if (!extConfig.plugins) {
      extConfig.plugins = {
        extConfig: {},
        [key]: {},
      }
    }
    if (!extConfig.plugins[key])
      extConfig.plugins[key] = {}

    if (!raw)
      extConfig.plugins[key] = config.config.plugins?.[key]
    else
      extConfig = config.config
    await writeConfigCap(extConfig, getConfigWriteTarget() ?? oldConfig.app.extConfigFilePath)
  }
}

export async function writeConfigSnapshot(config: ExtConfigPairs): Promise<void> {
  await writeConfigCap(config.config, config.path)
}

export async function writeConfigUpdater(config: ExtConfigPairs, raw = false): Promise<void> {
  await writeConfig('CapacitorUpdater', config, raw)
}
