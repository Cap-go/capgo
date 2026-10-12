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
/** Set by the ChatGPT callback page so the chat reopens (with the plan-usage welcome) after the redirect. */
export const ASSISTANT_OPEN_AFTER_CONNECT_KEY = 'capgo-assistant-open-after-connect'

export class AssistantKeyError extends Error {}

/** Server error codes the chat turns into a ChatGPT state instead of a generic error bubble. */
export class AssistantChatGptError extends Error {
  constructor(readonly code: 'chatgpt_not_connected' | 'chatgpt_reconnect_required' | 'chatgpt_plan_usage_disabled' | 'chatgpt_usage_limit' | 'chatgpt_not_eligible') {
    super(code)
  }
}

const CHATGPT_ERROR_CODES = new Set(['chatgpt_not_connected', 'chatgpt_reconnect_required', 'chatgpt_plan_usage_disabled', 'chatgpt_usage_limit', 'chatgpt_not_eligible'])

/** Where users review their ChatGPT plan usage and per-app limits. */
export const CHATGPT_MANAGE_USAGE_URL = 'https://chatgpt.com/#settings'

export interface ChatGptStatus {
  configured: boolean
  connected: boolean
  email: string | null
  planUsage: boolean
}

export async function getChatGptStatus(): Promise<ChatGptStatus> {
  const { data, error } = await invokeCapgoApi<ChatGptStatus>('private/assistant/chatgpt', { method: 'GET' })
  if (error || !data)
    return { configured: false, connected: false, email: null, planUsage: false }
  return data
}

/** Returns the OpenAI authorize URL; the browser leaves the console and comes back on /assistant/chatgpt-callback. */
export async function startChatGptConnect(returnTo: string): Promise<string> {
  const { data, error } = await invokeCapgoApi<{ url: string }>('private/assistant/chatgpt/authorize', { method: 'POST', body: { returnTo } })
  if (error || !data?.url)
    throw new Error(await getCapgoApiErrorCode(error) ?? 'chatgpt_authorize_failed')
  return data.url
}

export async function completeChatGptConnect(code: string, state: string): Promise<{ returnTo: string, email: string | null, planUsage: boolean }> {
  const { data, error } = await invokeCapgoApi<{ returnTo: string, email: string | null, planUsage: boolean }>('private/assistant/chatgpt/callback', { method: 'POST', body: { code, state } })
  if (error || !data)
    throw new Error(await getCapgoApiErrorCode(error) ?? 'chatgpt_callback_failed')
  return data
}

export async function disconnectChatGpt(): Promise<void> {
  await invokeCapgoApi('private/assistant/chatgpt', { method: 'DELETE' })
}

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
    if (code && CHATGPT_ERROR_CODES.has(code))
      throw new AssistantChatGptError(code as AssistantChatGptError['code'])
    throw new Error(code ?? error?.message ?? 'assistant_failed')
  }
  return data
}
