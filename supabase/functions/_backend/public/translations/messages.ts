import type { SupportedLocale } from '../../../../../src/constants/locales.ts'
import deMessages from '../../../../../messages/de.json' with { type: 'json' }
import enMessages from '../../../../../messages/en.json' with { type: 'json' }
import esMessages from '../../../../../messages/es.json' with { type: 'json' }
import frMessages from '../../../../../messages/fr.json' with { type: 'json' }
import hiMessages from '../../../../../messages/hi.json' with { type: 'json' }
import idMessages from '../../../../../messages/id.json' with { type: 'json' }
import itMessages from '../../../../../messages/it.json' with { type: 'json' }
import jaMessages from '../../../../../messages/ja.json' with { type: 'json' }
import koMessages from '../../../../../messages/ko.json' with { type: 'json' }
import plMessages from '../../../../../messages/pl.json' with { type: 'json' }
import ptBrMessages from '../../../../../messages/pt-br.json' with { type: 'json' }
import ruMessages from '../../../../../messages/ru.json' with { type: 'json' }
import trMessages from '../../../../../messages/tr.json' with { type: 'json' }
import viMessages from '../../../../../messages/vi.json' with { type: 'json' }
import zhCnMessages from '../../../../../messages/zh-cn.json' with { type: 'json' }

type MessageDictionary = Record<string, string>

const localeMessages: Record<SupportedLocale, MessageDictionary> = {
  'de': deMessages,
  'en': enMessages,
  'es': esMessages,
  'fr': frMessages,
  'hi': hiMessages,
  'id': idMessages,
  'it': itMessages,
  'ja': jaMessages,
  'ko': koMessages,
  'pl': plMessages,
  'pt-br': ptBrMessages,
  'ru': ruMessages,
  'tr': trMessages,
  'vi': viMessages,
  'zh-cn': zhCnMessages,
}

export function getLocaleMessages(locale: SupportedLocale): MessageDictionary {
  return localeMessages[locale]
}
