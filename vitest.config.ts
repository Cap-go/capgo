import { cwd } from 'node:process'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  test: {
    include: ['tests/*.test.ts'],
    environment: 'node',
    watch: false,
    bail: 1,
    testTimeout: 30_000, // Increased from 20s to handle slow edge function responses
    hookTimeout: 15_000, // Increased from 8s to handle slow setup/teardown
    retry: 3, // Increased retries for network flakiness
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
