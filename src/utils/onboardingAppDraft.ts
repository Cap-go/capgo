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

const STORAGE_KEY = 'capgo:onboarding-app-draft'

export function loadOnboardingAppDraft(): OnboardingAppDraft | null {
  if (typeof sessionStorage === 'undefined')
    return null

  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw)
    return null

  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingAppDraft>
    if (!parsed.appName?.trim() || !parsed.appId?.trim())
      return null

    return {
      appName: parsed.appName.trim(),
      appId: parsed.appId.trim(),
      existingApp: parsed.existingApp === true,
      existingAppSetup: parsed.existingAppSetup === 'import' || parsed.existingAppSetup === 'manual'
        ? parsed.existingAppSetup
        : null,
      storeUrl: parsed.storeUrl?.trim() ?? '',
      importedStoreAppId: parsed.importedStoreAppId?.trim() ?? '',
      iosStoreUrl: parsed.iosStoreUrl ?? null,
      androidStoreUrl: parsed.androidStoreUrl ?? null,
      iconDataUrl: parsed.iconDataUrl ?? null,
      storeIconDataUrl: parsed.storeIconDataUrl ?? null,
      storeScreenshotUrl: parsed.storeScreenshotUrl ?? null,
    }
  }
  catch {
    return null
  }
}

export function saveOnboardingAppDraft(draft: OnboardingAppDraft) {
  if (typeof sessionStorage === 'undefined')
    return

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
}

export function clearOnboardingAppDraft() {
  if (typeof sessionStorage === 'undefined')
    return

  sessionStorage.removeItem(STORAGE_KEY)
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
