import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { intro, log, outro, confirm as pConfirm } from '@clack/prompts'
import { createRSA } from './api/crypto'
import { checkAlerts } from './api/update'
import { writeConfigUpdater } from './config'
import { baseKey, baseKeyPub, baseKeyPubV2, baseKeyV2, getConfig, promptAndSyncCapacitor } from './utils'

interface SaveOptions {
  key?: string
  keyData?: string
  setupChannel?: boolean
}

interface Options {
  force?: boolean
  setupChannel?: boolean
}

function ensureCapacitorUpdaterConfig(config: any) {
  config.plugins ??= {}
  config.plugins.extConfig ??= {}
  config.plugins.CapacitorUpdater ??= {}
  return config.plugins.CapacitorUpdater
}

export async function saveKeyInternal(options: SaveOptions, silent = false) {
  if (!silent)
    intro('Save keys 🔑')

  const extConfig = await getConfig()
  const keyPath = options.key || baseKeyPubV2
  let publicKey = options.keyData || ''

  if (!existsSync(keyPath) && !publicKey) {
    if (!silent)
      log.error(`Cannot find a public key at ${keyPath} or as keyData option or in ${extConfig.path}`)
    throw new Error('Missing public key')
  }

  if (existsSync(keyPath))
    publicKey = readFileSync(keyPath, 'utf8')

  if (!publicKey.startsWith('-----BEGIN RSA PUBLIC KEY-----')) {
    if (!silent)
      log.error('The public key provided is not a valid RSA Public key')
    throw new Error('Invalid RSA public key')
  }

  if (extConfig?.config) {
    const updaterConfig = ensureCapacitorUpdaterConfig(extConfig.config)

    if (updaterConfig.privateKey) {
      delete updaterConfig.privateKey
      if (!silent)
        log.info('Old private key deleted from config file')

      const shouldSetupChannel = silent
        ? options.setupChannel ?? false
        : options.setupChannel ?? await pConfirm({
          message: 'Do you want to setup encryption with the new channel in order to support old apps and facilitate the migration?',
        })

      if (shouldSetupChannel)
        updaterConfig.defaultChannel = 'encryption_v2'
    }

    updaterConfig.publicKey = publicKey
    await writeConfigUpdater(extConfig)
  }

  if (!silent) {
    log.success(`Public key saved into ${extConfig.path} file in local directory`)
    log.success('Your app will decode the zip archive with this key')
  }

  return true
}

export async function saveKey(options: SaveOptions) {
  await saveKeyInternal(options, false)
}

export async function deleteOldPrivateKeyInternal(options: Options, silent = false): Promise<boolean> {
  if (!silent)
    intro('Deleting old private key 🗑️')

  const extConfig = await getConfig()
  const updaterConfig = extConfig?.config?.plugins?.CapacitorUpdater

  if (updaterConfig?.privateKey) {
    delete updaterConfig.privateKey
    await writeConfigUpdater(extConfig)

    if (existsSync(baseKey)) {
      try {
        unlinkSync(baseKey)
        if (!silent)
          log.success(`Old private key file deleted: ${baseKey}`)
      }
      catch (error) {
        if (!silent)
          log.error(`Failed to delete old private key file: ${baseKey} (${String(error)})`)
      }
    }

    if (existsSync(baseKeyPub)) {
      try {
        unlinkSync(baseKeyPub)
        if (!silent)
          log.success(`Old public key file deleted: ${baseKeyPub}`)
      }
      catch (error) {
        if (!silent)
          log.error(`Failed to delete old public key file: ${baseKeyPubV2} (${String(error)})`)
      }
    }

    if (!silent) {
      log.success(`Old private key deleted from ${extConfig.path} file`)
      outro('Done ✅')
    }
    return true
  }

  if (!silent)
    log.info('No old private key found in config file')

  return false
}

export async function deleteOldPrivateKey(options: Options, logg = true): Promise<boolean> {
  return deleteOldPrivateKeyInternal(options, !logg)
}

export async function saveKeyCommand(options: SaveOptions) {
  await checkAlerts()
  await saveKeyInternal(options, false)
}

export async function createKeyInternal(options: Options, silent = false) {
  if (!silent)
    intro('Create keys 🔑')

  const { publicKey, privateKey } = createRSA()

  if (existsSync(baseKeyPubV2) && !options.force) {
    if (!silent)
      log.error('Public Key already exists, use --force to overwrite')
    throw new Error('Public key already exists')
  }
  writeFileSync(baseKeyPubV2, publicKey)

  if (existsSync(baseKeyV2) && !options.force) {
    if (!silent)
      log.error('Private Key already exists, use --force to overwrite')
    throw new Error('Private key already exists')
  }
  writeFileSync(baseKeyV2, privateKey)

  const extConfig = await getConfig()

  if (extConfig) {
    const updaterConfig = ensureCapacitorUpdaterConfig(extConfig.config)

    if (updaterConfig.privateKey) {
      delete updaterConfig.privateKey
      if (!silent)
        log.info('Old private key deleted from config file')

      const shouldSetupChannel = silent
        ? options.setupChannel ?? false
        : options.setupChannel ?? await pConfirm({
          message: 'Do you want to setup encryption with the new channel in order to support old apps and facilitate the migration?',
        })

      if (shouldSetupChannel)
        updaterConfig.defaultChannel = 'encryption_v2'
    }

    updaterConfig.publicKey = publicKey
    await writeConfigUpdater(extConfig)
  }

  if (!silent) {
    log.success('Your RSA key has been generated')
    log.success(`Private key saved in ${baseKeyV2}`)
    log.success('This key will be used to encrypt your bundle before sending it to Capgo')
    log.success('Keep it safe')
    log.success('Then make it unreadable by Capgo and unmodifiable by anyone')
    log.success(`Public key saved in ${extConfig.path}`)
    log.success('Your app will be the only one having it')
    log.success('Only your users can decrypt your update')
    log.success('Only you can send them an update')

    // Ask user if they want to sync with Capacitor
    // No parameters needed - not part of onboarding flow, so no need to track cancellation
    try {
      await promptAndSyncCapacitor(undefined, undefined, undefined, { validateIosUpdater: true })
      outro('Done ✅')
    }
    catch (error) {
      // Only handle cancellation gracefully - re-throw any other errors
      if (error instanceof Error && error.message === 'Capacitor sync cancelled') {
        // User cancelled the sync - that's okay, key creation was still successful
        // Just exit without the "Done" message since they cancelled the follow-up step
        return true
      }
      // Re-throw any other errors (e.g., network errors, permission errors, etc.)
      throw error
    }
  }

  return true
}

export async function createKey(options: Options) {
  await checkAlerts()
  await createKeyInternal(options, false)
}

export async function deleteOldKey(options: Options) {
  await checkAlerts()
  await deleteOldPrivateKeyInternal(options, false)
}
