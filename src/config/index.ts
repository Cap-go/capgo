import type { ExtConfigPairs } from '../schemas/config'
import { loadConfig as loadConfigCap, writeConfig as writeConfigCap } from '@capacitor/cli/dist/config'

export type { CapacitorConfig, ExtConfigPairs } from '../schemas/config'

export async function loadConfig(): Promise<ExtConfigPairs | undefined> {
  const config = await loadConfigCap()
  return {
    config: config.app.extConfig,
    path: config.app.extConfigFilePath,
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
    writeConfigCap(extConfig, oldConfig.app.extConfigFilePath)
  }
}

export async function writeConfigUpdater(config: ExtConfigPairs, raw = false): Promise<void> {
  await writeConfig('CapacitorUpdater', config, raw)
}
