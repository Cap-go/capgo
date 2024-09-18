import antfu from '@antfu/eslint-config'

export default antfu(
  {
    rules: {
      'vue/no-deprecated-slot-attribute': 'off',
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    },
    ignores: [
      'dist',
      'public',
      '**/supabase.types*',
      'supabase/functions/_backend/scripts/*',
      'CHANGELOG.md',
    ],
  },
)
