import { homedir } from 'node:os'
import { join } from 'node:path'
import { log, confirm as pConfirm, isCancel as pIsCancel } from '@clack/prompts'
import { formatError } from './utils'
import { readSafeFile, writeFileAtomic } from './utils/safeWrites'

export type PromptPreferenceKey = 'uploadShowReplicationProgress' | 'uploadStarCapgoRepo'

type PromptPreferences = Partial<Record<PromptPreferenceKey, boolean>>

export const promptPreferencesPath = join(homedir(), '.capgo-prompt-preferences.json')

interface RememberedConfirmOptions {
  preferenceKey: PromptPreferenceKey
  message: string
  initialValue?: boolean
  rememberMessage?: string
}

async function readPromptPreferences(filePath: string = promptPreferencesPath): Promise<PromptPreferences> {
  try {
    const content = await readSafeFile(filePath)
    const parsed = JSON.parse(content) as unknown

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}

    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === 'boolean'),
    ) as PromptPreferences
  }
  catch {
    return {}
  }
}

export async function getRememberedPromptPreference(preferenceKey: PromptPreferenceKey, filePath: string = promptPreferencesPath): Promise<boolean | undefined> {
  const preferences = await readPromptPreferences(filePath)
  return preferences[preferenceKey]
}

export async function rememberPromptPreference(preferenceKey: PromptPreferenceKey, value: boolean, filePath: string = promptPreferencesPath): Promise<void> {
  const preferences = await readPromptPreferences(filePath)
  preferences[preferenceKey] = value
  await writeFileAtomic(filePath, `${JSON.stringify(preferences, null, 2)}\n`, { mode: 0o600 })
}

export async function rememberPromptPreferenceSafely(preferenceKey: PromptPreferenceKey, value: boolean, filePath: string = promptPreferencesPath): Promise<void> {
  try {
    await rememberPromptPreference(preferenceKey, value, filePath)
  }
  catch (error) {
    log.warn(`Could not save prompt preference: ${formatError(error)}`)
  }
}

export async function confirmWithRememberedChoice({
  preferenceKey,
  message,
  initialValue = false,
  rememberMessage = 'Remember this choice on this machine and stop asking again?',
}: RememberedConfirmOptions): Promise<boolean> {
  const rememberedChoice = await getRememberedPromptPreference(preferenceKey)
  if (rememberedChoice !== undefined)
    return rememberedChoice

  const choice = await pConfirm({
    message,
    initialValue,
  })

  if (pIsCancel(choice))
    return false

  const shouldRememberChoice = await pConfirm({
    message: rememberMessage,
    initialValue: false,
  })

  if (!pIsCancel(shouldRememberChoice) && shouldRememberChoice)
    await rememberPromptPreferenceSafely(preferenceKey, choice)

  return choice
}
