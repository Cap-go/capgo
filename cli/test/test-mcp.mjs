#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'

const bundlePath = join(process.cwd(), 'dist', 'index.js')

if (!existsSync(bundlePath)) {
  console.error('dist/index.js not found. Run "bun run build" first.')
  process.exit(1)
}

const withTimeout = (promise, ms, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    reject(new Error(`${label} timed out after ${ms}ms`))
  }, ms)
  promise.then(
    (value) => {
      clearTimeout(timer)
      resolve(value)
    },
    (error) => {
      clearTimeout(timer)
      reject(error)
    },
  )
})

const ciPathPatterns = [
  /\/home\/runner\/work\//g,
  /\/Users\/runner\//g,
  /C:\\\\actions-runner\\\\/g,
  /\/opt\/actions-runner\//g,
  /\/github\/workspace\//g,
]

let stderrOutput = ''

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [bundlePath, 'mcp'],
  stderr: 'pipe',
})

if (transport.stderr) {
  transport.stderr.on('data', (chunk) => {
    stderrOutput += chunk.toString()
  })
}

const client = new Client({ name: 'capgo-mcp-test', version: '0.0.0' })

try {
  await withTimeout(client.connect(transport), 10000, 'MCP connect')

  const toolsResult = await withTimeout(client.listTools({}), 10000, 'MCP tools/list')
  const tools = toolsResult?.tools ?? []

  if (tools.length === 0) {
    throw new Error('MCP server returned no tools')
  }

  const toolNames = new Set(tools.map(tool => tool.name))
  const requiredTools = [
    'capgo_list_apps',
    'capgo_upload_bundle',
    'capgo_update_channel',
    'capgo_get_stats',
    'capgo_observe',
    'capgo_login',
    'capgo_whoami',
    'capgo_logout',
    'start_capgo_builder_onboarding',
    'capgo_builder_onboarding_next_step',
    'start_capgo_live_update_onboarding',
    'capgo_update_app',
    'capgo_update_organization',
    'capgo_delete_organization',
    'capgo_list_organization_members',
    'capgo_invite_organization_member',
    'capgo_update_organization_member_role',
    'capgo_remove_organization_member',
    'capgo_get_account',
    'capgo_update_account',
  ]
  const missing = requiredTools.filter(name => !toolNames.has(name))
  if (missing.length > 0) {
    throw new Error(`Missing MCP tools: ${missing.join(', ')}`)
  }

  // Settings available in the web dashboard must stay reachable through the MCP tools.
  const requiredToolFields = {
    capgo_update_app: ['preview', 'buildTimeoutMinutes', 'exposeMetadata', 'allowDeviceCustomId', 'blockProviderInfraRequests', 'iosStoreUrl', 'androidStoreUrl', 'defaultUploadChannel', 'defaultDownloadChannel', 'disableDownloadChannels'],
    capgo_update_channel: ['electron', 'pause', 'resume', 'updatePackage'],
    capgo_update_organization: ['website', 'enforce2fa', 'passwordPolicy', 'enforceEncryptedBundles', 'requiredEncryptionKey', 'emailPreferences'],
    capgo_update_account: ['firstName', 'lastName', 'country', 'discordUsername', 'formatLocale', 'notifications', 'newsletter', 'emailPreferences'],
  }
  for (const [toolName, fields] of Object.entries(requiredToolFields)) {
    const tool = tools.find(entry => entry.name === toolName)
    const properties = Object.keys(tool?.inputSchema?.properties ?? {})
    const missingFields = fields.filter(field => !properties.includes(field))
    if (missingFields.length > 0)
      throw new Error(`${toolName} is missing input fields: ${missingFields.join(', ')}`)
  }

  for (const pattern of ciPathPatterns) {
    if (pattern.test(stderrOutput)) {
      throw new Error(`MCP stderr contains hardcoded CI paths: ${stderrOutput}`)
    }
  }

  if (stderrOutput.includes('ENOENT') && stderrOutput.includes('node_modules/@capacitor/cli')) {
    throw new Error(`MCP stderr indicates @capacitor/cli path error: ${stderrOutput}`)
  }

  console.log('✅ MCP server responds and tools are listed')
}
catch (error) {
  console.error('❌ MCP test failed')
  console.error(error)
  if (stderrOutput) {
    console.error('--- MCP stderr ---')
    console.error(stderrOutput.trim())
  }
  process.exit(1)
}
finally {
  try {
    await transport.close()
  }
  catch {
    // Ignore cleanup errors
  }
}
