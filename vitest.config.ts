import path from 'node:path'
import { cwd } from 'node:process'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      '@capgo/cli/sdk': path.resolve(cwd(), 'cli/src/sdk.ts'),
      '~/': `${path.resolve(cwd(), 'src')}/`,
    },
  },
  test: {
    include: ['tests/*.test.ts'],
    environment: 'node',
    watch: false,
    // Let the run report all failures rather than stopping at the first one.
    bail: 0,
    testTimeout: 30_000, // Increased from 20s to handle slow edge function responses
    hookTimeout: 15_000, // Setup/teardown should complete promptly with isolated fixtures
    retry: 0,
    // Keep load low: parallel file workers overload local Supabase edge into
    // intermittent 502/503 mid-suite (false-red organization/channel shards).
    maxConcurrency: 2,
    maxWorkers: 2,
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
