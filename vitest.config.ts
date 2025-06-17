import { cwd } from 'node:process'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  test: {
    // pool: 'threads',
    // pool: 'vmThreads',
    include: ['tests/*.test.ts'],
    environment: 'node',
    watch: false,
    bail: 1,
    testTimeout: 20_000, // Reduced from 20s
    hookTimeout: 8_000, // Reduced from 8s
    retry: 2, // Reduced from 2
    maxConcurrency: 50, // Reduced from 32 to prevent deadlocks
    minWorkers: 1,
    maxWorkers: 24, // Reduced from 24 to prevent resource conflicts
    env: loadEnv(mode, cwd(), ''),
  },
}))
