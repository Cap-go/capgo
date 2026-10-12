import type { Context } from 'hono'
import type { McpDispatch } from '../mcp/index.ts'
import type { McpTool, McpToolContext } from '../mcp/tools.ts'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { z } from 'zod'
import { createCaller } from '../mcp/index.ts'
import { listTools, SERVER_INSTRUCTIONS } from '../mcp/protocol.ts'
import { MCP_TOOLS_BY_NAME } from '../mcp/tools.ts'
import { honoFactory, parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { middlewareKey } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { safeParseSchema } from '../utils/schema_validation.ts'
import { getEnv } from '../utils/utils.ts'
import { ChatGptError, getChatGptAccessToken, isChatGptConfigured, registerChatGptRoutes } from './assistant_chatgpt.ts'

/**
 * In-console Capgo assistant.
 *
 * The web console sends the conversation plus the page the user is on. The model runs on the
 * OpenAI Responses API, paid by the user's own ChatGPT plan once they "Continue with ChatGPT"
 * (see assistant_chatgpt.ts), or by a server OPENAI_API_KEY when one is configured as fallback.
 * It can call every hosted MCP tool, replayed through the public API with the user's assistant
 * API key, so RBAC, org policies and rate limits are exactly the MCP ones. Two UI tools let the
 * model answer with cards: a link card to jump to a console page and a question card the user
 * answers with one click. Destructive or outward-facing MCP tools are never run directly: they
 * come back as a confirm card and only run once the user clicks it.
 */

type ApikeyRow = Database['public']['Tables']['apikeys']['Row']

const DEFAULT_MODEL = 'gpt-5-mini'
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
const MAX_ROUNDS = 8
const MAX_TOOL_RESULT_CHARS = 20_000
const MAX_HISTORY = 40
const MAX_MESSAGE_CHARS = 8_000

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

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(MAX_MESSAGE_CHARS),
})

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(MAX_HISTORY),
  context: z.object({
    path: z.string().max(500).optional(),
    orgId: z.string().max(100).optional(),
    orgName: z.string().max(200).optional(),
    appId: z.string().max(300).optional(),
  }).optional(),
  confirm: z.object({
    tool: z.string().min(1).max(100),
    arguments: z.record(z.string(), z.unknown()),
  }).optional(),
})

type AssistantBody = z.infer<typeof bodySchema>

// Console routes the model may link to. Ids in braces must come from MCP tool results.
const CONSOLE_ROUTES = `
/dashboard - organization overview (usage, apps, charts)
/apps - list of apps in the current organization
/app/new - add a new app
/app/{appId} - app overview dashboard
/app/{appId}/getting-started - app onboarding steps
/app/{appId}/bundles - bundle list; /app/{appId}/bundles/new - upload a bundle
/app/{appId}/bundle/{bundleId} - one bundle (bundleId is the numeric id, not the version name); suffixes /history, /manifest, /dependencies, /preview
/app/{appId}/channels - channel list
/app/{appId}/channel/{channelId} - one channel (numeric id); suffixes /devices, /history, /statistics, /preview
/app/{appId}/devices - device list; /app/{appId}/device/{deviceId} - one device; suffixes /logs, /deployments
/app/{appId}/builds - native builds
/app/{appId}/notifications - push notifications
/app/{appId}/observe/errors, /observe/logs, /observe/native, /observe/compatibility - Observe health data
/app/{appId}/settings - app settings; /settings/access - app access; /settings/usage - app usage
/settings/account - profile; /settings/account/change-password; /settings/account/notifications
/settings/organization - organization settings; suffixes /members, /groups, /security, /api-keys, /webhooks, /audit-logs, /usage, /plans, /credits, /notifications
`.trim()

const UI_FUNCTIONS = [
  {
    type: 'function',
    name: 'show_link',
    description: 'Show the user a clickable card that opens a page of the Capgo console. Use it whenever you mention where something lives, after finding a resource, or after an action so the user can check the result.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short card title, e.g. "Production channel"' },
        description: { type: 'string', description: 'One short line about what the page shows' },
        path: { type: 'string', description: 'Console path starting with /, built from the route list and real ids' },
      },
      required: ['title', 'path'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'ask_user',
    description: 'Ask the user a question with clickable answers. Use it instead of a plain-text question whenever a choice is needed (which app, which channel, which bundle, yes/no). Fill options from real data you fetched. Stop and wait for the answer after calling it.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8, description: 'Answers shown as buttons' },
        allow_free_text: { type: 'boolean', description: 'Also let the user type another answer' },
      },
      required: ['question', 'options'],
      additionalProperties: false,
    },
  },
]

/** Responses API input / output items the loop handles. Other output items (reasoning) are dropped. */
interface FunctionCallItem {
  type: 'function_call'
  call_id: string
  name: string
  arguments: string
  namespace?: string
}

type InputItem
  = | { role: 'user' | 'assistant' | 'developer', content: string }
    | FunctionCallItem
    | { type: 'function_call_output', call_id: string, output: string }

interface OutputItem {
  type: string
  role?: string
  content?: Array<{ type: string, text?: string }>
  call_id?: string
  name?: string
  arguments?: string
  namespace?: string
}

interface ModelTurn {
  text: string
  calls: FunctionCallItem[]
}

export interface ModelAccess {
  token: string
  source: 'chatgpt' | 'server'
}

let toolsCache: unknown[] | null = null

/**
 * ChatGPT plan usage only accepts function tools grouped in namespaces, so tools are always sent
 * that way: one namespace for the console UI cards and one for the Capgo MCP tools.
 */
export function responsesTools(): unknown[] {
  if (!toolsCache) {
    const mcpFunctions = (listTools() as Array<{ name: string, description: string, inputSchema: Record<string, unknown> }>).map(tool => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      strict: false,
      parameters: tool.inputSchema,
    }))
    toolsCache = [
      { type: 'namespace', name: 'console', description: 'Show cards in the Capgo console chat.', tools: UI_FUNCTIONS },
      { type: 'namespace', name: 'capgo', description: 'Capgo Cloud MCP tools acting on the user account.', tools: mcpFunctions },
    ]
  }
  return toolsCache
}

/** Deletes, overwrites, cancellations and push sends wait for an explicit click in the UI. */
export function needsConfirmation(tool: McpTool): boolean {
  return tool.annotations.destructiveHint === true || tool.annotations.openWorldHint === true
}

/** Only same-origin console paths: no scheme, no protocol-relative or backslash tricks. */
export function sanitizeConsolePath(path: unknown): string | null {
  if (typeof path !== 'string')
    return null
  const trimmed = path.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\') || /\s/.test(trimmed) || trimmed.length > 500)
    return null
  return trimmed
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n… (truncated)` : text
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  }
  catch {
    return {}
  }
}

function systemPrompt(body: AssistantBody): string {
  const ctx = body.context ?? {}
  const where = [
    ctx.path ? `Current page: ${ctx.path}` : null,
    ctx.orgId ? `Current organization: ${ctx.orgName ?? ''} (${ctx.orgId})` : null,
    ctx.appId ? `Current app: ${ctx.appId}` : null,
  ].filter(Boolean).join('\n')
  return [
    'You are the Capgo assistant inside the Capgo web console. You help users find things and act on their Capgo account.',
    SERVER_INSTRUCTIONS,
    'Rules:',
    '- Use the capgo_* tools to look up real data before answering. Never invent ids, versions or numbers.',
    '- "This app", "here" and similar refer to the current page context below.',
    '- When the user asks where something is, or after you find or change a resource, call show_link with the matching console page.',
    '- When you need the user to pick something, call ask_user with options from real data instead of asking in plain text.',
    '- Delete, overwrite, cancel and push-notification tools are not run immediately: the user gets a confirm card. Tell them to confirm it.',
    '- Uploading bundle files and starting native builds need the Capgo CLI: give the command (bunx @capgo/cli@latest ...).',
    '- Reply in the user\'s language, short and plain (a few sentences, simple markdown lists at most).',
    '',
    `Console routes:\n${CONSOLE_ROUTES}`,
    where ? `\n${where}` : '',
  ].join('\n')
}

/** Map a Responses API error code to a console error the UI knows how to show. */
function upstreamError(code: string | undefined, status: number): never {
  if (code === 'subscription_sharing_usage_limit_exceeded')
    throw quickError(429, 'chatgpt_usage_limit', 'Usage limit reached. Review your plan or this app\'s limit in ChatGPT settings.')
  if (code === 'subscription_sharing_user_not_eligible')
    throw quickError(403, 'chatgpt_not_eligible', 'ChatGPT plan usage is not available for this ChatGPT account.')
  if (code === 'subscription_sharing_invalid_user' || status === 401)
    throw quickError(401, 'chatgpt_reconnect_required', 'Your ChatGPT session expired. Connect ChatGPT again.')
  throw quickError(502, 'assistant_upstream_error', 'The assistant is unavailable right now, try again in a moment')
}

/** Read a Responses API event stream until response.completed and collect text and function calls. */
export async function readResponseStream(body: ReadableStream<Uint8Array>): Promise<ModelTurn & { failedCode?: string }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let output: OutputItem[] | null = null
  let failedCode: string | undefined
  for (;;) {
    const { value, done } = await reader.read()
    if (value)
      buffer += decoder.decode(value, { stream: true })
    let index = buffer.indexOf('\n\n')
    while (index !== -1) {
      const block = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      index = buffer.indexOf('\n\n')
      const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n')
      if (!data || data === '[DONE]')
        continue
      let event: { type?: string, response?: { output?: OutputItem[], error?: { code?: string } }, error?: { code?: string }, code?: string }
      try {
        event = JSON.parse(data)
      }
      catch {
        continue
      }
      if (event.type === 'response.completed')
        output = event.response?.output ?? []
      else if (event.type === 'response.failed' || event.type === 'response.incomplete')
        failedCode = event.response?.error?.code ?? event.type
      else if (event.type === 'error')
        failedCode = event.error?.code ?? event.code ?? 'error'
    }
    if (done)
      break
  }
  if (!output)
    return { text: '', calls: [], failedCode: failedCode ?? 'stream_interrupted' }
  const text = output.filter(item => item.type === 'message').flatMap(item => item.content ?? []).filter(part => part.type === 'output_text').map(part => part.text ?? '').join('')
  const calls = output.filter(item => item.type === 'function_call' && item.call_id && item.name).map(item => ({
    type: 'function_call' as const,
    call_id: item.call_id!,
    name: item.name!,
    arguments: item.arguments ?? '{}',
    ...(item.namespace ? { namespace: item.namespace } : {}),
  }))
  return { text, calls }
}

async function callModel(c: Context, access: ModelAccess, instructions: string, input: InputItem[], allowTools = true): Promise<ModelTurn> {
  const model = getEnv(c, 'ASSISTANT_OPENAI_MODEL') || DEFAULT_MODEL
  // Any OpenAI-compatible Responses endpoint works (gateway, local stub). ChatGPT plan usage needs api.openai.com.
  const baseUrl = (getEnv(c, 'ASSISTANT_OPENAI_BASE_URL') || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${access.token}`, 'content-type': 'application/json', 'accept': 'text/event-stream' },
    // ChatGPT plan usage requires store: false and stream: true on every request.
    body: JSON.stringify({ model, instructions, input, store: false, stream: true, ...(allowTools ? { tools: responsesTools() } : {}) }),
  })
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '')
    cloudlog({ requestId: c.get('requestId'), message: 'assistant_openai_error', status: response.status, source: access.source, detail: detail.slice(0, 500), openaiRequestId: response.headers.get('x-request-id') })
    let code: string | undefined
    try {
      code = (JSON.parse(detail) as { error?: { code?: string } }).error?.code
    }
    catch {}
    upstreamError(code, response.status)
  }
  const turn = await readResponseStream(response.body)
  if (turn.failedCode) {
    cloudlog({ requestId: c.get('requestId'), message: 'assistant_openai_stream_failed', code: turn.failedCode, source: access.source })
    upstreamError(turn.failedCode, 200)
  }
  return turn
}

async function runMcpTool(tool: McpTool, args: Record<string, unknown>, ctx: McpToolContext): Promise<{ ok: boolean, text: string }> {
  const parsed = tool.inputSchema.safeParse(args)
  if (!parsed.success)
    return { ok: false, text: `Invalid arguments for ${tool.name}: ${z.prettifyError(parsed.error)}` }
  try {
    const result = await tool.run(parsed.data as Record<string, unknown>, ctx)
    return { ok: !result.isError, text: result.content.map(part => part.text).join('\n') }
  }
  catch (error) {
    return { ok: false, text: `Tool failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function runAssistant(c: Context, body: AssistantBody, ctx: McpToolContext, access: ModelAccess): Promise<AssistantResponse> {
  const cards: AssistantCard[] = []
  const actions: AssistantAction[] = []
  const instructions = systemPrompt(body)
  const input: InputItem[] = body.messages.map(message => ({ role: message.role, content: message.content }))

  if (body.confirm) {
    const tool = MCP_TOOLS_BY_NAME.get(body.confirm.tool)
    if (!tool || !needsConfirmation(tool))
      throw simpleError('invalid_confirm', 'Unknown action to confirm')
    const result = await runMcpTool(tool, body.confirm.arguments, ctx)
    actions.push({ tool: tool.name, title: tool.title, ok: result.ok })
    input.push({
      role: 'user',
      content: `I confirmed the action ${tool.name} with ${JSON.stringify(body.confirm.arguments)}. Result (${result.ok ? 'success' : 'error'}):\n${clip(result.text, MAX_TOOL_RESULT_CHARS)}\nSummarize the outcome and link the affected page.`,
    })
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const turn = await callModel(c, access, instructions, input)
    if (!turn.calls.length)
      return { reply: turn.text, cards, actions }

    // store: false, so the whole history (including our function calls) is resent each round.
    if (turn.text)
      input.push({ role: 'assistant', content: turn.text })
    let waitForUser = false
    for (const call of turn.calls) {
      input.push(call)
      const args = parseArguments(call.arguments)
      let output: string

      if (call.name === 'show_link') {
        const path = sanitizeConsolePath(args.path)
        if (path) {
          cards.push({ type: 'link', title: String(args.title ?? path).slice(0, 120), description: typeof args.description === 'string' ? args.description.slice(0, 300) : undefined, path })
          output = 'Card shown to the user.'
        }
        else {
          output = 'Invalid path: use a console path starting with a single /.'
        }
      }
      else if (call.name === 'ask_user') {
        const options = Array.isArray(args.options) ? args.options.filter((option): option is string => typeof option === 'string' && option.trim() !== '').slice(0, 8).map(option => option.slice(0, 120)) : []
        cards.push({ type: 'question', question: String(args.question ?? '').slice(0, 500), options, allowFreeText: args.allow_free_text === true })
        waitForUser = true
        output = 'Question shown. Stop here and wait for the user to answer.'
      }
      else {
        const tool = MCP_TOOLS_BY_NAME.get(call.name)
        if (!tool) {
          output = `Unknown tool: ${call.name}`
        }
        else if (needsConfirmation(tool)) {
          const parsed = tool.inputSchema.safeParse(args)
          if (parsed.success) {
            cards.push({ type: 'confirm', title: tool.title, description: tool.description.split('. ')[0], tool: tool.name, arguments: parsed.data as Record<string, unknown> })
            waitForUser = true
            output = 'Not run yet: the user must click the confirm card. Tell them briefly what will happen.'
          }
          else {
            output = `Invalid arguments for ${call.name}: ${z.prettifyError(parsed.error)}`
          }
        }
        else {
          const result = await runMcpTool(tool, args, ctx)
          actions.push({ tool: tool.name, title: tool.title, ok: result.ok })
          output = clip(result.text, MAX_TOOL_RESULT_CHARS)
        }
      }
      input.push({ type: 'function_call_output', call_id: call.call_id, output })
    }

    if (waitForUser) {
      // Let the model add one short sentence, without more tool calls, then hand back to the user.
      input.push({ role: 'developer', content: 'Write one short sentence for the user now. Do not call tools.' })
      const final = await callModel(c, access, instructions, input, false).catch(() => ({ text: '' }))
      return { reply: final.text, cards, actions }
    }
  }
  return { reply: 'I stopped after too many steps. Try a narrower question.', cards, actions }
}

/** The user's ChatGPT plan first; a server key only when one is configured as fallback. */
async function resolveModelAccess(c: Context, userId: string): Promise<ModelAccess> {
  try {
    const token = await getChatGptAccessToken(c, userId)
    if (token)
      return { token, source: 'chatgpt' }
  }
  catch (error) {
    if (error instanceof ChatGptError)
      throw quickError(error.code === 'chatgpt_unavailable' ? 503 : 401, error.code, error.message)
    throw error
  }
  const serverKey = getEnv(c, 'OPENAI_API_KEY')
  if (serverKey)
    return { token: serverKey, source: 'server' }
  throw quickError(isChatGptConfigured(c) ? 409 : 503, isChatGptConfigured(c) ? 'chatgpt_not_connected' : 'assistant_not_configured', isChatGptConfigured(c) ? 'Continue with ChatGPT to use the assistant' : 'The assistant is not configured on this server')
}

/**
 * Supabase Edge Functions have no in-process router for the public API, so tool calls go through
 * the functions gateway. The Cloudflare API worker passes its own app.fetch instead.
 */
function supabaseDispatch(c: Context): McpDispatch {
  return (request) => {
    const url = new URL(request.url)
    const base = getEnv(c, 'SUPABASE_URL').replace(/\/$/, '')
    return fetch(new Request(`${base}/functions/v1${url.pathname}${url.search}`, request))
  }
}

export function createAssistantApp(dispatch?: McpDispatch) {
  const app = honoFactory.createApp()
  app.use('*', useCors)
  registerChatGptRoutes(app)

  app.post('/', middlewareKey(), async (c) => {
    const parsed = safeParseSchema(bodySchema, await parseBody<unknown>(c))
    if (!parsed.success)
      throw simpleError('invalid_body', 'Invalid assistant request')

    const apikey = c.get('apikey') as ApikeyRow
    const access = await resolveModelAccess(c, apikey.user_id)
    const token = (c.req.header('capgkey') ?? c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    const ctx: McpToolContext = {
      call: createCaller(c as Context<MiddlewareKeyVariables>, dispatch ?? supabaseDispatch(c), token),
      caller: { userId: apikey.user_id, apikeyId: Number(apikey.id), apikeyName: apikey.name, apikeyExpiresAt: apikey.expires_at },
    }
    cloudlog({ requestId: c.get('requestId'), message: 'assistant_request', apikeyId: apikey.id, source: access.source, turns: parsed.data.messages.length, confirm: parsed.data.confirm?.tool })
    return c.json(await runAssistant(c, parsed.data, ctx, access))
  })

  return app
}

export const app = createAssistantApp()
