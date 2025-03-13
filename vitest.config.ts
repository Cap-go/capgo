import process from 'node:process'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  test: {
    include: ['tests/*.test.ts'],
    environment: 'node', // TODO: switch to bun to see if warning remove
    watch: false,
    testTimeout: 60_000,
    retry: 3,
    maxConcurrency: 12,
    env: loadEnv(mode, process.cwd(), ''),
  },
}))
