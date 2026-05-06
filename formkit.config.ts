import type { DefaultConfigOptions } from '@formkit/vue'
import { de, en, es, fr, id, it, ja, ko, pl, pt, ru, tr, vi, zh } from '@formkit/i18n'
import { genesisIcons } from '@formkit/icons'
// import { generateClasses } from '@formkit/themes'
// import formkit from './src/styles/formkit'
import { i18n } from '~/modules/i18n'

import { rootClasses } from './formkit.theme'

export default {
  config: {
    rootClasses,
  // classes: generateClasses(formkit),
  },
  icons: {
    ...genesisIcons,
  },
  locales: { de, en, es, fr, id, it, ja, ko, pl, pt, ru, tr, vi, zh },
  locale: i18n.global.locale.value,
} satisfies DefaultConfigOptions
