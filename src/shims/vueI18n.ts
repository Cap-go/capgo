import type { Ref } from 'vue'
import { ref } from 'vue'
import { selectedLanguage, translateMessage } from '~/modules/i18n'

export type Locale = string
export type ComposerTranslation = (
  key: string,
  params?: Record<string, unknown> | string,
  defaultMsg?: string,
) => string

export const translateKey: ComposerTranslation = (key, params, defaultMsg) => {
  return translateMessage(key, params, defaultMsg)
}

interface I18nGlobal {
  locale: Ref<Locale>
  t: ComposerTranslation
  setLocaleMessage: (_lang: string, _message: unknown) => void
}

interface CreateI18nOptions {
  fallbackLocale?: string
  legacy?: boolean
  locale?: string
  messages?: Record<string, unknown>
}

export function useI18n() {
  return {
    locale: selectedLanguage,
    t: translateKey,
  }
}

export function createI18n(_options: CreateI18nOptions = {}) {
  const global: I18nGlobal = {
    locale: selectedLanguage,
    t: translateKey,
    setLocaleMessage: () => {},
  }

  return {
    global,
    install: () => {},
  }
}

export const fallbackLocale = ref('en')
