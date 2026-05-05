import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    'dist',
    'test',
    'webpack.config.js',
    'src/types/supabase.types.ts',
  ],
  rules: {
    // The standalone CLI codebase currently relies on a number of inline regex
    // literals. Keep the existing lint baseline while the workspace is merged,
    // and handle any large-scale regex hoisting in a dedicated cleanup pass.
    'e18e/prefer-static-regex': 'off',
  },
})
