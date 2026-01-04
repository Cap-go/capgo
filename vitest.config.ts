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

    maxConcurrency: 5, // Reduced to prevent connection exhaustion
    // Vitest 4: pool options are now top-level
    isolate: true,
    fileParallelism: true,
    // Allow graceful shutdown of workers
    teardownTimeout: 15_000,
    // Sequence to reduce parallel load on edge functions
    sequence: {
      shuffle: false, // Run in predictable order
    },
    env: loadEnv(mode, cwd(), ''),
  },
}))
