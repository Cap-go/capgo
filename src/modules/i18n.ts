import type { Locale } from 'vue-i18n'
import { createI18n } from 'vue-i18n'
import { type UserModule } from '~/types'

// Import i18n resources
// https://vitejs.dev/guide/features.html#glob-import
//
// Don't need this? Try vitesse-lite: https://github.com/antfu/vitesse-lite
export const i18n = createI18n({
  legacy: false,
  locale: '',
  messages: {},
})

export const availableLocales = (import.meta.env.locales).split(',')
export const languages = {
  'de': 'Deutsch',
  'en': 'English',
  'es': 'Español',
  'id': 'Bahasa Indonesia',
  'it': 'Italiano',
  'fr': 'Français',
  'ja': '日本語',
  'ko': '한국어',
  'pl': 'Polski',
  'pt-BR': 'Português (Brasil)',
  'ru': 'Русский',
  'tr': 'Türkçe',
  'vi': 'Tiếng Việt',
  'zh-CN': '简体中文',
}
const loadedLanguages: string[] = []

function setI18nLanguage(lang: Locale) {
  i18n.global.locale.value = lang as any
  document.querySelector('html')?.setAttribute('lang', lang)
  return lang
}

export function loadLanguageAsync(lang: string) {
  // If the same language
  if (i18n.global.locale.value === lang)
    return Promise.resolve(setI18nLanguage(lang))

  // If the language was already loaded
  if (loadedLanguages.includes(lang))
    return Promise.resolve(setI18nLanguage(lang))

  // If the language hasn't been loaded yet
  return import(`../../locales/${lang}.yml`).then(
    (messages) => {
      i18n.global.setLocaleMessage(lang, messages.default)
      loadedLanguages.push(lang)
      localStorage.setItem('lang', lang)
      return setI18nLanguage(lang)
    },
  )
}

export const install: UserModule = ({ app }) => {
  app.use(i18n)
  const lang = localStorage.getItem('lang') || window.navigator.language.split('-')[0]
  loadLanguageAsync(lang)
}
