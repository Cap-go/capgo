import type { ExtConfigPairs } from '../config'
import { randomBytes } from 'node:crypto'
import { confirm as pConfirm, isCancel as pIsCancel, log, select as pSelect, text as pText } from '@clack/prompts'
import { isValidAppId } from '../recovery/app-id'
import { canPromptInteractively, formatError, getConfigForWrite } from '../utils'
import { writeConfigUpdater } from '../config'

export const CAPGO_APP_ID_OPT_IN_MESSAGE
  = 'Set a Capgo app ID in your Capacitor config? (top-level appId and CapacitorUpdater.appId)'

type CapgoAppIdChoice = 'random' | 'custom'

export interface CapgoAppIdPromptDeps {
  confirm: (message: string) => Promise<boolean | symbol>
  select: (message: string, options: { value: CapgoAppIdChoice, label: string }[]) => Promise<CapgoAppIdChoice | symbol>
  text: (message: string, validate: (value: string | undefined) => string | undefined) => Promise<string | symbol>
  logSuccess: (message: string) => void
  logWarn: (message: string) => void
  loadConfig: () => Promise<ExtConfigPairs>
  writeConfig: (config: ExtConfigPairs) => Promise<void>
  generateRandomAppId: () => string
}

function defaultDeps(): CapgoAppIdPromptDeps {
  return {
    confirm: message => pConfirm({ message, initialValue: false }),
    select: async (message, options) => pSelect({ message, options }) as Promise<CapgoAppIdChoice | symbol>,
    text: (message, validate) => pText({ message, validate }),
    logSuccess: message => log.success(message),
    logWarn: message => log.warn(message),
    loadConfig: () => getConfigForWrite(),
    writeConfig: config => writeConfigUpdater(config, true),
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
    extConfig.config.appId = appId
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
    deps.logWarn(`Set appId to ${appId} in capacitor.config manually.`)
    return false
  }
}

export type OfferCapgoAppIdPromptOutcome
  = | 'skipped'
    | 'declined'
    | 'saved-random'
    | 'saved-custom'

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

  const optedIn = await deps.confirm(CAPGO_APP_ID_OPT_IN_MESSAGE)
  if (pIsCancel(optedIn) || !optedIn)
    return 'declined'

  const method = await deps.select('How do you want to set the Capgo app ID?', [
    { value: 'random', label: 'Generate a random app ID (com.capgo.*)' },
    { value: 'custom', label: 'Enter a custom app ID' },
  ])
  if (pIsCancel(method))
    return 'declined'

  if (method === 'random') {
    const appId = deps.generateRandomAppId()
    const saved = await persistCapgoAppIdToCapacitorConfig(appId, deps)
    if (saved)
      deps.logSuccess(`Saved Capgo app ID ${appId} to capacitor config`)
    return 'saved-random'
  }

  const entered = await deps.text('Enter your Capgo app ID (e.g. com.example.app):', (value) => {
    if (!value?.trim())
      return 'App ID is required'
    if (!isValidAppId(value.trim()))
      return 'Use reverse domain notation (e.g. com.example.app)'
  })
  if (pIsCancel(entered))
    return 'declined'

  const appId = (entered as string).trim()
  const saved = await persistCapgoAppIdToCapacitorConfig(appId, deps)
  if (saved)
    deps.logSuccess(`Saved Capgo app ID ${appId} to capacitor config`)
  return 'saved-custom'
}
