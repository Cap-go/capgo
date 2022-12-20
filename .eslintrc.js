module.exports = {
  extends: [
    '@antfu',
  ],
  ignorePatterns: ['src/types/supabase.types.ts', 'supabase/functions/_utils/supabase.types.ts'],
  rules: {
    'vue/no-deprecated-slot-attribute': 'off',
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
  },
}
