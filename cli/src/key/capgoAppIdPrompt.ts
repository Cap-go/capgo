import type { ExtConfigPairs } from '../config'
import { randomBytes } from 'node:crypto'
import { log, confirm as pConfirm, isCancel as pIsCancel } from '@clack/prompts'
import { addAppInternal } from '../app/add'
import { writeConfigUpdater } from '../config'
import { canPromptInteractively, findSavedKeySilent, formatError, getConfigForWrite } from '../utils'

export const CAPGO_APP_ID_OPT_IN_MESSAGE
  = 'Create a Capgo app with a random app ID and save it as CapacitorUpdater.appId?'

export interface CapgoAppIdPromptDeps {
  confirm: (message: string) => Promise<boolean | symbol>
  logSuccess: (message: string) => void
  logWarn: (message: string) => void
  loadConfig: () => Promise<ExtConfigPairs>
  writeConfig: (config: ExtConfigPairs) => Promise<void>
  findApiKey: () => string | undefined
  createApp: (appId: string, apikey: string) => Promise<void>
  generateRandomAppId: () => string
}

function defaultDeps(): CapgoAppIdPromptDeps {
  return {
    confirm: message => pConfirm({ message, initialValue: false }),
    logSuccess: message => log.success(message),
    logWarn: message => log.warn(message),
    loadConfig: () => getConfigForWrite(),
    writeConfig: config => writeConfigUpdater(config, true),
    findApiKey: () => findSavedKeySilent(),
    createApp: async (appId, apikey) => {
      await addAppInternal(appId, { apikey }, undefined, true)
    },
    generateRandomAppId: generateRandomCapgoAppId,
  }
}

// codeql[js/insecure-randomness]: app id slug is public identifier material, not a secret.
export function generateRandomCapgoAppId(): string {
  return `com.capgo.${randomBytes(8).toString('hex')}`
}

export async function persistCapgoAppIdToCapacitorConfig(
  appId: string,
  deps: Pick<CapgoAppIdPromptDeps, 'loadConfig' | 'writeConfig' | 'logWarn'> = defaultDeps(),
): Promise<boolean> {
  try {
    const extConfig = await deps.loadConfig()
    extConfig.config.plugins ??= {}
    extConfig.config.plugins.CapacitorUpdater = {
      ...extConfig.config.plugins.CapacitorUpdater,
      appId,
    }
    await deps.writeConfig(extConfig)
    return true
  }
  catch (error) {
    deps.logWarn(`Could not write app ID to capacitor config: ${formatError(error)}`)
    deps.logWarn(`Set plugins.CapacitorUpdater.appId to ${appId} in capacitor.config manually.`)
    return false
  }
}

export type OfferCapgoAppIdPromptOutcome
  = | 'skipped'
    | 'declined'
    | 'failed'
    | 'saved'

export interface OfferCapgoAppIdPromptOptions {
  skip?: boolean
  silent?: boolean
  interactive?: boolean
  deps?: Partial<CapgoAppIdPromptDeps>
}

export async function offerCapgoAppIdPrompt(
  options: OfferCapgoAppIdPromptOptions = {},
): Promise<OfferCapgoAppIdPromptOutcome> {
  const interactive = options.interactive ?? canPromptInteractively({ silent: options.silent })
  if (options.skip || !interactive)
    return 'skipped'

  const deps = { ...defaultDeps(), ...options.deps }

  // Already pointing at a Capgo app: nothing to set up.
  try {
    const extConfig = await deps.loadConfig()
    if (extConfig.config.plugins?.CapacitorUpdater?.appId)
      return 'skipped'
  }
  catch {}

  // The app must exist in Capgo before we point the config at it, so require a saved API key.
  const apikey = deps.findApiKey()
  if (!apikey)
    return 'skipped'

  const optedIn = await deps.confirm(CAPGO_APP_ID_OPT_IN_MESSAGE)
  if (pIsCancel(optedIn) || !optedIn)
    return 'declined'

  const appId = deps.generateRandomAppId()
  try {
    await deps.createApp(appId, apikey)
  }
  catch (error) {
    deps.logWarn(`Could not create Capgo app ${appId}: ${formatError(error)}`)
    return 'failed'
  }

  if (!await persistCapgoAppIdToCapacitorConfig(appId, deps))
    return 'failed'

  deps.logSuccess(`Created Capgo app ${appId} and saved it as CapacitorUpdater.appId`)
  return 'saved'
}
