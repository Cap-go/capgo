import { cwd } from 'node:process'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  test: {
    include: ['tests/*.test.ts'],
    environment: 'node',
    watch: false,
    bail: 0, // Run all tests to see full results
    testTimeout: 30_000, // Increased timeout for Cloudflare Workers
    hookTimeout: 10_000,
    retry: 2,
    maxConcurrency: 10, // Reduced for D1 sync reliability
    maxWorkers: 5, // Reduced for D1 sync reliability
    env: {
      ...loadEnv(mode, cwd(), ''),
      // Override to use Cloudflare Workers instead of Supabase Edge Functions
      USE_CLOUDFLARE_WORKERS: 'true',
      // Cloudflare Workers run on different ports
      CLOUDFLARE_API_URL: 'http://127.0.0.1:8787',
      CLOUDFLARE_PLUGIN_URL: 'http://127.0.0.1:8788',
      CLOUDFLARE_FILES_URL: 'http://127.0.0.1:8789',
    },
  },
}))
