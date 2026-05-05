import type { DefaultConfigOptions } from '@formkit/vue'
import { en } from '@formkit/i18n'
import { genesisIcons } from '@formkit/icons'
// import { generateClasses } from '@formkit/themes'
// import formkit from './src/styles/formkit'

import { rootClasses } from './formkit.theme'

const SOURCE_FORMKIT_LOCALE = 'en'

export default {
  config: {
    rootClasses,
  // classes: generateClasses(formkit),
  },
  icons: {
    ...genesisIcons,
  },
  locales: { en },
  // FormKit keeps English source strings and the runtime page translator localizes
  // the rendered validation copy, so we do not ship per-locale FormKit bundles.
  locale: SOURCE_FORMKIT_LOCALE,
} satisfies DefaultConfigOptions
