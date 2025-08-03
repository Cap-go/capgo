#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { env } from 'node:process'

// Get PR number from environment variable
const prNumber = env.PR_NUMBER || 'test'

// Function to execute commands with error handling
function executeCommand(command, description) {
  try {
    console.log(`🔄 ${description}...`)
    execSync(command, { stdio: 'inherit' })
    console.log(`✅ ${description} completed successfully`)
  } catch (error) {
    console.log(`⚠️ ${description} failed (resource may not exist): ${error.message}`)
  }
}

console.log(`🧹 Starting cleanup for preview environment: PR #${prNumber}`)

// Delete Cloudflare Pages project
executeCommand(
  `bunx wrangler@latest pages project delete capgo-preview-${prNumber} --yes`,
  `Deleting Pages project capgo-preview-${prNumber}`
)

// Delete Workers
const workers = [
  `capgo-api-preview-${prNumber}`,
  `capgo-files-preview-${prNumber}`,
  `capgo-plugin-preview-${prNumber}`
]

workers.forEach(workerName => {
  executeCommand(
    `bunx wrangler delete ${workerName} --force`,
    `Deleting worker ${workerName}`
  )
})

console.log(`🎉 Cleanup completed for PR #${prNumber}`)
console.log(`\nRemoved resources:`)
console.log(`- Pages project: capgo-preview-${prNumber}`)
console.log(`- API worker: capgo-api-preview-${prNumber}`)
console.log(`- Files worker: capgo-files-preview-${prNumber}`)
console.log(`- Plugin worker: capgo-plugin-preview-${prNumber}`)