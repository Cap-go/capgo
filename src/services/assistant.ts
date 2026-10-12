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

export type ChatGptMode = 'dynamic' | 'partner'

export interface ChatGptStatus {
  configured: boolean
  /** dynamic: loopback redirect read in-app (native) or pasted (web); partner: https redirect to the console. */
  mode: ChatGptMode
  connected: boolean
  email: string | null
  planUsage: boolean
}

export interface AssistantStatus {
  chatgpt: ChatGptStatus
  /** Whether the server holds a usable "MCP · Capgo Assistant" key for this user. */
  hasKey: boolean
}

const EMPTY_STATUS: AssistantStatus = { chatgpt: { configured: false, mode: 'dynamic', connected: false, email: null, planUsage: false }, hasKey: false }

export async function getAssistantStatus(): Promise<AssistantStatus> {
  const { data, error } = await invokeCapgoApi<AssistantStatus>('private/assistant/status', { method: 'GET' })
  return error || !data ? EMPTY_STATUS : data
}

/** Hand the freshly minted key to the server, which keeps it encrypted. The browser never stores it. */
export async function saveAssistantKey(apikey: string): Promise<void> {
  const { error } = await invokeCapgoApi('private/assistant/key', { method: 'POST', body: { apikey } })
  if (error)
    throw new Error(await getCapgoApiErrorCode(error) ?? 'assistant_key_failed')
}

export interface ChatGptAuthorization {
  url: string
  mode: ChatGptMode
  redirectUri: string
}

export async function startChatGptConnect(returnTo: string): Promise<ChatGptAuthorization> {
  const { data, error } = await invokeCapgoApi<ChatGptAuthorization>('private/assistant/chatgpt/authorize', { method: 'POST', body: { returnTo } })
  if (error || !data?.url)
    throw new Error(await getCapgoApiErrorCode(error) ?? 'chatgpt_authorize_failed')
  return data
}

export async function completeChatGptConnect(callback: { code: string, state: string, clientId?: string }): Promise<{ returnTo: string, email: string | null, planUsage: boolean }> {
  const { data, error } = await invokeCapgoApi<{ returnTo: string, email: string | null, planUsage: boolean }>('private/assistant/chatgpt/callback', { method: 'POST', body: callback })
  if (error || !data)
    throw new Error(await getCapgoApiErrorCode(error) ?? 'chatgpt_callback_failed')
  return data
}

export async function disconnectChatGpt(): Promise<void> {
  await invokeCapgoApi('private/assistant/chatgpt', { method: 'DELETE' })
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
  messages: AssistantTurn[],
  context: AssistantContext,
  confirm?: { tool: string, arguments: Record<string, unknown> },
): Promise<AssistantResponse> {
  const { data, error } = await invokeCapgoApi<AssistantResponse>('private/assistant', {
    method: 'POST',
    body: { messages: toAssistantHistory(messages), context, ...(confirm ? { confirm } : {}) },
    retries: 0,
  })
  if (error || !data) {
    const code = await getCapgoApiErrorCode(error)
    if (code === 'assistant_key_missing')
      throw new AssistantKeyError(code)
    if (code && CHATGPT_ERROR_CODES.has(code))
      throw new AssistantChatGptError(code as AssistantChatGptError['code'])
    throw new Error(code ?? error?.message ?? 'assistant_failed')
  }
  return data
}
