import { z } from 'zod'

// ============================================================================
// MCP Auth Tool Schemas (capgo_login / capgo_logout)
// ============================================================================

const saveScopeSchema = z.enum(['global', 'local']).optional()

export const mcpLoginInputSchema = z.object({
  apikey: z.string().describe('A Capgo API key (generate one at https://app.capgo.app/connect).'),
  scope: saveScopeSchema.describe('Where to save the key: "global" (~/.capgo, default, all projects) or "local" (./.capgo, this project only — requires a git repo).'),
})

export type McpLoginInput = z.infer<typeof mcpLoginInputSchema>

export const mcpLogoutInputSchema = z.object({
  scope: saveScopeSchema.describe('Which saved key to remove: "global" (~/.capgo, default) or "local" (./.capgo).'),
})

export type McpLogoutInput = z.infer<typeof mcpLogoutInputSchema>
