import type { DefaultConfigOptions } from '@formkit/vue'
import { generateClasses } from '@formkit/themes'
import formkit from './src/styles/formkit'

export default {
  config: {
    classes: generateClasses(formkit),
  },
} satisfies DefaultConfigOptions
