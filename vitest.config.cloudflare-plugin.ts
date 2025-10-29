import { cwd } from 'node:process'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  test: {
    include: ['tests/*.test.ts'],
    environment: 'node',
    watch: false,
    bail: 0,
    testTimeout: 30_000,
    hookTimeout: 10_000,
    retry: 2,
    // Very low concurrency for plugin tests that need D1 sync
    maxConcurrency: 1, // Run tests sequentially
    maxWorkers: 1, // Single worker
    env: {
      ...loadEnv(mode, cwd(), ''),
      USE_CLOUDFLARE_WORKERS: 'true',
      CLOUDFLARE_API_URL: 'http://127.0.0.1:8787',
      CLOUDFLARE_PLUGIN_URL: 'http://127.0.0.1:8788',
      CLOUDFLARE_FILES_URL: 'http://127.0.0.1:8789',
    },
  },
}))
