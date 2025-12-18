import { env } from 'node:process'
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    vue: true,
    formatters: true,
    rules: {
      'no-console': env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-debugger': env.NODE_ENV === 'production' ? 'warn' : 'off',
    },
    ignores: [
      'dist',
      'scripts',
      'public',
      'supabase/functions/_script',
      '**/supabase.types*',
      'supabase/functions/_backend/scripts/*',
      'CHANGELOG.md',
    ],
  },
  {
    // Vue-specific overrides
    files: ['**/*.vue'],
    rules: {
      // Globally disallow v-html
      'vue/no-v-html': 'error',
    },
  },
)
