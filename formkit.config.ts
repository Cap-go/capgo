import type { DefaultConfigOptions } from '@formkit/vue'
import { en } from '@formkit/i18n'
import { genesisIcons } from '@formkit/icons'
// import { generateClasses } from '@formkit/themes'
// import formkit from './src/styles/formkit'

import { rootClasses } from './formkit.theme'

export default {
  config: {
    rootClasses,
  // classes: generateClasses(formkit),
  },
  icons: {
    ...genesisIcons,
  },
  locales: { en },
  locale: 'en',
} satisfies DefaultConfigOptions
