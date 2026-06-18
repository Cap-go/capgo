import type { SDKResult } from '../schemas/sdk'
import process from 'node:process'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import pack from '../../package.json'
import { enableSupabaseInstrumentation, setInvocationSource, trackMcpServerStarted, withMcpToolTracking } from '../analytics/track'
import { addAppOptionsSchema, cleanupOptionsSchema, getStatsOptionsSchema, requestBuildOptionsSchema, starAllRepositoriesOptionsSchema, starRepoOptionsSchema, updateAppOptionsSchema, updateChannelOptionsSchema, uploadOptionsSchema } from '../schemas/sdk'
import { CapgoSDK } from '../sdk'
import { clearSavedKey, getLoginState, loginSuccessMessage, logoutMessage, validateAndSaveKey, whoamiMessage } from '../auth/session'
import { mcpLoginInputSchema, mcpLogoutInputSchema } from '../schemas/auth'
import { findSavedKey, formatError } from '../utils'
import { registerOnboardingTools } from '../build/onboarding/mcp/onboarding-tools'
import { buildServerInstructions } from './instructions'
import { installMcpStdoutGuard } from './stdout-guard'

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
  // Computed once: gates BOTH the onboarding-tool registration (below) and the
  // onboarding steer appended to the server instructions, so we never advertise a
  // start_capgo_builder_onboarding tool we didn't actually register.
  const onboardingEnabled = Boolean(globalThis.__CAPGO_MCP_ONBOARDING__)
  const server = new McpServer(
    { name: 'capgo', version: pack.version },
    { instructions: buildServerInstructions(onboardingEnabled) },
  )

  setInvocationSource('mcp')
  enableSupabaseInstrumentation()

  // Auto-track every tool invocation without touching each registration.
  const originalTool = server.tool.bind(server)
  ;(server as unknown as { tool: (...args: any[]) => unknown }).tool = (...args: any[]) => {
    const handlerIndex = args.length - 1
    if (typeof args[handlerIndex] === 'function')
      args[handlerIndex] = withMcpToolTracking(String(args[0]), args[handlerIndex])
    return (originalTool as (...a: any[]) => unknown)(...args)
  }

  // Initialize SDK - will use saved API key or require it per-call
  let savedApiKey: string | undefined
  try {
    savedApiKey = findSavedKey(true)
  }
  catch {
    savedApiKey = undefined
  }
  // `let` (not `const`): capgo_login/capgo_logout reassign this so the running session
  // re-authenticates without a restart. Tool handlers close over the binding, not the value.
  let sdk = new CapgoSDK({ apikey: savedApiKey })

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
      channelId: z.string().describe('Channel name to create'),
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
      channelId: z.string().describe('Channel name to delete'),
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
      channelId: z.string().describe('Channel name'),
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
    requestBuildOptionsSchema.pick({ appId: true, platform: true, path: true, nodeModules: true }).shape,
    async ({ appId, platform, path, nodeModules }) => {
      const result = await sdk.requestBuild({
        appId,
        platform,
        path,
        nodeModules,
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

  // ============================================================================
  // Authentication Tools
  // ============================================================================

  server.tool(
    'capgo_login',
    'Sign in to Capgo by saving an API key. Generate a key for your AI at https://app.capgo.app/connect, then call this with it. Authenticates the current MCP session immediately — no restart needed.',
    mcpLoginInputSchema.shape,
    async ({ apikey, scope }) => {
      try {
        const { userId } = await validateAndSaveKey(apikey, { local: scope === 'local' })
        // Re-init from call-time resolution (env → global → local) — the SAME source of
        // truth whoami/logout/onboarding use — so the SDK never authenticates as a
        // different identity than the one we report.
        sdk = new CapgoSDK({})
        let text = loginSuccessMessage(userId, scope === 'local')
        // If a higher-precedence credential overrides the key we just saved, say so:
        // tools will run as THAT credential, not the one just pasted.
        const active = await getLoginState()
        const savedSource = scope === 'local' ? 'local' : 'global'
        if (active.source && active.source !== savedSource)
          text += ` Note: a ${active.source} credential takes precedence over the ${savedSource} key you just saved, so tools will use it until it is removed.`
        return {
          content: [{ type: 'text' as const, text }],
        }
      }
      catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Login failed: ${formatError(error)}. Generate a fresh key at https://app.capgo.app/connect and try again.`,
          }],
          isError: true as const,
        }
      }
    },
  )

  server.tool(
    'capgo_whoami',
    'Report whether the Capgo MCP is signed in, and if so which user and where the key is stored. Validates the saved key against Capgo.',
    {},
    async () => {
      const state = await getLoginState({ validate: true })
      return { content: [{ type: 'text' as const, text: whoamiMessage(state) }] }
    },
  )

  server.tool(
    'capgo_logout',
    'Sign out by deleting the saved Capgo API key. Clears the global key (~/.capgo) by default, or the project-local key (./.capgo) with scope "local". Does not unset the CAPGO_TOKEN env var.',
    mcpLogoutInputSchema.shape,
    async ({ scope }) => {
      const { cleared } = await clearSavedKey({ local: scope === 'local' })
      // Drop the in-memory key so the main tools de-authenticate immediately.
      sdk = new CapgoSDK({})
      // Be honest: if a credential is still reachable (CAPGO_TOKEN, or the other
      // on-disk scope), say so rather than falsely claiming a full sign-out.
      const remaining = await getLoginState()
      return {
        content: [{ type: 'text' as const, text: logoutMessage(cleared, scope === 'local', remaining) }],
      }
    },
  )

  // MCP-conducted Builder onboarding (2-tool spine + explain). Build-time gated:
  // OFF in PR 1 while the flow was under construction, flipped ON in PR 2 now that
  // the full journey (android + iOS + tail) ships through the shared engine.
  // `bun run dev` keeps the flag undefined-safe; release builds define it to true.
  if (onboardingEnabled)
    registerOnboardingTools(server, () => sdk) // live accessor: honors capgo_login/logout reassignment

  // Start the server with stdio transport. Route ambient stdout (stray clack/console
  // output from any tool or dependency) to stderr so it can't corrupt the JSON-RPC
  // frames a strict client reads — otherwise the transport drops ("Transport closed").
  const transportStdout = installMcpStdoutGuard()
  const transport = new StdioServerTransport(process.stdin, transportStdout)
  await server.connect(transport)
  trackMcpServerStarted(Boolean(savedApiKey))
}
