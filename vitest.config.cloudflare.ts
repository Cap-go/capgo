import path from 'node:path'
import { cwd } from 'node:process'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { cloudflareWorkerUrl } from './scripts/cloudflare-test-config.ts'

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      '@capgo/cli/sdk': path.resolve(cwd(), 'cli/src/sdk.ts'),
      '~/': `${path.resolve(cwd(), 'src')}/`,
    },
  },
  test: {
    include: ['tests/*.test.ts'],
    // These raw PostgreSQL DDL/RBAC tests belong to the backend suite, not concurrent Worker integration tests.
    exclude: [
      'tests/read-replica-schema-catalog.test.ts',
      'tests/rbac-permissions.test.ts',
      'tests/private-role-bindings.test.ts',
    ],
    environment: 'node',
    watch: false,
    bail: 0, // Run all tests to see full results
    testTimeout: 30_000, // Increased timeout for Cloudflare Workers
    hookTimeout: 30_000, // Cloudflare worker-backed fixture setup can be slower in CI
    maxConcurrency: 10, // Reduced for replica sync reliability
    maxWorkers: 5, // Reduced for replica sync reliability
    env: {
      ...loadEnv(mode, cwd(), ''),
      // Override to use Cloudflare Workers instead of Supabase Edge Functions
      USE_CLOUDFLARE_WORKERS: 'true',
      CLOUDFLARE_API_URL: cloudflareWorkerUrl('CLOUDFLARE_API_URL', 8787),
      CLOUDFLARE_PLUGIN_URL: cloudflareWorkerUrl('CLOUDFLARE_PLUGIN_URL', 8788),
      CLOUDFLARE_FILES_URL: cloudflareWorkerUrl('CLOUDFLARE_FILES_URL', 8789),
    },
  },
}))
