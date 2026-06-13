/**
 * MCP server `instructions` — the connect-time guidance string handed to clients
 * (Codex, Claude Code, …) in the `initialize` result. Clients that support it inject
 * this text into the model's context, so it is the one cross-client, server-side lever
 * for steering WHEN to reach for these tools (tool descriptions only steer WHICH tool
 * once the model has already decided to use the server).
 *
 * The general Capgo Cloud capabilities are always described. The Builder-onboarding
 * steer is appended only when the onboarding tools are actually registered, so we never
 * advertise a `start_capgo_builder_onboarding` tool that isn't there.
 *
 * Keep the result under 512 characters: some clients (Codex) cap server instructions
 * at that length. `test/test-mcp-instructions.mjs` pins this.
 */
export function buildServerInstructions(onboardingEnabled: boolean): string {
  const base
    = 'Capgo Cloud MCP server: manage Capgo apps and their live updates — list apps, '
    + 'upload and clean up bundles, set or override channels, read update and usage stats, '
    + 'and request native cloud builds. Tools authenticate with the saved Capgo API key.'

  if (!onboardingEnabled)
    return base

  return `${base} To set up or troubleshoot Capgo Builder native cloud builds (iOS/Android `
    + 'signing, certificates, keystores, first build), call start_capgo_builder_onboarding '
    + 'FIRST and follow each result\'s `next` field instead of configuring Capgo yourself.'
}
