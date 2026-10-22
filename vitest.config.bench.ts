import path from 'node:path'
import { cwd } from 'node:process'
import codspeedPlugin from '@codspeed/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [codspeedPlugin()],
  resolve: {
    alias: {
      '@capgo/cli/sdk': path.resolve(cwd(), 'cli/src/sdk.ts'),
      '~/': `${path.resolve(cwd(), 'src')}/`,
    },
  },
  test: {
    // Vitest 5 defaults clearMocks to true; keep the v4 behavior so mock calls
    // recorded while a test module is imported stay visible to its tests.
    clearMocks: false,
    environment: 'node',
    benchmark: {
      include: ['benches/**/*.bench.ts'],
    },
  },
})
