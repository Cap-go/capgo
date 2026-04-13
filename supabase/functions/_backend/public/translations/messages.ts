import type { SupportedLocale } from '../../../../../src/constants/locales.ts'

type MessageDictionary = Record<string, string>
interface MessageModule {
  default: MessageDictionary
}

const localeMessages = new Map<SupportedLocale, MessageDictionary>()

const messageLoaders: Record<SupportedLocale, () => Promise<MessageModule>> = {
  'de': () => import('../../../../../messages/de.json', { with: { type: 'json' } }),
  'en': () => import('../../../../../messages/en.json', { with: { type: 'json' } }),
  'es': () => import('../../../../../messages/es.json', { with: { type: 'json' } }),
  'fr': () => import('../../../../../messages/fr.json', { with: { type: 'json' } }),
  'hi': () => import('../../../../../messages/hi.json', { with: { type: 'json' } }),
  'id': () => import('../../../../../messages/id.json', { with: { type: 'json' } }),
  'it': () => import('../../../../../messages/it.json', { with: { type: 'json' } }),
  'ja': () => import('../../../../../messages/ja.json', { with: { type: 'json' } }),
  'ko': () => import('../../../../../messages/ko.json', { with: { type: 'json' } }),
  'pl': () => import('../../../../../messages/pl.json', { with: { type: 'json' } }),
  'pt-br': () => import('../../../../../messages/pt-br.json', { with: { type: 'json' } }),
  'ru': () => import('../../../../../messages/ru.json', { with: { type: 'json' } }),
  'tr': () => import('../../../../../messages/tr.json', { with: { type: 'json' } }),
  'vi': () => import('../../../../../messages/vi.json', { with: { type: 'json' } }),
  'zh-cn': () => import('../../../../../messages/zh-cn.json', { with: { type: 'json' } }),
}

export async function getLocaleMessages(locale: SupportedLocale): Promise<MessageDictionary> {
  const cachedMessages = localeMessages.get(locale)
  if (cachedMessages)
    return cachedMessages

  const { default: messages } = await messageLoaders[locale]()
  localeMessages.set(locale, messages)
  return messages
}
