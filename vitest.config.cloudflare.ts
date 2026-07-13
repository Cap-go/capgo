import path from 'node:path'
import { cwd, env } from 'node:process'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

const cloudflareWorkerPortOffset = Number(env.CLOUDFLARE_WORKER_PORT_OFFSET ?? '0')
if (!Number.isSafeInteger(cloudflareWorkerPortOffset) || cloudflareWorkerPortOffset < 0 || cloudflareWorkerPortOffset > 50000)
  throw new Error('CLOUDFLARE_WORKER_PORT_OFFSET must be a non-negative integer no greater than 50000.')

function cloudflareWorkerUrl(name: 'CLOUDFLARE_API_URL' | 'CLOUDFLARE_PLUGIN_URL' | 'CLOUDFLARE_FILES_URL', basePort: number): string {
  return env[name] || `http://127.0.0.1:${basePort + cloudflareWorkerPortOffset}`
}

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
