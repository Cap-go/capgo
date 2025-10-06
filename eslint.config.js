import process from 'node:process'
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    vue: true,
    rules: {
      'vue/no-deprecated-slot-attribute': 'off',
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
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
  {
    // Exceptions: allow v-html in vetted components
    files: [
      'src/components/Table.vue',
      'src/components/TableLog.vue',
    ],
    rules: {
      'vue/no-v-html': 'off',
    },
  },
)
