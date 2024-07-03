import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests_cli/*.test.ts'],
    environment: 'node',
    watch: false,
    testTimeout: 30_000,
  },
})
