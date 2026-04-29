import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { intro, isCancel, log, outro, password } from '@clack/prompts'
import { checkAlerts } from './api/update'
import { createSupabaseClient, resolveUserIdFromApiKey, sendEvent } from './utils'
import { appendToSafeFile, writeFileAtomic } from './utils/safeWrites'

interface Options {
  local: boolean
  supaHost?: string
  supaAnon?: string
}

export function doLoginExists() {
  const userHomeDir = homedir()
  return existsSync(`${userHomeDir}/.capgo`) || existsSync('.capgo')
}

export async function loginInternal(apikey: string, options: Options, silent = false) {
  if (!silent)
    intro(`Login to Capgo`)

  if (!apikey && !silent) {
    const apikeyInput = await password({
      message: 'Enter your API key:',
      mask: '*',
    })

    if (isCancel(apikeyInput)) {
      log.error('Login cancelled')
      throw new Error('Login cancelled')
    }
    apikey = apikeyInput as string
  }

  if (!apikey) {
    if (!silent)
      log.error('Missing API key, you need to provide an API key to upload your bundle')
    throw new Error('Missing API key')
  }

  if (!silent)
    await checkAlerts()
  // write in file .capgo the apikey in home directory
  const { local } = options

  if (local && !existsSync('.git')) {
    if (!silent)
      log.error('To use local you should be in a git repository')
    throw new Error('Not in a git repository')
  }

  const supabase = await createSupabaseClient(apikey, options.supaHost, options.supaAnon)
  const userId = await resolveUserIdFromApiKey(supabase, apikey)

  if (local) {
    await writeFileAtomic('.capgo', `${apikey}\n`, { mode: 0o600 })
    await appendToSafeFile('.gitignore', '.capgo\n', 0o600)
  }
  else {
    const userHomeDir = homedir()
    await writeFileAtomic(`${userHomeDir}/.capgo`, `${apikey}\n`, { mode: 0o600 })
  }

  await sendEvent(apikey, {
    channel: 'user-login',
    event: 'User CLI login',
    icon: '✅',
    user_id: userId,
    notify: false,
  }).catch()

  if (!silent) {
    log.success(`login saved into .capgo file in ${local ? 'local' : 'home'} directory`)
    outro('Done ✅')
  }
}

export async function login(apikey: string, options: Options) {
  await loginInternal(apikey, options, false)
}
