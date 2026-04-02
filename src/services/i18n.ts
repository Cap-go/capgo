import countryCodeToFlagEmoji from 'country-code-to-flag-emoji'
import { getLanguageConfig, getSelectedLanguage, loadLanguageAsync, normalizeLanguage } from '../modules/i18n'

export function getEmoji(countryCode: string) {
  return countryCodeToFlagEmoji(countryCode.trim().toUpperCase())
}

export function getLanguageEmoji(lang: string) {
  return countryCodeToFlagEmoji(getLanguageConfig(lang).countryCode)
}

export async function changeLanguage(lang: string, options?: { reload?: boolean }) {
  const currentLanguage = getSelectedLanguage()
  const nextLanguage = normalizeLanguage(lang)

  if (currentLanguage === nextLanguage)
    return nextLanguage

  await loadLanguageAsync(nextLanguage)

  // Runtime message bundles now update `t(...)` output without a full reload.
  // Keep opt-in reload support for callers that still need a hard refresh.
  if (options?.reload === true && typeof window !== 'undefined')
    window.location.reload()

  return nextLanguage
}
