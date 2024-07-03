import { changeLocale } from '@formkit/vue'
import countryCodeToFlagEmoji from 'country-code-to-flag-emoji'
import { loadLanguageAsync } from '~/modules/i18n'

export function getEmoji(country: string) {
  // convert country code to emoji flag
  let countryCode = country
  switch (country) {
    case 'en':
      countryCode = 'US'
      break
    case 'ko':
      countryCode = 'KR'
      break
    case 'ja':
      countryCode = 'JP'
      break
    default:
      break
  }
  return countryCodeToFlagEmoji(countryCode)
}

export async function changeLanguage(lang: string) {
  await loadLanguageAsync(lang)
  changeLocale(lang)
}
