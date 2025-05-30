import { cwd} from 'node:process'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  test: {
    include: ['tests/*.test.ts'],
    environment: 'node',
    watch: false,
    bail: 1,
    testTimeout: 20_000, // Reduced further from 30s
    hookTimeout: 8_000, // Reduced timeout for hooks
    retry: 1, // Reduced retry attempts
    maxConcurrency: 24, // Increased from 16
    minWorkers: 1,
    maxWorkers: 16, // Explicit worker control
    env: loadEnv(mode, cwd(), ''),
  },
}))
