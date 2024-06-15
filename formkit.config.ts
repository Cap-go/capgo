import type { DefaultConfigOptions } from '@formkit/vue'
import { generateClasses } from '@formkit/themes'
import { de, en, es, fr, id, it, ja, ko, pl, pt, ru, tr, vi, zh } from '@formkit/i18n'
import formkit from './src/styles/formkit'
import { i18n } from '~/modules/i18n'

export default {
  config: {
    classes: generateClasses(formkit),
  },
  locales: { de, en, es, fr, id, it, ja, ko, pl, pt, ru, tr, vi, zh },
  locale: i18n.global.locale.value,
} satisfies DefaultConfigOptions
