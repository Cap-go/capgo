import type { BuildCredentials, SavedCredentials } from '../schemas/build'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { cwd, exit, platform as osPlatform } from 'node:process'
import {
  cancel as pCancel,
  confirm as pConfirm,
  intro as pIntro,
  isCancel as pIsCancel,
  log as pLog,
  outro as pOutro,
  select as pSelect,
  text as pText,
} from '../init/prompts'
import { clearInitLogs, setInitScreen } from '../init/runtime'
import { getAppId, getConfig } from '../utils'
import { canUseFilePicker, openSaveFilePicker } from './onboarding/file-picker'
import {
  clearSavedCredentials,
  getGlobalCredentialsPath,
  getLocalCredentialsPath,
  listAllApps,
  loadSavedCredentials,
  removeSavedCredentialKeys,
  updateSavedCredentials,
} from './credentials'

interface ManageCredentialsOptions {
  appId?: string
  platform?: 'ios' | 'android'
  local?: boolean
}

interface AppEntry {
  appId: string
  local: boolean
  platforms: Array<'ios' | 'android'>
  saved: SavedCredentials
}

const SECRET_KEYS = new Set([
  'P12_PASSWORD',
  'APPLE_KEY_CONTENT',
  'BUILD_CERTIFICATE_BASE64',
  'BUILD_PROVISION_PROFILE_BASE64',
  'KEYSTORE_KEY_PASSWORD',
  'KEYSTORE_STORE_PASSWORD',
  'ANDROID_KEYSTORE_FILE',
  'PLAY_CONFIG_JSON',
  'GOOGLE_OAUTH_REFRESH_TOKEN',
])

type FieldScope = 'ios' | 'android' | 'shared'
type FieldType = 'string' | 'boolean' | 'duration' | 'base64' | 'json' | 'enum'

interface FieldKnowledge {
  scope: FieldScope
  type: FieldType
  enumValues?: string[]
  explain: string
}

// Authoritative descriptions sourced from the Capgo wiki (concepts/code-signing,
// concepts/cli-native-builds, concepts/android-keystore-handling). Keep these
// in sync if the wiki changes.
const CREDENTIAL_KNOWLEDGE: Record<string, FieldKnowledge> = {
  // iOS
  BUILD_CERTIFICATE_BASE64: {
    scope: 'ios',
    type: 'base64',
    explain: 'Base64-encoded .p12 distribution certificate. The .p12 contains the iOS Distribution certificate + private key that signs your app. Sent to Capgo build workers per build, then deleted.',
  },
  P12_PASSWORD: {
    scope: 'ios',
    type: 'string',
    explain: 'Password for the .p12 certificate file. Can be empty if the .p12 was exported without one. Stored locally; never leaves your machine permanently.',
  },
  APPLE_KEY_ID: {
    scope: 'ios',
    type: 'string',
    explain: 'App Store Connect API key ID (10-char alphanumeric). Used to upload signed builds to TestFlight/App Store. Find it in App Store Connect → Users and Access → Keys. Optional for ad_hoc distribution.',
  },
  APPLE_ISSUER_ID: {
    scope: 'ios',
    type: 'string',
    explain: 'App Store Connect API issuer ID (UUID). Pairs with APPLE_KEY_ID and APPLE_KEY_CONTENT to authenticate uploads. Found alongside the key ID in App Store Connect. Optional for ad_hoc distribution.',
  },
  APPLE_KEY_CONTENT: {
    scope: 'ios',
    type: 'base64',
    explain: 'Base64-encoded contents of the .p8 App Store Connect API private key. Needed to upload to TestFlight/App Store. Capgo uses it server-side per build then discards it.',
  },
  APP_STORE_CONNECT_TEAM_ID: {
    scope: 'ios',
    type: 'string',
    explain: 'Apple Developer team ID (10-char alphanumeric). Found at developer.apple.com → Membership. Used by xcodebuild to scope the signing context.',
  },
  CAPGO_IOS_PROVISIONING_MAP: {
    scope: 'ios',
    type: 'json',
    explain: 'JSON map of bundle IDs → { profile (base64 .mobileprovision), name }. Supports apps with multiple signable targets (main app + widget + notification service extension, etc.). Replaces the legacy single-profile BUILD_PROVISION_PROFILE_BASE64 — run `build credentials migrate` to convert.',
  },
  CAPGO_IOS_DISTRIBUTION: {
    scope: 'ios',
    type: 'enum',
    enumValues: ['app_store', 'ad_hoc'],
    explain: 'iOS distribution mode. `app_store` (default) exports for TestFlight/App Store and validates the App Store Connect API key. `ad_hoc` exports for direct device distribution and skips the API-key validation — useful for QA, internal builds, and device-specific testing.',
  },
  CAPGO_IOS_SCHEME: {
    scope: 'ios',
    type: 'string',
    explain: 'Xcode scheme name to build. Auto-detected from the .xcodeproj if there is only one shared scheme; required when multiple schemes exist.',
  },
  CAPGO_IOS_TARGET: {
    scope: 'ios',
    type: 'string',
    explain: 'Xcode target name. Auto-detected from the project; override only if your project has unusual target naming and the build picks the wrong one.',
  },
  BUILD_PROVISION_PROFILE_BASE64: {
    scope: 'ios',
    type: 'base64',
    explain: 'LEGACY single-profile format. Use `build credentials migrate --platform ios` to convert this into the multi-target CAPGO_IOS_PROVISIONING_MAP. Builds will fail with this key still present.',
  },

  // Android
  ANDROID_KEYSTORE_FILE: {
    scope: 'android',
    type: 'base64',
    explain: 'Base64-encoded .keystore / .jks / .p12 file used to sign your Android APK/AAB. Losing this means losing the ability to update your Play Store listing forever — keep a backup.',
  },
  KEYSTORE_KEY_ALIAS: {
    scope: 'android',
    type: 'string',
    explain: 'Alias name of the key inside the keystore. PKCS#12 keystores expose readable aliases; JKS keystores often need this entered manually. The CLI wizard auto-detects aliases when possible.',
  },
  KEYSTORE_KEY_PASSWORD: {
    scope: 'android',
    type: 'string',
    explain: 'Password protecting the individual key inside the keystore. In ~99% of keystores it equals KEYSTORE_STORE_PASSWORD; the CLI defaults to that when only one is provided.',
  },
  KEYSTORE_STORE_PASSWORD: {
    scope: 'android',
    type: 'string',
    explain: 'Password protecting the keystore file as a whole. Asked first by the wizard; defaults the key password to the same value.',
  },
  PLAY_CONFIG_JSON: {
    scope: 'android',
    type: 'base64',
    explain: 'Base64-encoded Google Play service-account JSON key. Authenticates uploads to Play Console via the Android Publisher API. Capgo provisions one for you via the OAuth onboarding (creates a GCP project + service account + invites it into your Play Console).',
  },
  GOOGLE_OAUTH_REFRESH_TOKEN: {
    scope: 'android',
    type: 'string',
    explain: 'Long-lived OAuth refresh token from the Google sign-in step of `build init --platform android`. Lets the CLI re-mint short-lived access tokens for Play Console operations without re-prompting. Capgo never stores it server-side.',
  },
  CAPGO_ANDROID_FLAVOR: {
    scope: 'android',
    type: 'string',
    explain: 'Gradle product flavor to build (e.g. `production`, `staging`). Required when your `app/build.gradle` defines multiple flavors; ignored if empty.',
  },

  // Shared
  BUILD_OUTPUT_UPLOAD_ENABLED: {
    scope: 'shared',
    type: 'boolean',
    explain: 'When true, the build worker uploads the resulting IPA/APK/AAB to Capgo storage and emits a time-limited download link (and a QR code) at the end of the build. When false, the artifact only goes to the app store.',
  },
  BUILD_OUTPUT_RETENTION_SECONDS: {
    scope: 'shared',
    type: 'duration',
    explain: 'How long the BUILD_OUTPUT_UPLOAD download link stays valid. Range: 1h (3600) to 7d (604800). Stored as seconds. The CLI accepts shorthand like 6h, 2d on save.',
  },
  SKIP_BUILD_NUMBER_BUMP: {
    scope: 'shared',
    type: 'boolean',
    explain: 'When true, the builder uses the version code/build number already in your project files instead of auto-incrementing. Useful when you manage versions manually or via your own CI script.',
  },
}

function getFieldKnowledge(key: string): FieldKnowledge | undefined {
  return CREDENTIAL_KNOWLEDGE[key]
}

function getFieldScope(key: string): FieldScope {
  return CREDENTIAL_KNOWLEDGE[key]?.scope ?? 'shared'
}

interface FieldRow {
  key: string
  value: string
  sourcePlatforms: Array<'ios' | 'android'>
  /** Short tag shown as a prefix in the picker label, e.g. `ios`, `android`, `SHARED`, `SHARED·ios`. */
  tag: string
  knowledge?: FieldKnowledge
}

function gatherFieldRows(entry: AppEntry): FieldRow[] {
  const ios = entry.saved.ios ?? {}
  const android = entry.saved.android ?? {}
  const allKeys = new Set<string>([
    ...Object.keys(ios).filter(key => typeof ios[key as keyof typeof ios] === 'string' && (ios[key as keyof typeof ios] as string).length > 0),
    ...Object.keys(android).filter(key => typeof android[key as keyof typeof android] === 'string' && (android[key as keyof typeof android] as string).length > 0),
  ])

  const rows: FieldRow[] = []

  for (const key of allKeys) {
    const knowledge = getFieldKnowledge(key)
    const iosValue = typeof ios[key as keyof typeof ios] === 'string' ? (ios[key as keyof typeof ios] as string) : undefined
    const androidValue = typeof android[key as keyof typeof android] === 'string' ? (android[key as keyof typeof android] as string) : undefined
    const declaredScope = knowledge?.scope ?? inferScope(key)

    if (declaredScope === 'shared') {
      if (iosValue !== undefined && androidValue !== undefined) {
        if (iosValue === androidValue) {
          rows.push({ key, value: iosValue, sourcePlatforms: ['ios', 'android'], tag: 'SHARED', knowledge })
        }
        else {
          // Drift between platforms — surface both rows so the user can resolve.
          rows.push({ key, value: iosValue, sourcePlatforms: ['ios'], tag: 'SHARED·ios', knowledge })
          rows.push({ key, value: androidValue, sourcePlatforms: ['android'], tag: 'SHARED·android', knowledge })
        }
      }
      else if (iosValue !== undefined) {
        rows.push({ key, value: iosValue, sourcePlatforms: ['ios'], tag: 'SHARED·ios', knowledge })
      }
      else if (androidValue !== undefined) {
        rows.push({ key, value: androidValue, sourcePlatforms: ['android'], tag: 'SHARED·android', knowledge })
      }
    }
    else if (declaredScope === 'ios' && iosValue !== undefined) {
      rows.push({ key, value: iosValue, sourcePlatforms: ['ios'], tag: 'ios', knowledge })
    }
    else if (declaredScope === 'android' && androidValue !== undefined) {
      rows.push({ key, value: androidValue, sourcePlatforms: ['android'], tag: 'android', knowledge })
    }
    else {
      // Field declared on one platform but stored on the other — surface as the platform that has it.
      if (iosValue !== undefined)
        rows.push({ key, value: iosValue, sourcePlatforms: ['ios'], tag: 'ios', knowledge })
      if (androidValue !== undefined)
        rows.push({ key, value: androidValue, sourcePlatforms: ['android'], tag: 'android', knowledge })
    }
  }

  // Order: SHARED first, then ios, then android. Within each, alphabetical.
  return rows.sort((a, b) => {
    const orderA = tagOrder(a.tag)
    const orderB = tagOrder(b.tag)
    if (orderA !== orderB)
      return orderA - orderB
    return a.key.localeCompare(b.key)
  })
}

function inferScope(key: string): FieldScope {
  if (key.startsWith('APPLE_') || key.startsWith('CAPGO_IOS_') || key.startsWith('BUILD_CERTIFICATE') || key === 'P12_PASSWORD' || key === 'APP_STORE_CONNECT_TEAM_ID' || key === 'BUILD_PROVISION_PROFILE_BASE64')
    return 'ios'
  if (key.startsWith('KEYSTORE_') || key.startsWith('ANDROID_') || key.startsWith('PLAY_') || key.startsWith('CAPGO_ANDROID_') || key.startsWith('GOOGLE_'))
    return 'android'
  return 'shared'
}

function tagOrder(tag: string): number {
  if (tag === 'SHARED')
    return 0
  if (tag.startsWith('SHARED'))
    return 1
  if (tag === 'ios')
    return 2
  return 3
}

function refreshedPlatforms(saved: SavedCredentials): Array<'ios' | 'android'> {
  const platforms: Array<'ios' | 'android'> = []
  if (saved.ios && hasAnyValue(saved.ios))
    platforms.push('ios')
  if (saved.android && hasAnyValue(saved.android))
    platforms.push('android')
  return platforms
}

export async function manageCredentialsCommand(options: ManageCredentialsOptions = {}): Promise<void> {
  pIntro('Capgo build credentials manager')

  try {
    let entries = await loadEntries(options.local)
    if (entries.length === 0) {
      pCancel('No saved build credentials found. Run `capgo build credentials save` first.')
      return
    }

    const targetAppId = options.appId ?? (await detectAppIdFromCapacitor(entries))
    let detectedFromCapacitor = false
    if (targetAppId) {
      const filtered = entries.filter(entry => entry.appId === targetAppId)
      if (filtered.length === 0 && options.appId) {
        pCancel(`No credentials found for app ${options.appId}.`)
        return
      }
      if (filtered.length > 0) {
        detectedFromCapacitor = !options.appId
        entries = filtered
      }
    }

    let currentEntry = entries.length === 1 ? entries[0] : undefined

    let oneShotIntro: string[] | undefined
    if (detectedFromCapacitor && targetAppId)
      oneShotIntro = [`✨ Detected app from capacitor.config: ${targetAppId}`]

    while (true) {
      if (!currentEntry) {
        const picked = await pickEntry(entries, oneShotIntro)
        oneShotIntro = undefined
        if (pIsCancel(picked))
          break
        currentEntry = picked
      }

      const canGoBack = entries.length > 1
      const action = await pickAction(currentEntry, canGoBack, oneShotIntro)
      oneShotIntro = undefined
      if (pIsCancel(action))
        break

      if (action === 'view') {
        const result = await inspectAppCredentials(currentEntry)
        if (result.mutated) {
          const refreshed = await loadSavedCredentials(currentEntry.appId, currentEntry.local)
          if (!refreshed || (!hasAnyValue(refreshed.ios ?? {}) && !hasAnyValue(refreshed.android ?? {}))) {
            entries = await loadEntries(options.local)
            if (entries.length === 0) {
              pOutro('All credentials cleared.')
              return
            }
            currentEntry = entries.length === 1 ? entries[0] : undefined
            continue
          }
          currentEntry = {
            ...currentEntry,
            saved: refreshed,
            platforms: refreshedPlatforms(refreshed),
          }
        }
      }
      else if (action === 'export') {
        const exported = await exportToEnvFile(currentEntry)
        if (!exported)
          pLog.warn('Export cancelled.')
      }
      else if (action === 'delete') {
        const deleted = await deletePlatformInteractive(currentEntry)
        if (deleted) {
          entries = await loadEntries(options.local)
          if (options.appId)
            entries = entries.filter(entry => entry.appId === options.appId)
          if (entries.length === 0) {
            pOutro('All credentials cleared.')
            return
          }
          currentEntry = entries.length === 1 ? entries[0] : undefined
          continue
        }
      }
      else if (action === 'back') {
        if (entries.length === 1)
          break
        currentEntry = undefined
        continue
      }
      else if (action === 'quit') {
        break
      }
    }

    pOutro('Done.')
  }
  catch (error) {
    pCancel(`Failed: ${error instanceof Error ? error.message : String(error)}`)
    exit(1)
  }
}

interface ManagerScreenOptions {
  title: string
  introLines?: string[]
  statusLine?: string
  stepLabel?: string
  stepSummary?: string
}

function setManagerScreen(options: ManagerScreenOptions): void {
  setInitScreen({
    headerTitle: '🔐  Capgo Build Credentials',
    title: options.title,
    introLines: options.introLines,
    statusLine: options.statusLine,
    stepLabel: options.stepLabel,
    stepSummary: options.stepSummary,
    tone: 'cyan',
  })
}

function summarizePlatformContent(creds: Partial<BuildCredentials> | undefined): string {
  if (!creds || !hasAnyValue(creds))
    return 'no credentials'
  const total = Object.values(creds).filter(v => typeof v === 'string' && v.length > 0).length
  const secrets = Object.entries(creds).filter(([key, value]) => SECRET_KEYS.has(key) && typeof value === 'string' && value.length > 0).length
  const parts: string[] = [`${total} field${total === 1 ? '' : 's'}`]
  if (secrets > 0)
    parts.push(`${secrets} secret${secrets === 1 ? '' : 's'}`)
  return parts.join(', ')
}

function describeFieldRow(row: FieldRow): string[] {
  const lines: string[] = []
  lines.push(`Source: ${row.tag} → writes to ${row.sourcePlatforms.join(' + ')}`)
  lines.push(`${row.value.length} chars stored`)
  if (SECRET_KEYS.has(row.key))
    lines.push('marked as secret (hidden by default)')
  if (canDecodeBase64(row.key, row.value))
    lines.push('decode-eligible (base64 → JSON / text)')
  if (row.knowledge?.type === 'boolean')
    lines.push('boolean field — Edit will offer true / false')
  if (row.knowledge?.type === 'enum' && row.knowledge.enumValues)
    lines.push(`enum field — Edit will offer: ${row.knowledge.enumValues.join(' / ')}`)
  if (row.knowledge?.type === 'duration')
    lines.push('duration field — accepts 1h, 6h, 2d (1h–7d range)')
  if (row.key === 'CAPGO_IOS_PROVISIONING_MAP')
    lines.push(summarizeProvisioningMap(row.value))
  if (row.key.endsWith('_ID'))
    lines.push('identifier (not secret — visible in Apple/Google portals)')
  return lines
}

async function detectAppIdFromCapacitor(entries: AppEntry[]): Promise<string | undefined> {
  if (entries.length === 0)
    return undefined
  try {
    const extConfig = await getConfig()
    const inferred = getAppId(undefined, extConfig?.config)
    return inferred || undefined
  }
  catch {
    return undefined
  }
}

async function loadEntries(localOnly?: boolean): Promise<AppEntry[]> {
  const entries: AppEntry[] = []
  const scopes: Array<{ local: boolean }> = localOnly ? [{ local: true }] : [{ local: false }, { local: true }]

  for (const scope of scopes) {
    const appIds = await listAllApps(scope.local)
    for (const appId of appIds) {
      const saved = await loadSavedCredentials(appId, scope.local)
      if (!saved)
        continue
      const platforms: Array<'ios' | 'android'> = []
      if (saved.ios && hasAnyValue(saved.ios))
        platforms.push('ios')
      if (saved.android && hasAnyValue(saved.android))
        platforms.push('android')
      if (platforms.length === 0)
        continue
      entries.push({ appId, local: scope.local, platforms, saved })
    }
  }

  return entries
}

function hasAnyValue(creds: Partial<BuildCredentials>): boolean {
  return Object.values(creds).some(value => typeof value === 'string' && value.length > 0)
}

async function pickEntry(entries: AppEntry[], extraIntro?: string[]): Promise<AppEntry | symbol> {
  setManagerScreen({
    title: 'Pick an app',
    introLines: [
      ...(extraIntro ?? []),
      ...(extraIntro ? [''] : []),
      `${entries.length} app${entries.length === 1 ? '' : 's'} have saved credentials.`,
      `Global store: ${getGlobalCredentialsPath()}`,
      `Local store:  ${getLocalCredentialsPath()}`,
    ],
    statusLine: 'Use ↑/↓ then Enter to choose. Ctrl+C to quit.',
  })
  const result = await pSelect({
    message: 'Pick an app',
    options: entries.map((entry, index) => ({
      value: String(index),
      label: `${entry.appId} (${entry.local ? 'local' : 'global'})`,
      hint: entry.platforms.join(' + '),
    })),
  })
  if (pIsCancel(result))
    return result
  return entries[Number.parseInt(result, 10)]
}

async function pickAction(entry: AppEntry, canGoBack: boolean, extraIntro?: string[]): Promise<string | symbol> {
  const platformsLine = entry.platforms.length === 0
    ? 'no platforms configured'
    : entry.platforms.map(p => `${p === 'ios' ? 'iOS' : 'Android'}: ${summarizePlatformContent(entry.saved[p])}`).join('   ·   ')

  setManagerScreen({
    title: `${entry.appId} · credentials`,
    introLines: [
      ...(extraIntro ?? []),
      ...(extraIntro ? [''] : []),
      `Source: ${entry.local ? 'local' : 'global'} store`,
      platformsLine,
      '',
      'View    — flat list of every credential across platforms (show, decode, copy, edit, explain, remove).',
      'Export  — write a .env file ready for CI/CD secrets (asks which platform if both are configured).',
      'Delete  — wipe all credentials for one platform (asks which if both are configured).',
    ],
    statusLine: canGoBack ? 'Esc = back, Ctrl+C = quit.' : 'Ctrl+C or Esc to quit.',
  })
  const options = [
    { value: 'view', label: 'View credentials', hint: 'inspect, decode, copy, edit, explain, remove' },
    { value: 'export', label: 'Export to .env', hint: 'CI/CD-ready file' },
    { value: 'delete', label: 'Delete', hint: 'remove a platform from storage' },
    ...(canGoBack ? [{ value: 'back', label: 'Back', hint: 'previous picker' }] : []),
    { value: 'quit', label: 'Quit' },
  ]
  return pSelect({
    message: `${entry.appId} (${entry.local ? 'local' : 'global'})`,
    options,
  })
}

interface InspectResult {
  mutated: boolean
}

async function inspectAppCredentials(entry: AppEntry): Promise<InspectResult> {
  let mutated = false
  let workingEntry = entry

  while (true) {
    const fresh = await loadSavedCredentials(workingEntry.appId, workingEntry.local)
    if (!fresh || (!hasAnyValue(fresh.ios ?? {}) && !hasAnyValue(fresh.android ?? {}))) {
      pLog.info(`No credentials remain for ${workingEntry.appId}.`)
      return { mutated }
    }
    workingEntry = { ...workingEntry, saved: fresh, platforms: refreshedPlatforms(fresh) }

    const rows = gatherFieldRows(workingEntry)
    if (rows.length === 0) {
      pLog.info(`No credential fields stored for ${workingEntry.appId}.`)
      return { mutated }
    }

    const pickedIndex = await pickFieldRow(workingEntry, rows)
    if (pIsCancel(pickedIndex))
      return { mutated }

    const row = rows[Number.parseInt(pickedIndex, 10)]
    if (!row)
      continue

    const action = await pickFieldAction(row)
    if (pIsCancel(action) || action === 'back')
      continue

    if (action === 'show') {
      actionShowField(row)
    }
    else if (action === 'decode') {
      actionDecodeField(row)
    }
    else if (action === 'copy') {
      actionCopyField(row)
    }
    else if (action === 'explain') {
      actionExplainField(row)
    }
    else if (action === 'edit') {
      const edited = await actionEditField(workingEntry, row)
      if (edited)
        mutated = true
    }
    else if (action === 'remove') {
      const removed = await actionRemoveField(workingEntry, row)
      if (removed)
        mutated = true
    }
  }
}

async function pickFieldRow(entry: AppEntry, rows: FieldRow[]): Promise<string | symbol> {
  const secretCount = rows.filter(row => SECRET_KEYS.has(row.key)).length
  const decodableCount = rows.filter(row => canDecodeBase64(row.key, row.value)).length
  const explainableCount = rows.filter(row => row.knowledge).length

  setManagerScreen({
    title: `${entry.appId} · credentials`,
    introLines: [
      `${rows.length} field${rows.length === 1 ? '' : 's'} stored — ${secretCount} secret${secretCount === 1 ? '' : 's'}, ${decodableCount} decode-eligible, ${explainableCount} with wiki explanations.`,
      `Source: ${entry.local ? 'local' : 'global'} store.`,
      `Tags: [SHARED] = same value on both platforms · [SHARED·ios] / [SHARED·android] = stored on one only · [ios] / [android] = platform-specific.`,
      '',
      'Per-field actions: Show / Decode / Copy / Edit / Explain / Remove.',
      'Esc returns to the action menu without changes.',
    ],
    statusLine: 'Tip: secrets show **** until you choose Show or Copy.',
  })

  const options = rows.map((row, index) => ({
    value: String(index),
    label: `[${row.tag}] ${row.key}`,
    hint: previewValue(row.key, row.value),
  }))
  return pSelect({
    message: `${entry.appId} (${entry.local ? 'local' : 'global'}) — credentials`,
    options,
  })
}

async function pickFieldAction(row: FieldRow): Promise<string | symbol> {
  const decodable = canDecodeBase64(row.key, row.value)
  const explainable = row.knowledge !== undefined
  const editLabel = pickEditLabel(row)

  // Clear any prior action's output so the user lands on a fresh canvas for
  // this field — previous Show/Decode dumps would otherwise stack visually.
  clearInitLogs()

  setManagerScreen({
    title: `Action · [${row.tag}] ${row.key}`,
    introLines: describeFieldRow(row),
    statusLine: 'Esc returns to the field list. Ctrl+C quits the manager.',
  })

  const options = [
    { value: 'show', label: 'Show value', hint: 'print the raw stored value' },
    ...(decodable ? [{ value: 'decode', label: 'Decode (base64 → readable)', hint: 'JSON pretty-print or text preview' }] : []),
    { value: 'copy', label: 'Copy to clipboard', hint: 'pbcopy / xclip / wl-copy' },
    { value: 'edit', label: editLabel.label, hint: editLabel.hint },
    ...(explainable ? [{ value: 'explain', label: 'Explain', hint: 'what this field is and how Capgo uses it' }] : []),
    { value: 'remove', label: 'Remove this field', hint: row.sourcePlatforms.length > 1 ? 'delete from both platforms' : `delete from ${row.sourcePlatforms[0]}` },
    { value: 'back', label: 'Back' },
  ]
  return pSelect({ message: `Action for ${row.key}`, options })
}

function pickEditLabel(row: FieldRow): { label: string, hint: string } {
  const fieldType = row.knowledge?.type
  if (fieldType === 'boolean')
    return { label: 'Edit', hint: 'pick true or false' }
  if (fieldType === 'enum')
    return { label: 'Edit', hint: `pick from: ${row.knowledge?.enumValues?.join(' / ') ?? ''}` }
  if (fieldType === 'duration')
    return { label: 'Edit', hint: 'enter a duration like 1h, 6h, 2d (1h–7d)' }
  return { label: 'Edit', hint: 'opens a temp file in your editor of choice' }
}

function previewValue(key: string, value: string): string {
  if (SECRET_KEYS.has(key))
    return `**** (${value.length} chars)`
  if (key === 'CAPGO_IOS_PROVISIONING_MAP')
    return summarizeProvisioningMap(value)
  if (value.length > 60)
    return `${value.slice(0, 40)}… (${value.length} chars)`
  return value
}

function canDecodeBase64(key: string, value: string): boolean {
  if (key === 'CAPGO_IOS_PROVISIONING_MAP')
    return false
  if (key.endsWith('_BASE64'))
    return true
  if (key === 'APPLE_KEY_CONTENT' || key === 'ANDROID_KEYSTORE_FILE' || key === 'PLAY_CONFIG_JSON')
    return true
  // Heuristic fallback: long string that matches base64 alphabet
  if (value.length >= 32 && /^[A-Z0-9+/=\s]+$/i.test(value))
    return true
  return false
}

function actionShowField(row: FieldRow): void {
  pLog.info(`──── [${row.tag}] ${row.key} (${row.value.length} chars) ────`)
  pLog.info(row.value)
  pLog.success(`✓ Showed ${row.key}.`)
}

function actionDecodeField(row: FieldRow): void {
  let decoded: Buffer
  try {
    decoded = Buffer.from(row.value, 'base64')
  }
  catch (error) {
    pLog.error(`✗ Could not decode ${row.key}: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  const text = decoded.toString('utf-8')
  try {
    const parsed: unknown = JSON.parse(text)
    pLog.info(`──── [${row.tag}] ${row.key} (decoded JSON, ${decoded.length} bytes) ────`)
    pLog.info(JSON.stringify(parsed, null, 2))
    pLog.success(`✓ Decoded ${row.key} as JSON (${decoded.length} bytes → ${text.length} chars).`)
    return
  }
  catch {
    // Not JSON, try printable text next.
  }

  const printable = isPrintableText(text)
  if (printable) {
    pLog.info(`──── [${row.tag}] ${row.key} (decoded text, ${decoded.length} bytes) ────`)
    const preview = text.length > 500 ? `${text.slice(0, 500)}\n… truncated (${text.length} bytes total)` : text
    pLog.info(preview)
    pLog.success(`✓ Decoded ${row.key} as text.`)
    return
  }

  pLog.info(`✓ ${row.key} decodes to ${decoded.length} bytes of binary data (not displayed — likely a certificate or keystore).`)
}

function actionExplainField(row: FieldRow): void {
  const knowledge = row.knowledge
  if (!knowledge) {
    pLog.warn(`No wiki entry found for ${row.key}.`)
    return
  }
  pLog.info(`──── [${row.tag}] ${row.key} — explanation ────`)
  pLog.info(knowledge.explain)
  if (knowledge.type === 'enum' && knowledge.enumValues)
    pLog.info(`Allowed values: ${knowledge.enumValues.join(', ')}`)
  pLog.success(`✓ Explained ${row.key}.`)
}

function isPrintableText(text: string): boolean {
  if (text.length === 0)
    return false
  let printable = 0
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code === 0x09 || code === 0x0A || code === 0x0D || (code >= 0x20 && code <= 0x7E))
      printable += 1
  }
  return printable / text.length >= 0.95
}

function actionCopyField(row: FieldRow): void {
  const result = copyToClipboard(row.value)
  if (result.ok)
    pLog.success(`✓ Copied ${row.key} (${row.value.length} chars) to clipboard via ${result.method}.`)
  else
    pLog.warn(`✗ Clipboard not available — could not copy ${row.key}. Use "Show value" and copy manually.`)
}

interface ClipboardCandidate {
  cmd: string
  args: string[]
}

function copyToClipboard(text: string): { ok: boolean, method?: string } {
  const candidates: ClipboardCandidate[] = []
  if (osPlatform === 'darwin') {
    candidates.push({ cmd: 'pbcopy', args: [] })
  }
  else if (osPlatform === 'win32') {
    candidates.push({ cmd: 'clip', args: [] })
  }
  else {
    candidates.push({ cmd: 'wl-copy', args: [] })
    candidates.push({ cmd: 'xclip', args: ['-selection', 'clipboard'] })
    candidates.push({ cmd: 'xsel', args: ['--clipboard', '--input'] })
  }
  for (const candidate of candidates) {
    try {
      const result = spawnSync(candidate.cmd, candidate.args, { input: text })
      if (result.error)
        continue
      if (result.status === 0)
        return { ok: true, method: candidate.cmd }
    }
    catch {
      // Try next candidate.
    }
  }
  return { ok: false }
}

async function actionEditField(entry: AppEntry, row: FieldRow): Promise<boolean> {
  const fieldType = row.knowledge?.type
  if (fieldType === 'boolean')
    return editBooleanField(entry, row)
  if (fieldType === 'enum')
    return editEnumField(entry, row)
  if (fieldType === 'duration')
    return editDurationField(entry, row)
  return editTextField(entry, row)
}

async function editBooleanField(entry: AppEntry, row: FieldRow): Promise<boolean> {
  const current = parseBooleanValue(row.value)
  const picked = await pSelect<'true' | 'false'>({
    message: `Set ${row.key} (currently ${current ?? row.value})`,
    options: [
      { value: 'true', label: 'true', hint: current === true ? 'current value' : '' },
      { value: 'false', label: 'false', hint: current === false ? 'current value' : '' },
    ],
  })
  if (pIsCancel(picked))
    return false

  if (picked === row.value) {
    pLog.info('No changes detected.')
    return false
  }

  await writeFieldToSourcePlatforms(entry, row, picked)
  pLog.success(`✓ Updated ${row.key} → ${picked} on ${row.sourcePlatforms.join(' + ')}.`)
  return true
}

async function editEnumField(entry: AppEntry, row: FieldRow): Promise<boolean> {
  const enumValues = row.knowledge?.enumValues ?? []
  if (enumValues.length === 0) {
    pLog.error(`Enum field ${row.key} has no allowed values configured.`)
    return false
  }
  const picked = await pSelect<string>({
    message: `Set ${row.key} (currently ${row.value})`,
    options: enumValues.map(v => ({ value: v, label: v, hint: v === row.value ? 'current value' : '' })),
  })
  if (pIsCancel(picked))
    return false
  if (picked === row.value) {
    pLog.info('No changes detected.')
    return false
  }
  await writeFieldToSourcePlatforms(entry, row, picked)
  pLog.success(`✓ Updated ${row.key} → ${picked} on ${row.sourcePlatforms.join(' + ')}.`)
  return true
}

async function editDurationField(entry: AppEntry, row: FieldRow): Promise<boolean> {
  const currentSeconds = Number.parseInt(row.value, 10)
  const placeholder = Number.isFinite(currentSeconds) ? `${currentSeconds}s (e.g. 1h, 6h, 2d)` : '1h, 6h, 2d (1h–7d)'
  const entered = await pText({
    message: `New duration for ${row.key}`,
    placeholder,
    validate: (value) => {
      if (!value || value.trim().length === 0)
        return 'Required'
      try {
        parseOutputRetentionLocal(value)
      }
      catch (error) {
        return error instanceof Error ? error.message : 'Invalid duration'
      }
      return undefined
    },
  })
  if (pIsCancel(entered))
    return false

  const newSeconds = parseOutputRetentionLocal(entered)
  const newValue = String(newSeconds)
  if (newValue === row.value) {
    pLog.info('No changes detected.')
    return false
  }
  await writeFieldToSourcePlatforms(entry, row, newValue)
  pLog.success(`✓ Updated ${row.key} → ${newValue}s on ${row.sourcePlatforms.join(' + ')}.`)
  return true
}

async function editTextField(entry: AppEntry, row: FieldRow): Promise<boolean> {
  const ext = looksLikeJson(row.value) ? 'json' : 'txt'
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const tmpPath = join(tmpdir(), `capgo-${token}-${sanitizeForFilename(row.key)}.${ext}`)

  await writeFile(tmpPath, row.value, { mode: 0o600 })

  pLog.info('\nA temp file has been created with the current value:')
  pLog.info(`  ${tmpPath}`)
  pLog.info('Open it in your editor of choice, save your changes, then confirm below.')

  try {
    const done = await pConfirm({
      message: 'Done editing? (Yes = read & save, No = discard changes)',
      initialValue: true,
    })
    if (pIsCancel(done) || !done) {
      pLog.warn('Edit cancelled — no changes saved.')
      return false
    }

    let updated: string
    try {
      updated = readFileSync(tmpPath, 'utf-8')
    }
    catch (error) {
      pLog.error(`Could not read temp file: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }

    if (updated === row.value) {
      pLog.info('No changes detected.')
      return false
    }

    if (row.key === 'CAPGO_IOS_PROVISIONING_MAP') {
      try {
        JSON.parse(updated)
      }
      catch (error) {
        pLog.error(`Invalid JSON — keeping previous value. Error: ${error instanceof Error ? error.message : String(error)}`)
        return false
      }
    }

    await writeFieldToSourcePlatforms(entry, row, updated)
    pLog.success(`✓ Updated ${row.key} on ${row.sourcePlatforms.join(' + ')} — ${row.value.length} → ${updated.length} chars.`)
    return true
  }
  finally {
    try {
      unlinkSync(tmpPath)
    }
    catch {
      // Best-effort cleanup; ignore errors.
    }
  }
}

async function writeFieldToSourcePlatforms(entry: AppEntry, row: FieldRow, newValue: string): Promise<void> {
  for (const platform of row.sourcePlatforms)
    await updateSavedCredentials(entry.appId, platform, { [row.key]: newValue }, entry.local)
}

function parseBooleanValue(value: string): boolean | undefined {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === 'true' || trimmed === '1' || trimmed === 'yes')
    return true
  if (trimmed === 'false' || trimmed === '0' || trimmed === 'no')
    return false
  return undefined
}

function parseOutputRetentionLocal(raw: string): number {
  // Local copy of the CLI's parser to avoid an import cycle with credentials-command.
  const trimmed = raw.trim()
  const match = trimmed.match(/^(\d+)\s*([smhd])?$/i)
  if (!match)
    throw new Error('Use a number with unit s, m, h, or d (e.g. 1h, 6h, 2d)')
  const value = Number.parseInt(match[1]!, 10)
  const unit = (match[2] || 's').toLowerCase() as 's' | 'm' | 'h' | 'd'
  const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400
  const seconds = value * multiplier
  if (seconds < 3600)
    throw new Error('Minimum is 1h (3600s)')
  if (seconds > 7 * 86400)
    throw new Error('Maximum is 7d (604800s)')
  return seconds
}

async function actionRemoveField(entry: AppEntry, row: FieldRow): Promise<boolean> {
  const confirmed = await pConfirm({
    message: `Remove ${row.key} from ${entry.appId} (${row.sourcePlatforms.join(' + ')})?`,
    initialValue: false,
  })
  if (pIsCancel(confirmed) || !confirmed)
    return false

  for (const platform of row.sourcePlatforms)
    await removeSavedCredentialKeys(entry.appId, platform, [row.key], entry.local)

  pLog.success(`✓ Removed ${row.key} from ${entry.appId} (${row.sourcePlatforms.join(' + ')}).`)
  return true
}

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

function sanitizeForFilename(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, '_').slice(0, 40)
}

function summarizeProvisioningMap(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, { name?: string }>
    const bundleIds = Object.keys(parsed)
    const lines = bundleIds.map((id) => {
      const name = parsed[id]?.name ?? '(unnamed)'
      return `${id} → ${name}`
    })
    return `${bundleIds.length} target${bundleIds.length === 1 ? '' : 's'}: ${lines.join(', ')}`
  }
  catch {
    return `(JSON, ${raw.length} chars)`
  }
}

async function exportToEnvFile(entry: AppEntry): Promise<boolean> {
  if (entry.platforms.length === 0) {
    pLog.warn('Nothing to export — no platforms configured for this app.')
    return false
  }

  const platform = await resolvePlatformChoice(entry, 'Pick which platform to export')
  if (platform === null)
    return false

  const creds = entry.saved[platform]
  if (!creds || !hasAnyValue(creds)) {
    pLog.warn('Nothing to export.')
    return false
  }

  const defaultName = `.env.capgo.${entry.appId}.${platform}`
  const target = await resolveExportTarget(entry, platform, defaultName)
  if (target === null) {
    pLog.info('✗ Export cancelled.')
    return false
  }

  const content = renderEnvFile(entry, platform, creds)
  await writeFile(target.path, content, { mode: 0o600 })

  const fieldCount = Object.values(creds).filter(v => typeof v === 'string' && v.length > 0).length
  pLog.success(`✓ Exported ${fieldCount} field${fieldCount === 1 ? '' : 's'} → ${target.path} (mode 0600).`)
  pLog.info('Add it to .gitignore — never commit this file.')
  pLog.info('Reference: https://capgo.app/docs/cli/cloud-build/')
  return true
}

async function resolvePlatformChoice(entry: AppEntry, message: string): Promise<'ios' | 'android' | null> {
  if (entry.platforms.length === 1)
    return entry.platforms[0]
  const picked = await pSelect<'ios' | 'android'>({
    message,
    options: entry.platforms.map(p => ({
      value: p,
      label: p === 'ios' ? 'iOS' : 'Android',
      hint: summarizePlatformContent(entry.saved[p]),
    })),
  })
  if (pIsCancel(picked))
    return null
  return picked
}

interface ExportTarget {
  path: string
}

async function resolveExportTarget(entry: AppEntry, platform: 'ios' | 'android', defaultName: string): Promise<ExportTarget | null> {
  if (canUseFilePicker()) {
    const picked = await openSaveFilePicker({
      prompt: `Save Capgo .env for ${entry.appId} (${platform})`,
      defaultName,
      defaultLocation: cwd(),
    })
    if (picked === null)
      return null
    // macOS save dialog already asked for overwrite confirmation if needed.
    return { path: picked }
  }

  const pickedPath = await pText({
    message: 'Output file',
    placeholder: defaultName,
    validate: (value) => {
      if (!value || value.trim().length === 0)
        return undefined
      if (value.includes('\n'))
        return 'Path cannot contain newlines'
      return undefined
    },
  })
  if (pIsCancel(pickedPath))
    return null

  const rawPath = (pickedPath || defaultName).trim() || defaultName
  const expanded = rawPath.startsWith('~/') ? join(homedir(), rawPath.slice(2)) : rawPath
  const resolved = resolve(cwd(), expanded)

  if (existsSync(resolved)) {
    const overwrite = await pConfirm({
      message: `${resolved} already exists. Overwrite?`,
      initialValue: false,
    })
    if (pIsCancel(overwrite) || !overwrite)
      return null
  }

  return { path: resolved }
}

function renderEnvFile(entry: AppEntry, platform: 'ios' | 'android', creds: Partial<BuildCredentials>): string {
  const lines: string[] = []
  const generated = new Date().toISOString()
  lines.push('# Capgo build credentials — CI/CD environment file')
  lines.push(`# App: ${entry.appId}`)
  lines.push(`# Platform: ${platform}`)
  lines.push(`# Source: ${entry.local ? 'local' : 'global'} credentials store`)
  lines.push(`# Generated: ${generated}`)
  lines.push('#')
  lines.push('# Paste these into your CI/CD provider as secrets, or source the file locally:')
  lines.push('#   set -a; . ./this-file; set +a')
  lines.push('#')
  lines.push('# DO NOT commit this file. Add to .gitignore: .env.capgo.*')
  lines.push('')

  const provisioningMapRaw = creds.CAPGO_IOS_PROVISIONING_MAP
  for (const [key, value] of Object.entries(creds)) {
    if (typeof value !== 'string' || value.length === 0)
      continue
    if (key === 'CAPGO_IOS_PROVISIONING_MAP')
      continue
    lines.push(`${key}=${escapeDotenvValue(value)}`)
  }

  if (provisioningMapRaw) {
    const base64 = Buffer.from(provisioningMapRaw, 'utf-8').toString('base64')
    lines.push('')
    lines.push('# Provisioning map — base64 form is preferred to avoid newline/quoting issues in CI.')
    lines.push(`CAPGO_IOS_PROVISIONING_MAP_BASE64=${base64}`)
    lines.push(`# CAPGO_IOS_PROVISIONING_MAP=${escapeDotenvValue(provisioningMapRaw)}`)
  }

  lines.push('')
  return lines.join('\n')
}

function escapeDotenvValue(value: string): string {
  if (/^[\w./+=:-]+$/.test(value))
    return value
  const escaped = value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('$', '\\$')
    .replaceAll('`', '\\`')
    .replaceAll('\n', '\\n')
  return `"${escaped}"`
}

async function deletePlatformInteractive(entry: AppEntry): Promise<boolean> {
  if (entry.platforms.length === 0) {
    pLog.warn('Nothing to delete — no platforms configured.')
    return false
  }

  const platform = await resolvePlatformChoice(entry, 'Pick which platform to delete')
  if (platform === null)
    return false

  const confirmed = await pConfirm({
    message: `Delete ${platform} credentials for ${entry.appId} (${entry.local ? 'local' : 'global'})?`,
    initialValue: false,
  })
  if (pIsCancel(confirmed) || !confirmed)
    return false

  await clearSavedCredentials(entry.appId, platform, entry.local)
  pLog.success(`✓ Deleted ${platform} credentials for ${entry.appId} (${entry.local ? 'local' : 'global'}).`)
  return true
}
