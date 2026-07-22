import { type } from './arktype'

// ============================================================================
// MCP Auth Tool Schemas (capgo_login / capgo_logout)
// ============================================================================

export const mcpLoginInputSchema = type({
  '+': 'delete',
  apikey: type('string > 0').describe('A Capgo API key (generate one at https://console.capgo.app/connect).'),
  'scope?': type("'global' | 'local'").describe('Where to save the key: "global" (~/.capgo, default, all projects) or "local" (./.capgo, this project only — requires a git repo).'),
})

export const mcpLogoutInputSchema = type({
  '+': 'delete',
  'scope?': type("'global' | 'local'").describe('Which saved key to remove: "global" (~/.capgo, default) or "local" (./.capgo).'),
})
