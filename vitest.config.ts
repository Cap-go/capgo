import { cwd } from 'node:process'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  test: {
    include: ['tests/*.test.ts'],
    environment: 'node',
    watch: false,
    bail: 1,
    testTimeout: 30_000,
    hookTimeout: 15_000,
    retry: 2,
    maxConcurrency: 10, // Reduced to prevent worker communication issues
    maxWorkers: 4, // Reduced to prevent EPIPE errors
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
        // Prevent worker reuse issues
        execArgv: [],
      },
    },
    // Allow graceful shutdown of workers
    teardownTimeout: 10_000,
    env: loadEnv(mode, cwd(), ''),
  },
}))
