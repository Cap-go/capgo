import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignorePatterns: ['src/types/supabase.types.ts', 'supabase/functions/utils/supabase.types.ts', 'supabase/functions/_script/'],
    rules: {
      'vue/no-deprecated-slot-attribute': 'off',
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    },
  },
)
