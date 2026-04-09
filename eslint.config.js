import { env } from 'node:process'

if (typeof Object.groupBy !== 'function') {
  Object.groupBy = function groupBy(items, callbackfn) {
    return Array.from(items).reduce((groups, item, index) => {
      const key = callbackfn(item, index)
      if (!Object.hasOwn(groups, key)) {
        groups[key] = []
      }
      groups[key].push(item)
      return groups
    }, Object.create(null))
  }
}

const { default: antfu } = await import('@antfu/eslint-config')

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
      'src/services/posthog.ts',
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
