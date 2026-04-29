import type { SDKResult } from '../schemas/sdk'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import pack from '../../package.json'
import { addAppOptionsSchema, cleanupOptionsSchema, getStatsOptionsSchema, starAllRepositoriesOptionsSchema, starRepoOptionsSchema, updateAppOptionsSchema, updateChannelOptionsSchema, uploadOptionsSchema } from '../schemas/sdk'
import { CapgoSDK } from '../sdk'
import { findSavedKey } from '../utils'

/**
 * Format an SDK result error for MCP response.
 * Provides detailed error messages for security policy errors.
 */
function formatMcpError<T>(result: SDKResult<T>): { content: Array<{ type: 'text', text: string }>, isError: true } {
  let errorMessage = result.error || 'Unknown error'

  // If it's a security policy error, use the detailed message
  if (result.isSecurityPolicyError && result.securityPolicyMessage) {
    errorMessage = `Security Policy Error:\n\n${result.securityPolicyMessage}`
  }

  return {
    content: [{ type: 'text' as const, text: errorMessage }],
    isError: true,
  }
}

/**
 * Start the Capgo MCP (Model Context Protocol) server.
 * This allows AI agents to interact with Capgo Cloud programmatically.
 */
export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: 'capgo',
    version: pack.version,
  })

  // Initialize SDK - will use saved API key or require it per-call
  let savedApiKey: string | undefined
  try {
    savedApiKey = findSavedKey(true)
  }
  catch {
    savedApiKey = undefined
  }
  const sdk = new CapgoSDK({ apikey: savedApiKey })

  // ============================================================================
  // App Management Tools
  // ============================================================================

  server.tool(
    'capgo_list_apps',
    'List all apps registered in your Capgo Cloud account',
    {},
    async () => {
      const result = await sdk.listApps()
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result.data, null, 2),
        }],
      }
    },
  )

  server.tool(
    'capgo_add_app',
    'Register a new app in Capgo Cloud',
    addAppOptionsSchema.pick({ appId: true, name: true, icon: true }).shape,
    async ({ appId, name, icon }) => {
      const result = await sdk.addApp({ appId, name, icon })
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{ type: 'text' as const, text: `Successfully added app: ${appId}` }],
      }
    },
  )

  server.tool(
    'capgo_update_app',
    'Update settings for an existing app in Capgo Cloud',
    updateAppOptionsSchema.pick({ appId: true, name: true, icon: true, retention: true }).shape,
    async ({ appId, name, icon, retention }) => {
      const result = await sdk.updateApp({ appId, name, icon, retention })
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{ type: 'text' as const, text: `Successfully updated app: ${appId}` }],
      }
    },
  )

  server.tool(
    'capgo_delete_app',
    'Delete an app from Capgo Cloud',
    {
      appId: z.string().describe('App ID to delete'),
    },
    async ({ appId }) => {
      const result = await sdk.deleteApp(appId, true) // skipConfirmation=true for non-interactive
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{ type: 'text' as const, text: `Successfully deleted app: ${appId}` }],
      }
    },
  )

  // ============================================================================
  // Bundle Management Tools
  // ============================================================================

  server.tool(
    'capgo_upload_bundle',
    'Upload a new app bundle to Capgo Cloud for distribution',
    uploadOptionsSchema.pick({ appId: true, path: true, bundle: true, channel: true, comment: true, minUpdateVersion: true, autoMinUpdateVersion: true, encrypt: true }).shape,
    async ({ appId, path, bundle, channel, comment, minUpdateVersion, autoMinUpdateVersion, encrypt }) => {
      const result = await sdk.uploadBundle({
        appId,
        path,
        bundle,
        channel,
        comment,
        minUpdateVersion,
        autoMinUpdateVersion,
        encrypt,
      })
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            message: 'Bundle uploaded successfully',
            bundleId: result.bundleId,
            checksum: result.checksum,
            skipped: result.skipped,
            reason: result.reason,
          }, null, 2),
        }],
      }
    },
  )

  server.tool(
    'capgo_star_repository',
    'Star a GitHub repository to support Capgo',
    starRepoOptionsSchema.shape,
    async ({ repository }) => {
      const result = await sdk.starRepo({ repository })
      if (!result.success) {
        return formatMcpError(result)
      }

      const status = result.data?.alreadyStarred ? 'already starred' : 'starred successfully'
      return {
        content: [{
          type: 'text' as const,
          text: `Repository ${result.data?.repository} is ${status}.`,
        }],
      }
    },
  )

  server.tool(
    'capgo_star_all_repositories',
    'Star the default Capgo repositories on GitHub with a random delay between requests',
    starAllRepositoriesOptionsSchema.shape,
    async ({ repositories, minDelayMs, maxDelayMs }) => {
      const result = await sdk.starAllRepositories({ repositories, minDelayMs, maxDelayMs })
      if (!result.success) {
        return formatMcpError(result)
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result.data, null, 2),
        }],
      }
    },
  )

  server.tool(
    'capgo_list_bundles',
    'List all bundles uploaded for an app',
    {
      appId: z.string().describe('App ID to list bundles for'),
    },
    async ({ appId }) => {
      const result = await sdk.listBundles(appId)
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result.data, null, 2),
        }],
      }
    },
  )

  server.tool(
    'capgo_delete_bundle',
    'Delete a specific bundle from Capgo Cloud',
    {
      appId: z.string().describe('App ID'),
      bundleId: z.string().describe('Bundle version to delete'),
    },
    async ({ appId, bundleId }) => {
      const result = await sdk.deleteBundle(appId, bundleId)
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{ type: 'text' as const, text: `Successfully deleted bundle: ${bundleId}` }],
      }
    },
  )

  server.tool(
    'capgo_cleanup_bundles',
    'Delete old bundles, keeping only recent versions',
    cleanupOptionsSchema.pick({ appId: true, keep: true, bundle: true, force: true, ignoreChannel: true }).shape,
    async ({ appId, keep, bundle, force, ignoreChannel }) => {
      const result = await sdk.cleanupBundles({
        appId,
        keep,
        bundle,
        force: force ?? true, // Default to true for non-interactive
        ignoreChannel,
      })
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            message: 'Cleanup completed',
            removed: result.data?.removed,
            kept: result.data?.kept,
          }, null, 2),
        }],
      }
    },
  )

  server.tool(
    'capgo_check_compatibility',
    'Check bundle compatibility with a specific channel',
    {
      appId: z.string().describe('App ID to check'),
      channel: z.string().describe('Channel to check compatibility with'),
      packageJson: z.string().optional().describe('Path to package.json for monorepos'),
    },
    async ({ appId, channel, packageJson }) => {
      const result = await sdk.checkBundleCompatibility({
        appId,
        channel,
        packageJson,
      })
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result.data, null, 2),
        }],
      }
    },
  )

  // ============================================================================
  // Channel Management Tools
  // ============================================================================

  server.tool(
    'capgo_list_channels',
    'List all channels for an app',
    {
      appId: z.string().describe('App ID to list channels for'),
    },
    async ({ appId }) => {
      const result = await sdk.listChannels(appId)
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result.data, null, 2),
        }],
      }
    },
  )

  server.tool(
    'capgo_add_channel',
    'Create a new distribution channel for an app',
    {
      appId: z.string().describe('App ID'),
      channelId: z.string().describe('Channel name/ID to create'),
      default: z.boolean().optional().describe('Set as default channel'),
      selfAssign: z.boolean().optional().describe('Allow devices to self-assign to this channel'),
    },
    async ({ appId, channelId, default: isDefault, selfAssign }) => {
      const result = await sdk.addChannel({
        appId,
        channelId,
        default: isDefault,
        selfAssign,
      })
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{ type: 'text' as const, text: `Successfully created channel: ${channelId}` }],
      }
    },
  )

  server.tool(
    'capgo_update_channel',
    'Update channel settings including linked bundle and targeting options',
    updateChannelOptionsSchema.pick({ appId: true, channelId: true, bundle: true, state: true, downgrade: true, ios: true, android: true, selfAssign: true, disableAutoUpdate: true, dev: true, emulator: true, device: true, prod: true }).shape,
    async ({ appId, channelId, bundle, state, downgrade, ios, android, selfAssign, disableAutoUpdate, dev, emulator, device, prod }) => {
      const result = await sdk.updateChannel({
        appId,
        channelId,
        bundle,
        state,
        downgrade,
        ios,
        android,
        selfAssign,
        disableAutoUpdate,
        dev,
        emulator,
        device,
        prod,
      })
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{ type: 'text' as const, text: `Successfully updated channel: ${channelId}` }],
      }
    },
  )

  server.tool(
    'capgo_delete_channel',
    'Delete a channel from an app',
    {
      appId: z.string().describe('App ID'),
      channelId: z.string().describe('Channel name/ID to delete'),
      deleteBundle: z.boolean().optional().describe('Also delete the bundle linked to this channel'),
    },
    async ({ appId, channelId, deleteBundle }) => {
      const result = await sdk.deleteChannel(channelId, appId, deleteBundle)
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{ type: 'text' as const, text: `Successfully deleted channel: ${channelId}` }],
      }
    },
  )

  server.tool(
    'capgo_get_current_bundle',
    'Get the current bundle linked to a specific channel',
    {
      appId: z.string().describe('App ID'),
      channelId: z.string().describe('Channel name/ID'),
    },
    async ({ appId, channelId }) => {
      const result = await sdk.getCurrentBundle(appId, channelId)
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ channel: channelId, currentBundle: result.data }, null, 2),
        }],
      }
    },
  )

  // ============================================================================
  // Organization Management Tools
  // ============================================================================

  server.tool(
    'capgo_list_organizations',
    'List all organizations you have access to',
    {},
    async () => {
      const result = await sdk.listOrganizations()
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result.data, null, 2),
        }],
      }
    },
  )

  server.tool(
    'capgo_add_organization',
    'Create a new organization for team collaboration',
    {
      name: z.string().describe('Organization name'),
      email: z.string().describe('Management email for the organization'),
    },
    async ({ name, email }) => {
      const result = await sdk.addOrganization({ name, email })
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            message: 'Organization created successfully',
            ...result.data,
          }, null, 2),
        }],
      }
    },
  )

  // ============================================================================
  // Account & Diagnostics Tools
  // ============================================================================

  server.tool(
    'capgo_get_account_id',
    'Get the account ID associated with the current API key',
    {},
    async () => {
      const result = await sdk.getAccountId()
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ accountId: result.data }, null, 2),
        }],
      }
    },
  )

  server.tool(
    'capgo_doctor',
    'Run diagnostics on the Capgo installation and get system information',
    {
      packageJson: z.string().optional().describe('Path to package.json for monorepos'),
    },
    async ({ packageJson }) => {
      const result = await sdk.doctor({ packageJson })
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result.data, null, 2),
        }],
      }
    },
  )

  server.tool(
    'capgo_get_stats',
    'Get device statistics and logs from Capgo backend for debugging',
    getStatsOptionsSchema.pick({ appId: true, deviceIds: true, limit: true, rangeStart: true, rangeEnd: true }).shape,
    async ({ appId, deviceIds, limit, rangeStart, rangeEnd }) => {
      const result = await sdk.getStats({
        appId,
        deviceIds,
        limit,
        rangeStart,
        rangeEnd,
      })
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result.data, null, 2),
        }],
      }
    },
  )

  // ============================================================================
  // Build Management Tools
  // ============================================================================

  server.tool(
    'capgo_request_build',
    'Request a native iOS/Android build from Capgo Cloud',
    {
      appId: z.string().describe('App ID to build'),
      platform: z.enum(['ios', 'android']).describe('Target platform'),
      path: z.string().optional().describe('Path to project directory'),
    },
    async ({ appId, platform, path }) => {
      const result = await sdk.requestBuild({
        appId,
        platform,
        path,
        // Credentials should be pre-saved using the CLI
      })
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            message: 'Build requested successfully',
            ...result.data,
          }, null, 2),
        }],
      }
    },
  )

  // ============================================================================
  // Encryption Key Tools
  // ============================================================================

  server.tool(
    'capgo_generate_encryption_keys',
    'Generate RSA key pair for end-to-end encryption of bundles',
    {
      force: z.boolean().optional().describe('Overwrite existing keys if they exist'),
    },
    async ({ force }) => {
      const result = await sdk.generateEncryptionKeys({ force })
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{
          type: 'text' as const,
          text: 'Encryption keys generated successfully. Private key saved to .capgo_key_v2, public key to .capgo_key_v2.pub',
        }],
      }
    },
  )

  // ============================================================================
  // Probe Tool (no auth required - hits public /updates endpoint)
  // ============================================================================

  server.tool(
    'capgo_probe',
    'Probe the Capgo updates endpoint for a local project. Returns whether an OTA update would be delivered and diagnostic details if not. Does not require an API key.',
    {
      platform: z.enum(['ios', 'android']).describe('Target platform to probe'),
    },
    async ({ platform }) => {
      const result = await sdk.probe({ platform })
      if (!result.success) {
        return formatMcpError(result)
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result.data, null, 2),
        }],
      }
    },
  )

  // Start the server with stdio transport
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
