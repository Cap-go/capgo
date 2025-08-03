#!/usr/bin/env node

import { writeFileSync } from 'node:fs'
import { env } from 'node:process'

// Get PR number from environment variable
const prNumber = env.PR_NUMBER || 'test'
const workerType = env.WORKER_TYPE || 'api' // api, files, or plugin

// Base configuration for all workers
const baseConfig = {
  compatibility_date: "2025-04-01",
  compatibility_flags: [
    "nodejs_compat_v2",
    "nodejs_compat_populate_process_env"
  ],
  workers_dev: true,
  placement: {
    mode: "smart"
  },
  observability: {
    enabled: true
  }
}

// Worker-specific configurations
const workerConfigs = {
  api: {
    name: `capgo-api-preview-${prNumber}`,
    main: "./cloudflare_workers/api/index.ts",
    analytics_engine_datasets: [
      {
        binding: "DEVICE_USAGE",
        dataset: "device_usage_preview"
      },
      {
        binding: "BANDWIDTH_USAGE", 
        dataset: "bandwidth_usage_preview"
      },
      {
        binding: "VERSION_USAGE",
        dataset: "version_usage_preview"
      },
      {
        binding: "APP_LOG",
        dataset: "app_log_preview"
      },
      {
        binding: "APP_LOG_EXTERNAL",
        dataset: "app_log_external_preview"
      }
    ]
  },
  files: {
    name: `capgo-files-preview-${prNumber}`,
    main: "./cloudflare_workers/files/index.ts"
  },
  plugin: {
    name: `capgo-plugin-preview-${prNumber}`,
    main: "./cloudflare_workers/plugin/index.ts"
  }
}

// Generate the configuration
const config = {
  ...baseConfig,
  ...workerConfigs[workerType]
}

// Write the configuration to a temporary file
const outputPath = `/tmp/wrangler-${workerType}-preview.json`
writeFileSync(outputPath, JSON.stringify(config, null, 2))

console.log(`Generated wrangler config for ${workerType} worker: ${outputPath}`)
console.log(`Worker name: ${config.name}`)