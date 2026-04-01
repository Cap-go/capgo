import countryCodeToFlagEmoji from 'country-code-to-flag-emoji'
import { getLanguageConfig, getSelectedLanguage, loadLanguageAsync, normalizeLanguage } from '~/modules/i18n'

export function getEmoji(lang: string) {
  return countryCodeToFlagEmoji(getLanguageConfig(lang).countryCode)
}

export async function changeLanguage(lang: string) {
  const currentLanguage = getSelectedLanguage()
  const nextLanguage = normalizeLanguage(lang)

  if (currentLanguage === nextLanguage)
    return nextLanguage

  await loadLanguageAsync(nextLanguage)

  // The page translator rehydrates from rendered English source content after a
  // full reload, so callers should persist any unsaved in-memory form state first.
  if (typeof window !== 'undefined')
    window.location.reload()

  return nextLanguage
}
