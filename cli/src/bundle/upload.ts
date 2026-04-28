import type { Buffer } from 'node:buffer'
import type { CapacitorConfig } from '../config'
import type { UploadBundleResult } from '../schemas/bundle'
import type { Database } from '../types/supabase.types'
import type { Compatibility, manifestType } from '../utils'
import type { OptionsUpload } from './upload_interface'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { cwd } from 'node:process'
import { S3Client } from '@bradenmacdonald/s3-lite-client'
import { intro, log, outro, confirm as pConfirm, isCancel as pIsCancel, select as pSelect, spinner as spinnerC } from '@clack/prompts'
import { Table } from '@sauber/table'
import { greaterOrEqual, parse } from '@std/semver'
// Native fetch is available in Node.js >= 18
import pack from '../../package.json'
import { check2FAComplianceForApp, checkAppExistsAndHasPermissionOrgErr } from '../api/app'
import { calcKeyId, encryptChecksum, encryptChecksumV3, encryptSource, generateSessionKey } from '../api/crypto'
import { checkAlerts } from '../api/update'
import { getChecksum } from '../checksum'
import { getRepoStarStatus, isRepoStarredInSession, starRepository } from '../github'
import { confirmWithRememberedChoice } from '../promptPreferences'
import { showReplicationProgress } from '../replicationProgress'
import { baseKeyV2, BROTLI_MIN_UPDATER_VERSION_V5, BROTLI_MIN_UPDATER_VERSION_V6, BROTLI_MIN_UPDATER_VERSION_V7, canPromptInteractively, checkChecksum, checkCompatibilityCloud, checkPlanValidUpload, checkRemoteCliMessages, createSupabaseClient, deletedFailedVersion, findRoot, findSavedKey, formatError, getAppId, getBundleVersion, getCompatibilityDetails, getConfig, getInstalledVersion, getLocalConfig, getLocalDependencies, getOrganizationId, getPMAndCommand, getRemoteFileConfig, hasOrganizationPerm, isCompatible, isDeprecatedPluginVersion, OrganizationPerm, regexSemver, sendEvent, updateConfigUpdater, updateOrCreateChannel, updateOrCreateVersion, UPLOAD_TIMEOUT, uploadTUS, uploadUrl, verifyUser, zipFile } from '../utils'
import { getVersionSuggestions, interactiveVersionBump } from '../versionHelpers'
import { checkIndexPosition, searchInDirectory } from './check'
import { prepareBundlePartialFiles, uploadPartial } from './partial'

type SupabaseType = Awaited<ReturnType<typeof createSupabaseClient>>
type pmType = ReturnType<typeof getPMAndCommand>
type localConfigType = Awaited<ReturnType<typeof getLocalConfig>>

export type { UploadBundleResult }

function uploadFail(message: string): never {
  log.error(message)
  throw new Error(message)
}

/**
 * Display a compatibility table for the given packages
 */
function displayCompatibilityTable(packages: Compatibility[]) {
  const table = new Table()
  table.headers = ['Package', 'Local', 'Remote', 'Status', 'Details']
  table.theme = Table.roundTheme
  table.rows = []

  for (const entry of packages) {
    const { name, localVersion, remoteVersion } = entry
    const details = getCompatibilityDetails(entry)
    const statusSymbol = details.compatible ? '✅' : '❌'
    table.rows.push([
      name,
      localVersion || '-',
      remoteVersion || '-',
      statusSymbol,
      details.message,
    ])
  }

  log.info(table.toString())
}

async function getBundle(config: CapacitorConfig, options: OptionsUpload) {
  const pkgVersion = getBundleVersion('', options.packageJson)
  // create bundle name format : 1.0.0-beta.x where x is a uuid
  const bundle = options.bundle
    || config?.plugins?.CapacitorUpdater?.version
    || pkgVersion
    || `0.0.1-beta.${randomUUID().split('-')[0]}`

  if (!regexSemver.test(bundle)) {
    uploadFail(`Your bundle name ${bundle}, is not valid it should follow semver convention : https://semver.org/`)
  }

  return bundle
}

function getApikey(options: OptionsUpload) {
  const apikey = options.apikey || findSavedKey()
  if (!apikey) {
    uploadFail('Missing API key, you need to provide an API key to upload your bundle')
  }

  return apikey
}

function getAppIdAndPath(appId: string | undefined, options: OptionsUpload, config: CapacitorConfig) {
  const finalAppId = getAppId(appId, config)
  const path = options.path || config?.webDir

  if (!finalAppId) {
    uploadFail('Missing argument, you need to provide a appid or be in a capacitor project')
  }
  if (!path) {
    uploadFail('Missing argument, you need to provide a path (--path), or be in a capacitor project')
  }

  if (!existsSync(path)) {
    uploadFail(`Path ${path} does not exist, build your app first, or provide a valid path`)
  }

  return { appid: finalAppId, path }
}

function checkNotifyAppReady(options: OptionsUpload, path: string) {
  const checkNotifyAppReady = options.codeCheck

  if (typeof checkNotifyAppReady === 'undefined' || checkNotifyAppReady) {
    const isPluginConfigured = searchInDirectory(path, 'notifyAppReady')
    if (!isPluginConfigured) {
      uploadFail(`notifyAppReady() is missing in the build folder of your app. see: https://capgo.app/docs/plugin/api/#notifyappready
      If you are sure your app has this code, you can use the --no-code-check option`)
    }
    const foundIndex = checkIndexPosition(path)
    if (!foundIndex) {
      uploadFail(`index.html is missing in the root folder of ${path}`)
    }
  }
}

async function verifyCompatibility(supabase: SupabaseType, pm: pmType, options: OptionsUpload, channel: string, appid: string, bundle: string) {
  // Check compatibility here
  const ignoreMetadataCheck = options.ignoreMetadataCheck
  const autoMinUpdateVersion = options.autoMinUpdateVersion
  let minUpdateVersion = options.minUpdateVersion

  const { data: channelData, error: channelError } = await supabase
    .from('channels')
    .select('disable_auto_update, version ( min_update_version, native_packages )')
    .eq('name', channel)
    .eq('app_id', appid)
    .single()

  const updateMetadataRequired = !!channelData && channelData.disable_auto_update === 'version_number'

  let localDependencies: Awaited<ReturnType<typeof getLocalDependencies>> | undefined
  let finalCompatibility: Awaited<ReturnType<typeof checkCompatibilityCloud>>['finalCompatibility']

  // We only check compatibility IF the channel exists
  if (!channelError && channelData && channelData.version && (channelData.version as any).native_packages && !ignoreMetadataCheck) {
    const spinner = spinnerC()
    spinner.start(`Checking bundle compatibility with channel ${channel}`)
    const {
      finalCompatibility: finalCompatibilityWithChannel,
      localDependencies: localDependenciesWithChannel,
    } = await checkCompatibilityCloud(supabase, appid, channel, options.packageJson, options.nodeModules)

    finalCompatibility = finalCompatibilityWithChannel
    localDependencies = localDependenciesWithChannel

    // Check if any package is incompatible
    const incompatiblePackages = finalCompatibility.filter(x => !isCompatible(x))
    if (incompatiblePackages.length > 0) {
      spinner.error(`Bundle NOT compatible with ${channel} channel`)
      log.warn('')
      displayCompatibilityTable(finalCompatibility)
      log.warn('')
      log.warn('An app store update may be required for these changes to take effect.')

      if (autoMinUpdateVersion) {
        minUpdateVersion = bundle
        log.info(`Auto set min-update-version to ${minUpdateVersion}`)
      }
    }
    else if (autoMinUpdateVersion) {
      try {
        const { min_update_version: lastMinUpdateVersion } = channelData.version as any
        if (!lastMinUpdateVersion || !regexSemver.test(lastMinUpdateVersion))
          uploadFail('Invalid remote min update version, skipping auto setting compatibility')

        minUpdateVersion = lastMinUpdateVersion
        spinner.stop(`Auto set min-update-version to ${minUpdateVersion}`)
      }
      catch {
        uploadFail(`Cannot auto set compatibility, invalid data ${channelData}`)
      }
    }
    else {
      spinner.stop(`Bundle compatible with ${channel} channel`)
    }
  }
  else if (!ignoreMetadataCheck) {
    log.warn(`Channel ${channel} is new or it's your first upload with compatibility check, it will be ignored this time`)
    localDependencies = await getLocalDependencies(options.packageJson, options.nodeModules)

    if (autoMinUpdateVersion) {
      minUpdateVersion = bundle
      log.info(`Auto set min-update-version to ${minUpdateVersion}`)
    }
  }

  if (updateMetadataRequired && !minUpdateVersion && !ignoreMetadataCheck) {
    uploadFail('You need to provide a min-update-version to upload a bundle to this channel')
  }

  if (minUpdateVersion) {
    if (!regexSemver.test(minUpdateVersion))
      uploadFail(`Your minimal version update ${minUpdateVersion}, is not valid it should follow semver convention : https://semver.org/`)
  }

  const hashedLocalDependencies = localDependencies
    ? new Map(localDependencies
        .filter(a => !!a.native && a.native !== undefined)
        .map(a => [a.name, a]))
    : new Map()

  // Include platform checksums in native_packages for precise change detection
  const nativePackages = (hashedLocalDependencies.size > 0 || !options.ignoreMetadataCheck)
    ? Array.from(hashedLocalDependencies, ([name, value]) => ({
        name,
        version: value.version,
        ...(value.ios_checksum && { ios_checksum: value.ios_checksum }),
        ...(value.android_checksum && { android_checksum: value.android_checksum }),
      }))
    : undefined

  return { nativePackages, minUpdateVersion }
}

async function checkVersionExists(supabase: SupabaseType, appid: string, bundle: string, versionExistsOk = false, interactive = false): Promise<boolean | string> {
  // check if app already exist
  const { data: appVersion, error: appVersionError } = await supabase
    .rpc('exist_app_versions', { appid, name_version: bundle })
    .single()

  if (appVersion || appVersionError) {
    if (versionExistsOk) {
      log.warn(`Version ${bundle} already exists - exiting gracefully due to --silent-fail option`)
      outro('Bundle version already exists - exiting gracefully 🎉')
      return true
    }

    // Interactive mode - offer to bump version
    if (interactive) {
      log.error(`❌ Version ${bundle} already exists`)

      const suggestions = getVersionSuggestions(bundle)
      log.info(`💡 Here are some suggestions:`)
      suggestions.forEach((suggestion, idx) => {
        log.info(`   ${idx + 1}. ${suggestion}`)
      })

      const choice = await pSelect({
        message: 'What would you like to do?',
        options: [
          { value: 'suggest1', label: `Use ${suggestions[0]}` },
          { value: 'suggest2', label: `Use ${suggestions[1]}` },
          { value: 'suggest3', label: `Use ${suggestions[2]}` },
          { value: 'suggest4', label: `Use ${suggestions[3]}` },
          { value: 'custom', label: 'Enter a custom version' },
          { value: 'cancel', label: 'Cancel upload' },
        ],
      })

      if (pIsCancel(choice) || choice === 'cancel') {
        uploadFail('Upload cancelled by user')
      }

      let newVersion: string
      if (choice === 'custom') {
        const customVersion = await interactiveVersionBump(bundle, 'upload')
        if (!customVersion) {
          uploadFail('Upload cancelled by user')
        }
        newVersion = customVersion
      }
      else {
        const suggestionIndex = Number.parseInt(choice.replace('suggest', '')) - 1
        newVersion = suggestions[suggestionIndex]
      }

      log.info(`🔄 Retrying with new version: ${newVersion}`)
      return newVersion // Return the new version to retry with
    }

    uploadFail(`Version ${bundle} already exists ${formatError(appVersionError)}`)
  }

  return false
}

async function prepareBundleFile(path: string, options: OptionsUpload, apikey: string, orgId: string, appid: string, maxUploadLength: number, alertUploadSize: number, publicKeyFromConfig?: string) {
  let ivSessionKey
  let sessionKey
  let checksum = ''
  let zipped: Buffer | null = null
  let encryptionMethod = 'none' as 'none' | 'v2' | 'v1'
  let finalKeyData = ''
  let keyId = ''
  const keyV2 = options.keyV2
  const noKey = options.key === false

  const s = spinnerC()
  s.start(`Zipping bundle from ${path}`)
  zipped = await zipFile(path)
  s.message(`Calculating checksum`)
  const root = findRoot(cwd())
  const updaterVersion = await getInstalledVersion('@capgo/capacitor-updater', root, options.packageJson)
  let useSha256 = false
  let coerced
  try {
    coerced = updaterVersion ? parse(updaterVersion) : undefined
  }
  catch {
    coerced = undefined
  }
  if (!updaterVersion) {
    uploadFail('Cannot find @capgo/capacitor-updater in node_modules, please install it first with your package manager')
  }
  else if (coerced) {
    // Use SHA256 for v5.10.0+, v6.25.0+ and v7.0.30+
    useSha256 = !isDeprecatedPluginVersion(coerced, BROTLI_MIN_UPDATER_VERSION_V5, BROTLI_MIN_UPDATER_VERSION_V6, BROTLI_MIN_UPDATER_VERSION_V7)
  }
  else if (updaterVersion === 'link:@capgo/capacitor-updater' || updaterVersion === 'file:..' || updaterVersion === 'file:../') {
    log.warn('Using local @capgo/capacitor-updater. Assuming latest version for checksum calculation.')
    useSha256 = true
  }
  const forceCrc32 = options.forceCrc32Checksum === true
  const shouldUseSha256 = !forceCrc32 && (((keyV2 || options.keyDataV2 || existsSync(baseKeyV2)) && !noKey) || useSha256)
  checksum = await getChecksum(zipped, shouldUseSha256 ? 'sha256' : 'crc32')
  s.stop(`Checksum ${shouldUseSha256 ? 'SHA256' : 'CRC32'}${forceCrc32 ? ' (forced)' : ''}: ${checksum}`)
  // key should be undefined or a string if false it should ignore encryption DO NOT REPLACE key === false With !key it will not work
  if (noKey) {
    log.info(`Encryption ignored`)
  }
  else if ((keyV2 || existsSync(baseKeyV2) || options.keyDataV2) && !options.oldEncryption) {
    const privateKey = typeof keyV2 === 'string' ? keyV2 : baseKeyV2
    let keyDataV2 = options.keyDataV2 || ''
    if (!keyDataV2 && !existsSync(privateKey))
      uploadFail(`Cannot find private key ${privateKey}`)
    await sendEvent(apikey, {
      channel: 'app',
      event: 'App encryption v2',
      icon: '🔑',
      user_id: orgId,
      tags: {
        'app-id': appid,
      },
      notify: false,
    }, options.verbose)
    if (!keyDataV2) {
      const keyFile = readFileSync(privateKey)
      keyDataV2 = keyFile.toString()
    }
    // Use V3 encryption for new plugin versions (5.30.0+, 6.30.0+, 7.30.0+)
    const supportsV3Checksum = coerced && !isDeprecatedPluginVersion(coerced, '5.30.0', '6.30.0', '7.30.0')
    log.info(`Encrypting your bundle with ${supportsV3Checksum ? 'V3' : 'V2'}`)
    const { sessionKey: sKey, ivSessionKey: ivKey } = generateSessionKey(keyDataV2)
    const encryptedData = encryptSource(zipped, sKey, ivKey)
    checksum = supportsV3Checksum
      ? encryptChecksumV3(checksum, keyDataV2)
      : encryptChecksum(checksum, keyDataV2)
    ivSessionKey = ivKey
    sessionKey = sKey
    encryptionMethod = 'v2'
    finalKeyData = keyDataV2
    // Calculate key_id from the public key in capacitor config
    // This matches the key_id sent by devices for verification
    if (publicKeyFromConfig) {
      keyId = calcKeyId(publicKeyFromConfig)
      if (options.verbose) {
        log.info(`[Verbose] Encryption key_id: ${keyId}`)
      }
    }
    if (options.displayIvSession) {
      log.info(`Your Iv Session key is ${ivSessionKey},
    keep it safe, you will need it to decrypt your bundle.
    It will be also visible in your dashboard\n`)
    }
    zipped = encryptedData
  }
  const mbSize = Math.floor((zipped?.byteLength ?? 0) / 1024 / 1024)
  const mbSizeMax = Math.floor(maxUploadLength / 1024 / 1024)
  if (zipped?.byteLength > maxUploadLength) {
    uploadFail(`The bundle size is ${mbSize} Mb, this is greater than the maximum upload length ${mbSizeMax} Mb, please reduce the size of your bundle`)
  }
  else if (zipped?.byteLength > alertUploadSize) {
    log.warn(`WARNING !!\nThe bundle size is ${mbSize} Mb, this may take a while to download for users\n`)
    log.info(`Learn how to optimize your assets https://capgo.app/blog/optimise-your-images-for-updates/\n`)

    if (options.verbose) {
      log.info(`[Verbose] Bundle size details:`)
      log.info(`  - Actual size: ${mbSize} MB (${zipped?.byteLength} bytes)`)
      log.info(`  - Alert threshold: ${Math.floor(alertUploadSize / 1024 / 1024)} MB`)
      log.info(`  - Maximum allowed: ${mbSizeMax} MB`)
      log.info(`[Verbose] Sending 'App Too Large' event to analytics...`)
    }

    await sendEvent(apikey, {
      channel: 'app-error',
      event: 'App Too Large',
      icon: '🚛',
      user_id: orgId,
      tags: {
        'app-id': appid,
      },
      notify: false,
    }, options.verbose)

    if (options.verbose)
      log.info(`[Verbose] Event sent successfully`)
  }
  else if (options.verbose) {
    log.info(`[Verbose] Bundle size OK: ${mbSize} MB (under ${Math.floor(alertUploadSize / 1024 / 1024)} MB alert threshold)`)
  }

  if (options.verbose)
    log.info(`[Verbose] Bundle preparation complete, returning bundle data`)

  return { zipped, ivSessionKey, sessionKey, checksum, encryptionMethod, finalKeyData, keyId }
}

async function uploadBundleToCapgoCloud(apikey: string, supabase: SupabaseType, appid: string, bundle: string, orgId: string, zipped: Buffer, options: OptionsUpload, tusChunkSize: number) {
  const spinner = spinnerC()
  spinner.start(`Uploading Bundle`)
  const startTime = performance.now()
  let isTus = false

  if (options.verbose) {
    log.info(`[Verbose] uploadBundleToCapgoCloud called:`)
    log.info(`  - Bundle size: ${Math.floor(zipped.byteLength / 1024)} KB`)
    log.info(`  - App ID: ${appid}`)
    log.info(`  - Bundle version: ${bundle}`)
    log.info(`  - Chunk size: ${Math.floor(tusChunkSize / 1024 / 1024)} MB`)
  }

  if (options.dryUpload) {
    spinner.stop(`Dry run, bundle not uploaded\nBundle uploaded 💪 in 0 seconds`)
    if (options.verbose)
      log.info(`[Verbose] Dry upload mode - skipping actual upload`)
    return
  }

  try {
    const localConfig = await getLocalConfig()
    if (options.verbose)
      log.info(`[Verbose] Local config retrieved for upload`)

    if ((options.multipart !== undefined && options.multipart) || (options.tus !== undefined && options.tus)) {
      if (options.multipart) {
        log.info(`Uploading bundle with multipart is deprecated, we upload with TUS instead`)
      }
      else {
        log.info(`Uploading bundle with TUS protocol`)
      }

      if (options.verbose) {
        log.info(`[Verbose] Starting TUS resumable upload...`)
        log.info(`  - Host: ${localConfig.hostWeb}`)
        log.info(`  - Chunk size: ${Math.floor(tusChunkSize / 1024 / 1024)} MB`)
      }

      await uploadTUS(apikey, zipped, orgId, appid, bundle, spinner, localConfig, tusChunkSize)
      isTus = true

      if (options.verbose)
        log.info(`[Verbose] TUS upload completed, updating database with R2 path...`)

      const filePath = `orgs/${orgId}/apps/${appid}/${bundle}.zip`
      const { error: changeError } = await supabase
        .from('app_versions')
        .update({ r2_path: filePath })
        .eq('name', bundle)
        .eq('app_id', appid)

      if (changeError) {
        log.error(`Cannot finish TUS upload ${formatError(changeError)}`)
        if (options.verbose)
          log.info(`[Verbose] Database update failed: ${formatError(changeError)}`)
        return Promise.reject(new Error('Cannot finish TUS upload'))
      }

      if (options.verbose)
        log.info(`[Verbose] Database updated with R2 path: ${filePath}`)
    }
    else {
      if (options.verbose)
        log.info(`[Verbose] Using standard upload (non-TUS), getting presigned URL...`)

      const url = await uploadUrl(supabase, appid, bundle)
      if (!url) {
        log.error(`Cannot get upload url`)
        if (options.verbose)
          log.info(`[Verbose] Failed to retrieve presigned upload URL from database`)
        return Promise.reject(new Error('Cannot get upload url'))
      }

      if (options.verbose) {
        log.info(`[Verbose] Presigned URL obtained, uploading via HTTP PUT...`)
        log.info(`  - Timeout: ${options.timeout || UPLOAD_TIMEOUT}ms`)
        log.info(`  - Retry attempts: 5`)
        log.info(`  - Content-Type: application/zip`)
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || UPLOAD_TIMEOUT)

      try {
        const response = await fetch(url, {
          method: 'PUT',
          body: zipped,
          headers: {
            'Content-Type': 'application/zip',
          },
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
      }
      finally {
        clearTimeout(timeoutId)
      }

      if (options.verbose)
        log.info(`[Verbose] HTTP PUT upload completed successfully`)
    }
  }
  catch (errorUpload: any) {
    const endTime = performance.now()
    const uploadTime = ((endTime - startTime) / 1000).toFixed(2)
    spinner.error(`Failed to upload bundle ( after ${uploadTime} seconds)`)

    if (options.verbose) {
      log.info(`[Verbose] Upload failed after ${uploadTime} seconds`)
      log.info(`[Verbose] Error type: ${errorUpload instanceof Error ? 'Error' : typeof errorUpload}`)
    }

    if (errorUpload instanceof Error && errorUpload.message.includes('HTTP error')) {
      try {
        const statusMatch = errorUpload.message.match(/status: (\d+)/)
        const status = statusMatch ? statusMatch[1] : 'unknown'
        log.error(`Upload failed with status ${status}: ${errorUpload.message}`)
      }
      catch {
        log.error(`Upload failed: ${errorUpload.message}`)
      }
    }
    else {
      if (options.verbose)
        log.info(`[Verbose] Non-HTTP error: ${formatError(errorUpload)}`)

      if (!options.tus) {
        log.error(`Cannot upload bundle ( try again with --tus option) ${formatError(errorUpload)}`)
      }
      else {
        log.error(`Cannot upload bundle please contact support if the issue persists ${formatError(errorUpload)}`)
      }
    }

    if (options.verbose)
      log.info(`[Verbose] Cleaning up failed version from database...`)

    // call delete version on path /delete_failed_version to delete the version
    await deletedFailedVersion(supabase, appid, bundle)

    if (options.verbose)
      log.info(`[Verbose] Failed version cleaned up`)

    throw errorUpload instanceof Error ? errorUpload : new Error(String(errorUpload))
  }

  const endTime = performance.now()
  const uploadTime = ((endTime - startTime) / 1000).toFixed(2)
  spinner.stop(`Bundle uploaded 💪 in (${uploadTime} seconds)`)

  if (options.verbose) {
    log.info(`[Verbose] Upload successful:`)
    log.info(`  - Upload time: ${uploadTime} seconds`)
    log.info(`  - Upload method: ${isTus ? 'TUS (resumable)' : 'Standard HTTP PUT'}`)
    log.info(`  - Bundle size: ${Math.floor(zipped.byteLength / 1024)} KB`)
    log.info(`[Verbose] Sending performance event...`)
  }

  await sendEvent(apikey, {
    channel: 'performance',
    event: isTus ? 'TUS upload zip performance' : 'Upload zip performance',
    icon: '🚄',
    user_id: orgId,
    tags: {
      'app-id': appid,
      'time': uploadTime,
    },
    notify: false,
  }, options.verbose)

  if (options.verbose)
    log.info(`[Verbose] Performance event sent successfully`)
}

// It is really important that his function never terminates the program, it should always return, even if it fails
async function deleteLinkedBundleOnUpload(supabase: SupabaseType, appid: string, channel: string) {
  const { data, error } = await supabase
    .from('channels')
    .select('version ( id, name, deleted )')
    .eq('app_id', appid)
    .eq('name', channel)

  if (error) {
    log.error(`Cannot delete linked bundle on upload ${formatError(error)}`)
    return
  }

  if (data.length === 0) {
    log.warn('No linked bundle found in the channel you are trying to upload to')
    return
  }

  const version = data[0].version
  if (version.deleted) {
    log.warn('The linked bundle is already deleted')
    return
  }

  const { error: deleteError } = await supabase
    .from('app_versions')
    .update({ deleted: true })
    .eq('id', version.id)

  if (deleteError) {
    log.error(`Cannot delete linked bundle on upload ${formatError(deleteError)}`)
    return
  }

  log.info('Linked bundle deleted')
}

async function setVersionInChannel(
  supabase: SupabaseType,
  apikey: string,
  displayBundleUrl: boolean,
  bundle: string,
  channel: string,
  userId: string,
  orgId: string,
  appid: string,
  localConfig: localConfigType,
  selfAssign?: boolean,
) {
  const { data: versionId } = await supabase
    .rpc('get_app_versions', { apikey, name_version: bundle, appid })
    .single()

  if (!versionId)
    uploadFail('Cannot get version id, cannot set channel')

  const { data: apiAccess } = await supabase
    .rpc('is_allowed_capgkey', { apikey, keymode: ['write', 'all'] })
    .single()

  if (apiAccess) {
    const { error: dbError3, data } = await updateOrCreateChannel(supabase, {
      name: channel,
      app_id: appid,
      created_by: userId,
      version: versionId,
      owner_org: orgId,
      ...(selfAssign ? { allow_device_self_set: true } : {}),
    })
    if (dbError3)
      uploadFail(`Cannot set channel, the upload key is not allowed to do that, use the "all" for this. ${formatError(dbError3)}`)
    const bundleUrl = `${localConfig.hostWeb}/app/${appid}/channel/${data.id}`
    if (data?.public)
      log.info('Your update is now available in your public channel 🎉')
    else if (data?.id)
      log.info(`Link device to this bundle to try it: ${bundleUrl}`)

    if (displayBundleUrl)
      log.info(`Bundle url: ${bundleUrl}`)
  }
  else {
    log.warn('The upload key is not allowed to set the version in the channel')
  }
}

export async function getDefaultUploadChannel(appId: string, supabase: SupabaseType, hostWeb: string) {
  const { error, data } = await supabase.from('apps')
    .select('default_upload_channel')
    .eq('app_id', appId)
    .single()

  if (error) {
    log.warn('Cannot find default upload channel')
    log.info(`You can set it here:  ${hostWeb}/app/${appId}/info`)
    return null
  }

  return data.default_upload_channel
}

export async function uploadBundleInternal(preAppid: string, options: OptionsUpload, silent = false): Promise<UploadBundleResult> {
  if (!silent)
    intro(`Uploading with CLI version ${pack.version}`)
  let sessionKey: Buffer | undefined
  const pm = getPMAndCommand()
  await checkAlerts()

  const { s3Region, s3Apikey, s3Apisecret, s3BucketName, s3Endpoint, s3Port, s3SSL } = options

  if (options.verbose) {
    log.info(`[Verbose] Starting upload process with options:`)
    log.info(`  - API key: ${options.apikey ? 'provided' : 'from saved key'}`)
    log.info(`  - Path: ${options.path || 'from capacitor config'}`)
    log.info(`  - Channel: ${options.channel || 'from default upload channel'}`)
    log.info(`  - Bundle: ${options.bundle || 'auto-detected'}`)
    log.info(`  - External: ${options.external || 'false'}`)
    log.info(`  - Encryption: ${options.keyV2 || options.keyDataV2 ? 'v2' : options.key === false ? 'disabled' : 'auto'}`)
    log.info(`  - Upload method: ${options.tus ? 'TUS' : options.zip ? 'ZIP' : 'auto'}`)
    log.info(`  - Delta updates: ${options.delta || options.partial ? 'enabled' : 'disabled'}`)
  }

  const apikey = getApikey(options)
  if (options.verbose)
    log.info(`[Verbose] API key retrieved successfully`)

  const extConfig = await getConfig()
  if (options.verbose)
    log.info(`[Verbose] Capacitor config loaded successfully`)

  // Check if directUpdate is enabled and auto-enable delta updates
  const directUpdateEnabled = extConfig?.config?.plugins?.CapacitorUpdater?.directUpdate === 'always'
  const interactive = canPromptInteractively({ silent })
  if (directUpdateEnabled && options.delta === undefined) {
    if (interactive) {
      log.info('💡 Direct Update (instant updates) is enabled in your config')
      log.info('   Delta updates send only changed files instead of the full bundle')
      const enableDelta = await pConfirm({
        message: 'Enable delta updates for this upload? (Recommended with Direct Update)',
        initialValue: true,
      })
      if (!pIsCancel(enableDelta) && enableDelta) {
        options.delta = true
        if (options.verbose)
          log.info(`[Verbose] Delta updates auto-enabled due to Direct Update configuration`)
      }
    }
    else if (!silent) {
      // Non-interactive mode (CI/CD): auto-enable unless explicitly disabled
      if (options.delta !== false) {
        options.delta = true
        if (options.verbose)
          log.info(`[Verbose] Delta updates auto-enabled in CI/CD mode due to Direct Update configuration`)
      }
    }
  }

  const fileConfig = await getRemoteFileConfig()
  if (options.verbose) {
    log.info(`[Verbose] Remote file config retrieved:`)
    log.info(`  - Max upload length: ${Math.floor(fileConfig.maxUploadLength / 1024 / 1024)} MB`)
    log.info(`  - Alert upload size: ${Math.floor(fileConfig.alertUploadSize / 1024 / 1024)} MB`)
    log.info(`  - TUS upload: ${fileConfig.TUSUpload ? 'enabled' : 'disabled'}`)
    log.info(`  - TUS upload forced: ${fileConfig.TUSUploadForced ? 'yes' : 'no'}`)
    log.info(`  - Partial upload: ${fileConfig.partialUpload ? 'enabled' : 'disabled'}`)
    log.info(`  - Max chunk size: ${Math.floor(fileConfig.maxChunkSize / 1024 / 1024)} MB`)
  }

  const { appid, path } = getAppIdAndPath(preAppid, options, extConfig.config)
  if (options.verbose)
    log.info(`[Verbose] App ID: ${appid}, Build path: ${path}`)

  const bundle = await getBundle(extConfig.config, options)
  if (options.verbose)
    log.info(`[Verbose] Bundle version: ${bundle}`)

  const defaultStorageProvider: Exclude<UploadBundleResult['storageProvider'], undefined> = options.external ? 'external' : 'r2-direct'
  let encryptionMethod: UploadBundleResult['encryptionMethod'] = 'none'

  if (options.autoSetBundle) {
    await updateConfigUpdater({ version: bundle })
    if (options.verbose)
      log.info(`[Verbose] Auto-set bundle version in capacitor.config.json`)
  }

  checkNotifyAppReady(options, path)
  if (options.verbose)
    log.info(`[Verbose] Code check passed (notifyAppReady found and index.html present)`)

  log.info(`Upload ${appid}@${bundle} started from path "${path}" to Capgo cloud`)

  const localConfig = await getLocalConfig()
  if (options.verbose)
    log.info(`[Verbose] Local config loaded: host=${localConfig.hostWeb}`)

  if (options.supaHost && options.supaAnon) {
    log.info('Using custom supabase instance from provided options')
    localConfig.supaHost = options.supaHost
    localConfig.supaKey = options.supaAnon
    if (options.verbose)
      log.info(`[Verbose] Custom Supabase host: ${options.supaHost}`)
  }

  const supabase = await createSupabaseClient(apikey, options.supaHost, options.supaAnon)
  if (options.verbose)
    log.info(`[Verbose] Supabase client created successfully`)

  // Check 2FA compliance early to give a clear error message
  await check2FAComplianceForApp(supabase, appid, silent)

  const userId = await verifyUser(supabase, apikey, ['write', 'all', 'upload'])
  if (options.verbose)
    log.info(`[Verbose] User verified successfully, user_id: ${userId}`)

  const channel = options.channel || await getDefaultUploadChannel(appid, supabase, localConfig.hostWeb) || 'production'
  if (options.verbose)
    log.info(`[Verbose] Target channel: ${channel}`)

  // Now if it does exist we will fetch the org id
  const orgId = await getOrganizationId(supabase, appid)
  if (options.verbose)
    log.info(`[Verbose] Organization ID: ${orgId}`)

  await checkRemoteCliMessages(supabase, orgId, pack.version)
  if (options.verbose)
    log.info(`[Verbose] Remote CLI messages checked`)

  await checkPlanValidUpload(supabase, orgId, apikey, appid, true)
  if (options.verbose)
    log.info(`[Verbose] Plan validation passed`)
  if (options.verbose)
    log.info(`[Verbose] Trial check completed`)

  if (options.verbose)
    log.info(`[Verbose] Checking compatibility with channel ${channel}...`)

  const { nativePackages, minUpdateVersion } = await verifyCompatibility(supabase, pm, options, channel, appid, bundle)
  if (options.verbose) {
    log.info(`[Verbose] Compatibility check completed:`)
    log.info(`  - Native packages: ${nativePackages ? nativePackages.length : 0}`)
    log.info(`  - Min update version: ${minUpdateVersion || 'none'}`)
  }

  if (options.verbose)
    log.info(`[Verbose] Checking if version ${bundle} already exists...`)

  // Enable interactive mode only when TTY is available
  const versionExistsResult = await checkVersionExists(supabase, appid, bundle, options.versionExistsOk, interactive)

  if (options.verbose)
    log.info(`[Verbose] Version exists check: ${versionExistsResult ? (typeof versionExistsResult === 'string' ? `retry with ${versionExistsResult}` : 'yes (skipping)') : 'no (continuing)'}`)

  // If version exists and we got a boolean true, skip
  if (versionExistsResult === true) {
    return {
      success: true,
      skipped: true,
      reason: 'VERSION_EXISTS',
      bundle,
      checksum: null,
      encryptionMethod,
      storageProvider: defaultStorageProvider,
    }
  }

  // If we got a new version string, retry with that version
  if (typeof versionExistsResult === 'string') {
    log.info(`Retrying upload with new version: ${versionExistsResult}`)
    return uploadBundleInternal(preAppid, { ...options, bundle: versionExistsResult }, silent)
  }

  if (options.external && !options.external.startsWith('https://')) {
    uploadFail(`External link should should start with "https://" current is "${options.external}"`)
  }

  if (options.deleteLinkedBundleOnUpload) {
    log.warn('Deleting linked bundle on upload is destructive, it will delete the currently linked bundle in the channel you are trying to upload to.')
    log.warn('Please make sure you want to do this, if you are not sure, please do not use this option.')
  }

  const versionData = {
    name: bundle,
    app_id: appid,
    session_key: undefined as undefined | string,
    external_url: options.external,
    storage_provider: defaultStorageProvider,
    min_update_version: minUpdateVersion,
    native_packages: nativePackages,
    owner_org: orgId,
    user_id: userId,
    checksum: undefined as undefined | string,
    link: options.link || null,
    comment: options.comment || null,
    key_id: undefined as undefined | string,
    cli_version: pack.version,
  } as Database['public']['Tables']['app_versions']['Insert']

  let zipped: Buffer | null = null
  let finalKeyData = ''
  if (!options.external) {
    if (options.verbose)
      log.info(`[Verbose] Preparing bundle file from path: ${path}`)

    const publicKeyFromConfig = extConfig.config?.plugins?.CapacitorUpdater?.publicKey
    const { zipped: _zipped, ivSessionKey, checksum, sessionKey: sk, encryptionMethod: em, finalKeyData: fkd, keyId } = await prepareBundleFile(path, options, apikey, orgId, appid, fileConfig.maxUploadLength, fileConfig.alertUploadSize, publicKeyFromConfig)
    versionData.session_key = ivSessionKey
    versionData.checksum = checksum
    versionData.key_id = keyId || undefined
    sessionKey = sk
    zipped = _zipped
    encryptionMethod = em
    finalKeyData = fkd

    if (options.verbose) {
      log.info(`[Verbose] Bundle prepared:`)
      log.info(`  - Size: ${Math.floor((_zipped?.byteLength ?? 0) / 1024)} KB`)
      log.info(`  - Checksum: ${checksum}`)
      log.info(`  - Encryption: ${em}`)
      log.info(`  - IV Session Key: ${ivSessionKey ? 'present' : 'none'}`)
      log.info(`  - Key ID: ${keyId || 'none'}`)
    }

    if (!options.ignoreChecksumCheck) {
      if (options.verbose)
        log.info(`[Verbose] Checking for duplicate checksum...`)
      await checkChecksum(supabase, appid, channel, checksum)
      if (options.verbose)
        log.info(`[Verbose] Checksum is unique`)
    }
  }
  else {
    if (options.verbose)
      log.info(`[Verbose] Using external URL: ${options.external}`)

    await sendEvent(apikey, {
      channel: 'app',
      event: 'App external',
      icon: '📤',
      user_id: orgId,
      tags: {
        'app-id': appid,
      },
      notify: false,
    }, options.verbose)
    versionData.session_key = options.ivSessionKey
    versionData.checksum = options.encryptedChecksum

    if (options.verbose) {
      log.info(`[Verbose] External bundle configured:`)
      log.info(`  - URL: ${options.external}`)
      log.info(`  - IV Session Key: ${options.ivSessionKey ? 'provided' : 'none'}`)
      log.info(`  - Encrypted Checksum: ${options.encryptedChecksum ? 'provided' : 'none'}`)
    }
  }

  if (options.zip) {
    options.tus = false
    if (options.verbose)
      log.info(`[Verbose] Upload method: ZIP (explicitly set via --zip)`)
  }
  // ALLOW TO OVERRIDE THE FILE CONFIG WITH THE OPTIONS IF THE FILE CONFIG IS FORCED
  else if (!fileConfig.TUSUpload || options.external) {
    options.tus = false
    if (options.verbose)
      log.info(`[Verbose] Upload method: Standard (TUS not available or external URL)`)
  }
  else {
    options.tus = options.tus || fileConfig.TUSUploadForced
    if (options.verbose)
      log.info(`[Verbose] Upload method: ${options.tus ? 'TUS (resumable)' : 'Standard'}`)
  }
  if (!fileConfig.partialUpload || options.external) {
    options.delta = false
    if (options.verbose && options.external)
      log.info(`[Verbose] Delta updates disabled (not available with external URLs)`)
  }
  else {
    options.delta = options.delta || options.partial || options.deltaOnly || options.partialOnly || fileConfig.partialUploadForced
    if (options.verbose)
      log.info(`[Verbose] Delta updates: ${options.delta ? 'enabled' : 'disabled'}`)
  }

  if (options.encryptPartial && encryptionMethod === 'v1')
    uploadFail('You cannot encrypt the partial update if you are not using the v2 encryption method')

  // Minimum versions that support hex checksum format
  const HEX_CHECKSUM_MIN_VERSION_V5 = '5.30.0'
  const HEX_CHECKSUM_MIN_VERSION_V6 = '6.30.0'
  const HEX_CHECKSUM_MIN_VERSION_V7 = '7.30.0'

  // Check if updater supports hex checksum format
  let supportsHexChecksum = false

  // Auto-encrypt partial updates for updater versions > 6.14.5 if encryption method is v2
  if (options.delta && encryptionMethod === 'v2' && !options.encryptPartial) {
    // Check updater version
    const root = findRoot(cwd())
    const updaterVersion = await getInstalledVersion('@capgo/capacitor-updater', root, options.packageJson)
    let coerced
    try {
      coerced = updaterVersion ? parse(updaterVersion) : undefined
    }
    catch {
      coerced = undefined
    }

    if (updaterVersion && coerced && greaterOrEqual(coerced, parse('6.14.4'))) {
      log.info(`Auto-enabling partial update encryption for updater version ${coerced} (> 6.14.4)`)
      if (options.verbose)
        log.info(`[Verbose] Partial encryption auto-enabled for updater >= 6.14.4`)
      options.encryptPartial = true
    }
  }

  // Check if updater supports hex checksum format (for delta updates with encryption)
  if (options.delta && (options.encryptPartial || encryptionMethod === 'v2')) {
    const root = findRoot(cwd())
    const updaterVersion = await getInstalledVersion('@capgo/capacitor-updater', root, options.packageJson)
    let coerced
    try {
      coerced = updaterVersion ? parse(updaterVersion) : undefined
    }
    catch {
      coerced = undefined
    }

    if (updaterVersion && coerced) {
      // Hex checksum is supported in versions >= 5.30.0, 6.30.0, 7.30.0
      supportsHexChecksum = !isDeprecatedPluginVersion(coerced, HEX_CHECKSUM_MIN_VERSION_V5, HEX_CHECKSUM_MIN_VERSION_V6, HEX_CHECKSUM_MIN_VERSION_V7)

      if (options.verbose && supportsHexChecksum)
        log.info(`[Verbose] Using hex checksum format for updater version ${coerced}`)
    }
  }

  if (options.verbose && options.delta)
    log.info(`[Verbose] Preparing delta/partial update manifest...`)

  const manifest: manifestType = options.delta ? await prepareBundlePartialFiles(path, apikey, orgId, appid, options.encryptPartial ? encryptionMethod : 'none', finalKeyData, supportsHexChecksum) : []

  if (options.verbose && options.delta)
    log.info(`[Verbose] Delta manifest prepared with ${manifest.length} files`)

  if (options.verbose)
    log.info(`[Verbose] Creating version record in database...`)

  const { error: dbError } = await updateOrCreateVersion(supabase, versionData)
  if (dbError)
    uploadFail(`Cannot add bundle ${formatError(dbError)}`)

  if (options.verbose)
    log.info(`[Verbose] Version record created successfully`)
  if (options.tusChunkSize && options.tusChunkSize > fileConfig.maxChunkSize) {
    log.error(`Chunk size ${options.tusChunkSize} is greater than the maximum chunk size ${fileConfig.maxChunkSize}, using the maximum chunk size`)
    options.tusChunkSize = fileConfig.maxChunkSize
  }
  else if (!options.tusChunkSize) {
    options.tusChunkSize = fileConfig.maxChunkSize
  }

  if (options.verbose)
    log.info(`[Verbose] TUS chunk size: ${Math.floor(options.tusChunkSize / 1024 / 1024)} MB`)

  if (zipped && (s3BucketName || s3Endpoint || s3Region || s3Apikey || s3Apisecret || s3Port || s3SSL)) {
    if (!s3BucketName || !s3Endpoint || !s3Region || !s3Apikey || !s3Apisecret || !s3Port)
      uploadFail('Missing argument, for S3 upload you need to provide a bucket name, endpoint, region, port, API key, and API secret')

    log.info('Uploading to S3')
    if (options.verbose) {
      log.info(`[Verbose] S3 configuration:`)
      log.info(`  - Endpoint: ${s3Endpoint}`)
      log.info(`  - Region: ${s3Region}`)
      log.info(`  - Bucket: ${s3BucketName}`)
      log.info(`  - Port: ${s3Port}`)
      log.info(`  - SSL: ${s3SSL ? 'enabled' : 'disabled'}`)
    }

    const endPoint = s3SSL ? `https://${s3Endpoint}` : `http://${s3Endpoint}`
    const s3Client = new S3Client({
      endPoint: s3Endpoint,
      region: s3Region,
      port: s3Port,
      pathStyle: true,
      bucket: s3BucketName,
      accessKey: s3Apikey,
      secretKey: s3Apisecret,
    })
    const fileName = `${appid}-${bundle}`
    const encodeFileName = encodeURIComponent(fileName)

    if (options.verbose)
      log.info(`[Verbose] Uploading to S3 as: ${fileName}`)

    await s3Client.putObject(fileName, Uint8Array.from(zipped))
    versionData.external_url = `${endPoint}/${encodeFileName}`
    versionData.storage_provider = 'external'

    if (options.verbose)
      log.info(`[Verbose] S3 upload complete, external URL: ${versionData.external_url}`)
  }
  else if (zipped) {
    if (!options.partialOnly && !options.deltaOnly) {
      if (options.verbose)
        log.info(`[Verbose] Starting full bundle upload to Capgo Cloud...`)
      await uploadBundleToCapgoCloud(apikey, supabase, appid, bundle, orgId, zipped, options, options.tusChunkSize)
    }
    else if (options.verbose) {
      log.info(`[Verbose] Skipping full bundle upload (delta-only mode)`)
    }

    let finalManifest: Awaited<ReturnType<typeof uploadPartial>> | null = null
    try {
      if (options.dryUpload) {
        options.delta = false
        if (options.verbose)
          log.info(`[Verbose] Dry upload mode: skipping delta upload`)
      }
      const encryptionData = versionData.session_key && options.encryptPartial && sessionKey
        ? {
            sessionKey,
            ivSessionKey: versionData.session_key,
          }
        : undefined

      if (options.verbose && options.delta) {
        log.info(`[Verbose] Starting delta/partial file upload...`)
        log.info(`  - Manifest entries: ${manifest.length}`)
        log.info(`  - Encryption: ${encryptionData ? 'enabled' : 'disabled'}`)
      }

      finalManifest = options.delta
        ? await uploadPartial(
            apikey,
            manifest,
            path,
            appid,
            orgId,
            encryptionData,
            options,
          )
        : null

      if (options.verbose && finalManifest)
        log.info(`[Verbose] Delta upload complete with ${finalManifest.length} files`)
    }
    catch (err) {
      // If user explicitly requested delta, the error was already thrown by uploadPartial
      // and we should propagate it
      const userRequestedDelta = !!(options.partial || options.delta || options.partialOnly || options.deltaOnly)
      if (userRequestedDelta) {
        // Error already logged in uploadPartial, just re-throw
        throw err
      }

      // Auto-enabled delta that failed - not critical
      log.info(`Failed to upload partial files to capgo cloud. Error: ${formatError(err)}. This is not a critical error, the bundle has been uploaded without the partial files`)
      if (options.verbose)
        log.info(`[Verbose] Delta upload error details: ${formatError(err)}`)
    }

    versionData.storage_provider = 'r2'
    versionData.manifest = finalManifest

    if (options.verbose)
      log.info(`[Verbose] Updating version record with storage provider and manifest...`)

    const { error: dbError2 } = await updateOrCreateVersion(supabase, versionData)
    if (dbError2)
      uploadFail(`Cannot update bundle ${formatError(dbError2)}`)

    if (options.verbose)
      log.info(`[Verbose] Version record updated successfully`)
  }

  // Check we have app access to this appId
  if (options.verbose)
    log.info(`[Verbose] Checking app permissions...`)

  const permissions = await checkAppExistsAndHasPermissionOrgErr(supabase, apikey, appid, OrganizationPerm.upload, false, true)

  if (options.verbose) {
    log.info(`[Verbose] Permissions:`)
    log.info(`  - Upload: ${hasOrganizationPerm(permissions, OrganizationPerm.upload) ? 'yes' : 'no'}`)
    log.info(`  - Write: ${hasOrganizationPerm(permissions, OrganizationPerm.write) ? 'yes' : 'no'}`)
    log.info(`  - Admin: ${hasOrganizationPerm(permissions, OrganizationPerm.admin) ? 'yes' : 'no'}`)
  }

  if (options.deleteLinkedBundleOnUpload && hasOrganizationPerm(permissions, OrganizationPerm.write)) {
    if (options.verbose)
      log.info(`[Verbose] Deleting linked bundle in channel ${channel}...`)
    await deleteLinkedBundleOnUpload(supabase, appid, channel)
  }
  else if (options.deleteLinkedBundleOnUpload) {
    log.warn('Cannot delete linked bundle on upload as a upload organization member')
  }

  if (hasOrganizationPerm(permissions, OrganizationPerm.write)) {
    if (options.verbose)
      log.info(`[Verbose] Setting bundle ${bundle} to channel ${channel}...`)
    await setVersionInChannel(supabase, apikey, !!options.bundleUrl, bundle, channel, userId, orgId, appid, localConfig, options.selfAssign)
    if (options.verbose)
      log.info(`[Verbose] Channel updated successfully`)
  }
  else {
    log.warn('Cannot set channel as a upload organization member')
  }

  if (options.verbose)
    log.info(`[Verbose] Sending upload event...`)

  await sendEvent(apikey, {
    channel: 'app',
    event: 'App Uploaded',
    icon: '⏫',
    user_id: orgId,
    tags: {
      'app-id': appid,
      'bundle': bundle,
    },
    notify: false,
  }, options.verbose)

  await sendEvent(apikey, {
    channel: 'app',
    event: 'Bundle Uploaded',
    icon: '⏫',
    user_id: orgId,
    tags: {
      'app-id': appid,
      'bundle': bundle,
    },
    notify: false,
    notifyConsole: true,
  }).catch(() => {})

  const result: UploadBundleResult = {
    success: true,
    bundle,
    checksum: versionData.checksum ?? null,
    encryptionMethod,
    sessionKey: sessionKey ? sessionKey.toString('base64') : undefined,
    ivSessionKey: typeof versionData.session_key === 'string' ? versionData.session_key : undefined,
    storageProvider: versionData.storage_provider,
  }

  if (options.verbose) {
    log.info(`[Verbose] Upload completed successfully:`)
    log.info(`  - Bundle: ${result.bundle}`)
    log.info(`  - Checksum: ${result.checksum}`)
    log.info(`  - Encryption: ${result.encryptionMethod}`)
    log.info(`  - Storage: ${result.storageProvider}`)
  }

  if (interactive && !result.skipped) {
    let shouldShowReplicationProgress = options.showReplicationProgress
    if (shouldShowReplicationProgress === undefined) {
      shouldShowReplicationProgress = await confirmWithRememberedChoice({
        preferenceKey: 'uploadShowReplicationProgress',
        message: 'Show Capgo global replication progress for this upload so you can confirm rollout in all regions?',
        initialValue: false,
        rememberMessage: 'Remember this replication progress preference for future uploads on this machine?',
      })
    }

    if (shouldShowReplicationProgress) {
      await showReplicationProgress({
        title: 'Replicating your bundle in all regions to guarantee fast updates.',
        completeMessage: 'Replication complete. Your update is now globally available.',
        interactive,
      })
    }
  }

  if (silent && !result.skipped)
    outro('Time to share your update to the world 🌍')

  return result
}

function checkValidOptions(options: OptionsUpload) {
  const noKey = options.key === false
  const forceCrc32 = options.forceCrc32Checksum === true
  const hasEncryptionKey = (options.keyV2 || options.keyDataV2 || existsSync(baseKeyV2))

  if (options.ivSessionKey && !options.external) {
    uploadFail('You need to provide an external url if you want to use the --iv-session-key option')
  }
  if (options.encryptedChecksum && !options.external) {
    uploadFail('You need to provide an external url if you want to use the --encrypted-checksum option')
  }
  if ((options.partial || options.delta || options.partialOnly || options.deltaOnly) && options.external) {
    uploadFail('You cannot use the --partial/--delta/--partial-only/--delta-only option with an external url')
  }
  if (options.tus && options.external) {
    uploadFail('You cannot use the --tus option with an external url')
  }
  if (options.dryUpload && options.external) {
    uploadFail('You cannot use the --dry-upload option with an external url')
  }
  if (options.multipart && options.external) {
    uploadFail('You cannot use the --multipart option with an external url')
  }
  // cannot set key if external
  if (options.external && (options.keyV2 || options.keyDataV2)) {
    uploadFail('You cannot set a key if you are uploading to an external url')
  }
  // cannot set key-v2 and key-data-v2
  if (options.keyV2 && options.keyDataV2) {
    uploadFail('You cannot set both key-v2 and key-data-v2')
  }
  // cannot set s3 and external
  if (options.external && (options.s3Region || options.s3Apikey || options.s3Apisecret || options.s3Endpoint || options.s3BucketName || options.s3Port || options.s3SSL)) {
    uploadFail('You cannot set S3 options if you are uploading to an external url, it\'s automatically handled')
  }
  // cannot set --encrypted-checksum if not external
  if (options.encryptedChecksum && !options.external) {
    uploadFail('You cannot set the --encrypted-checksum option if you are not uploading to an external url')
  }
  // cannot set min-update-version and auto-min-update-version
  if (options.minUpdateVersion && options.autoMinUpdateVersion) {
    uploadFail('You cannot set both min-update-version and auto-min-update-version, use only one of them')
  }
  if (forceCrc32 && hasEncryptionKey && !noKey) {
    uploadFail('You cannot use --force-crc32-checksum when encryption is enabled. Remove the flag or disable encryption.')
  }
}

async function maybePromptStarCapgoRepo() {
  if (!canPromptInteractively())
    return

  const status = getRepoStarStatus()
  if (isRepoStarredInSession(status.repository) || !status.ghInstalled || !status.ghLoggedIn || !status.repositoryExists || status.starred)
    return

  const doStar = await confirmWithRememberedChoice({
    preferenceKey: 'uploadStarCapgoRepo',
    message: `Would you like to star ${status.repository} on GitHub to support Capgo?`,
    rememberMessage: 'Remember this GitHub support preference for future uploads on this machine?',
  })
  if (!doStar) {
    return
  }

  try {
    const result = starRepository(status.repository)
    if (result.alreadyStarred) {
      log.info(`🫶 ${result.repository} is already starred`)
    }
    else {
      log.success(`🙏 Thanks for starring ${result.repository} 🎉`)
    }
  }
  catch (error) {
    log.warn(`Cannot star ${status.repository} right now: ${formatError(error)}`)
  }
}

export async function uploadBundle(appid: string, options: OptionsUpload) {
  try {
    checkValidOptions(options)
    const result = await uploadBundleInternal(appid, options)
    if (!result.skipped)
      await maybePromptStarCapgoRepo()
    return result
  }
  catch (error) {
    // Show simple message by default, full error details only with --verbose
    const simpleMessage = error instanceof Error ? error.message : String(error)
    const verboseMessage = formatError(error)

    if (options.verbose) {
      log.error(`uploadBundle failed:${verboseMessage}`)
    }
    else {
      log.error(`uploadBundle failed: ${simpleMessage}`)
    }

    // Check if this is a checksum error - offer specific retry option
    const isChecksumError = simpleMessage.includes('Cannot upload the same bundle content')

    const interactive = canPromptInteractively()
    // Interactive retry for errors when running in an interactive environment
    if (!options.versionExistsOk && interactive) {
      try {
        if (isChecksumError) {
          // For checksum errors, offer to retry with --ignore-checksum-check
          const retryChoice = await pSelect({
            message: 'Would you like to retry the upload?',
            options: [
              { value: 'ignore', label: 'Retry with --ignore-checksum-check (force upload same content)' },
              { value: 'cancel', label: 'Cancel upload' },
            ],
          })

          if (pIsCancel(retryChoice) || retryChoice === 'cancel') {
            throw error instanceof Error ? error : new Error(String(error))
          }

          if (retryChoice === 'ignore') {
            log.info(`🔄 Retrying upload with --ignore-checksum-check...`)
            return uploadBundle(appid, { ...options, ignoreChecksumCheck: true })
          }
        }
        else {
          const retry = await pConfirm({ message: 'Would you like to retry the upload?' })

          if (pIsCancel(retry)) {
            throw error instanceof Error ? error : new Error(String(error))
          }

          if (retry) {
            log.info(`🔄 Retrying upload...`)
            return uploadBundle(appid, options)
          }
        }
      }
      catch {
        // If prompts fail (e.g., not a TTY), just throw the original error
        throw error instanceof Error ? error : new Error(String(error))
      }
    }

    throw error instanceof Error ? error : new Error(String(error))
  }
}
