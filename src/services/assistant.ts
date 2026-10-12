import type { SupabaseClient } from '@supabase/supabase-js'
import type { CliLoginOrganization } from '~/services/cliLogin'
import type { Database } from '~/types/supabase.types'
import { getCapgoApiErrorCode, invokeCapgoApi } from '~/services/capgoApi'
import { createCliLoginKeyDependencies, createMcpOAuthKey, resolveCliKeyEligibility } from '~/services/cliLogin'

export type AssistantCard
  = | { type: 'link', title: string, description?: string, path: string }
    | { type: 'question', question: string, options: string[], allowFreeText: boolean }
    | { type: 'confirm', title: string, description: string, tool: string, arguments: Record<string, unknown> }

export interface AssistantAction {
  tool: string
  title: string
  ok: boolean
}

export interface AssistantResponse {
  reply: string
  cards: AssistantCard[]
  actions: AssistantAction[]
}

export interface AssistantTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantContext {
  path?: string
  orgId?: string
  orgName?: string
  appId?: string
}

export const ASSISTANT_CLIENT_NAME = 'Capgo Assistant'

export class AssistantKeyError extends Error {}

export function assistantKeyStorageKey(userId: string): string {
  return `capgo-assistant-key:${userId}`
}

/** Plain-text transcript sent to the model: card answers are already user turns, so cards are dropped. */
export function toAssistantHistory(turns: AssistantTurn[], limit = 40): AssistantTurn[] {
  return turns.filter(turn => turn.content.trim() !== '').slice(-limit)
}

/**
 * The assistant calls the hosted MCP tools with a dedicated API key, bound to the organizations the
 * user administers, exactly like an MCP OAuth client. It shows up as "MCP · Capgo Assistant" in the
 * API key list, expires within 90 days and can be revoked there.
 */
export async function createAssistantKey(
  supabase: SupabaseClient<Database>,
  userId: string,
  organizations: CliLoginOrganization[],
): Promise<string> {
  const dependencies = createCliLoginKeyDependencies(supabase, userId)
  const { eligible } = await resolveCliKeyEligibility(organizations, dependencies)
  if (!eligible.length)
    throw new AssistantKeyError('no_eligible_organization')
  return createMcpOAuthKey(eligible, dependencies, ASSISTANT_CLIENT_NAME)
}

export async function askAssistant(
  apikey: string,
  messages: AssistantTurn[],
  context: AssistantContext,
  confirm?: { tool: string, arguments: Record<string, unknown> },
): Promise<AssistantResponse> {
  const { data, error } = await invokeCapgoApi<AssistantResponse>('private/assistant', {
    method: 'POST',
    headers: { capgkey: apikey },
    body: { messages: toAssistantHistory(messages), context, ...(confirm ? { confirm } : {}) },
    retries: 0,
  })
  if (error || !data) {
    const code = await getCapgoApiErrorCode(error)
    if (code === 'invalid_apikey' || code === 'no_key_provided')
      throw new AssistantKeyError(code)
    throw new Error(code ?? error?.message ?? 'assistant_failed')
  }
  return data
}
