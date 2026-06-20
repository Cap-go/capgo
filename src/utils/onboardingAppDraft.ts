export interface OnboardingAppDraft {
  appName: string
  appId: string
  existingApp: boolean
  existingAppSetup: 'import' | 'manual' | null
  storeUrl: string
  importedStoreAppId: string
  iosStoreUrl: string | null
  androidStoreUrl: string | null
  iconDataUrl: string | null
  storeIconDataUrl: string | null
  storeScreenshotUrl: string | null
}

const STORAGE_KEY_PREFIX = 'capgo:onboarding-app-draft'
const LEGACY_STORAGE_KEY = 'capgo:onboarding-app-draft'

function getDraftStorageKey(userId?: string | null): string | null {
  const normalizedUserId = userId?.trim()
  if (!normalizedUserId)
    return null

  return `${STORAGE_KEY_PREFIX}:${normalizedUserId}`
}

export function loadOnboardingAppDraft(userId?: string | null): OnboardingAppDraft | null {
  if (typeof sessionStorage === 'undefined')
    return null

  const storageKey = getDraftStorageKey(userId)
  const raw = storageKey
    ? sessionStorage.getItem(storageKey)
    : sessionStorage.getItem(LEGACY_STORAGE_KEY)
  if (!raw)
    return null

  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingAppDraft>
    if (typeof parsed.appName !== 'string' || !parsed.appName.trim())
      return null
    if (typeof parsed.appId !== 'string' || !parsed.appId.trim())
      return null

    return {
      appName: parsed.appName.trim(),
      appId: parsed.appId.trim(),
      existingApp: parsed.existingApp === true,
      existingAppSetup: parsed.existingAppSetup === 'import' || parsed.existingAppSetup === 'manual'
        ? parsed.existingAppSetup
        : null,
      storeUrl: typeof parsed.storeUrl === 'string' ? parsed.storeUrl.trim() : '',
      importedStoreAppId: typeof parsed.importedStoreAppId === 'string' ? parsed.importedStoreAppId.trim() : '',
      iosStoreUrl: typeof parsed.iosStoreUrl === 'string' ? parsed.iosStoreUrl : null,
      androidStoreUrl: typeof parsed.androidStoreUrl === 'string' ? parsed.androidStoreUrl : null,
      iconDataUrl: typeof parsed.iconDataUrl === 'string' ? parsed.iconDataUrl : null,
      storeIconDataUrl: typeof parsed.storeIconDataUrl === 'string' ? parsed.storeIconDataUrl : null,
      storeScreenshotUrl: typeof parsed.storeScreenshotUrl === 'string' ? parsed.storeScreenshotUrl : null,
    }
  }
  catch {
    return null
  }
}

export function saveOnboardingAppDraft(draft: OnboardingAppDraft, userId?: string | null) {
  if (typeof sessionStorage === 'undefined')
    return

  const storageKey = getDraftStorageKey(userId)
  if (!storageKey)
    return

  sessionStorage.setItem(storageKey, JSON.stringify(draft))
}

export function clearOnboardingAppDraft(userId?: string | null) {
  if (typeof sessionStorage === 'undefined')
    return

  const storageKey = getDraftStorageKey(userId)
  if (storageKey)
    sessionStorage.removeItem(storageKey)

  sessionStorage.removeItem(LEGACY_STORAGE_KEY)
}

export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export async function remoteImageToDataUrl(url: string): Promise<string | null> {
  if (!url || url.startsWith('data:'))
    return url || null

  try {
    const response = await fetch(url)
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
    if (!response.ok || !contentType.startsWith('image/'))
      return null

    const blob = await response.blob()
    return await fileToDataUrl(new File([blob], 'icon.png', { type: blob.type || contentType }))
  }
  catch {
    return null
  }
}
