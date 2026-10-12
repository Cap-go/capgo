import type { Context } from 'hono'
import type { McpApiRequest, McpToolContext } from '../supabase/functions/_backend/mcp/tools.ts'
import type { ModelAccess } from '../supabase/functions/_backend/private/assistant.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tokenizeAssistantText } from '../src/utils/assistantText.ts'
import { parseChatGptCallback } from '../src/utils/chatgptCallback.ts'
import { base64UrlEncode } from '../supabase/functions/_backend/mcp/oauth_utils.ts'
import { MCP_TOOLS_BY_NAME } from '../supabase/functions/_backend/mcp/tools.ts'
import { needsConfirmation, readResponseStream, resolveModel, responsesTools, runAssistant, sanitizeConsolePath } from '../supabase/functions/_backend/private/assistant.ts'
import {
  buildAuthorizeUrl,
  CHATGPT_DYNAMIC_CLIENT_ID,
  CHATGPT_LOOPBACK_REDIRECT_URI,
  CHATGPT_SCOPES,
  chatGptEndpoints,
  decryptSecret,
  encryptSecret,
  hasPlanUsage,
  pkceChallenge,
  resolveIssuedClientId,
  safeReturnTo,
  verifyIdToken,
} from '../supabase/functions/_backend/utils/chatgpt_oauth.ts'

function fakeToolContext(response: unknown = [{ app_id: 'com.example.app' }]) {
  const calls: McpApiRequest[] = []
  const ctx: McpToolContext = {
    call: async (request) => {
      calls.push(request)
      return { ok: true, status: 200, data: response }
    },
    caller: { userId: '00000000-0000-0000-0000-000000000001', apikeyId: 42, apikeyName: 'MCP · Capgo Assistant', apikeyExpiresAt: null },
  }
  return { ctx, calls }
}

const fakeHonoContext = {
  env: {},
  get: () => 'request-id',
} as unknown as Context

const chatgptAccess: ModelAccess = { token: 'chatgpt-access-token', source: 'chatgpt' }

interface ModelOutput { text?: string, calls?: Array<[string, Record<string, unknown>]> }

let callCounter = 0
function sse(events: unknown[]): string {
  return events.map(event => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
}

function completed(output: ModelOutput) {
  const items: unknown[] = []
  if (output.text)
    items.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: output.text }] })
  for (const [name, args] of output.calls ?? [])
    items.push({ type: 'function_call', call_id: `call_${++callCounter}`, name, namespace: name.startsWith('capgo_') ? 'capgo' : 'capgo_ui', arguments: JSON.stringify(args) })
  return sse([{ type: 'response.created' }, ...(output.text ? [{ type: 'response.output_text.delta', delta: output.text }] : []), { type: 'response.completed', response: { output: items } }])
}

/** Queue Responses API streams and record request bodies and auth headers. */
function mockResponses(outputs: Array<ModelOutput | string>) {
  const requests: Array<{ url: string, auth: string | null, body: { input: Array<Record<string, unknown>>, store: boolean, stream: boolean, tools?: unknown[], instructions: string } }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/models'))
      return Response.json({ models: [{ slug: 'gpt-hidden', visibility: 'hide' }, { slug: 'gpt-plan-default', visibility: 'list' }] })
    requests.push({ url, auth: new Headers(init.headers).get('authorization'), body: JSON.parse(String(init.body)) })
    const next = outputs.shift() ?? { text: 'done' }
    return new Response(typeof next === 'string' ? next : completed(next), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }))
  return requests
}

describe('assistant helpers', () => {
  it.concurrent('only accepts same-origin console paths', () => {
    expect(sanitizeConsolePath('/app/com.example.app/channels')).toBe('/app/com.example.app/channels')
    expect(sanitizeConsolePath('https://evil.example')).toBeNull()
    expect(sanitizeConsolePath('//evil.example')).toBeNull()
    expect(sanitizeConsolePath('/\\evil.example')).toBeNull()
    expect(sanitizeConsolePath('javascript:alert(1)')).toBeNull()
    expect(sanitizeConsolePath(42)).toBeNull()
  })

  it.concurrent('asks for confirmation on destructive and push tools only', () => {
    expect(needsConfirmation(MCP_TOOLS_BY_NAME.get('capgo_delete_channel')!)).toBe(true)
    expect(needsConfirmation(MCP_TOOLS_BY_NAME.get('capgo_send_notification')!)).toBe(true)
    expect(needsConfirmation(MCP_TOOLS_BY_NAME.get('capgo_list_apps')!)).toBe(false)
  })

  it.concurrent('groups tools in namespaces as ChatGPT plan usage requires', () => {
    const tools = responsesTools() as Array<{ type: string, name: string, tools: Array<{ type: string, name: string }> }>
    expect(tools.map(tool => [tool.type, tool.name])).toEqual([['namespace', 'capgo_ui'], ['namespace', 'capgo']])
    expect(tools[0].tools.map(tool => tool.name)).toEqual(['show_link', 'ask_user'])
    expect(tools[1].tools.every(tool => tool.type === 'function' && tool.name.startsWith('capgo_'))).toBe(true)
  })

  it.concurrent('renders bold, code and lists as plain text tokens', () => {
    expect(tokenizeAssistantText('Live on **production**: `1.2.3`\n\n- one\n- two')).toEqual([
      { type: 'paragraph', spans: [{ text: 'Live on ', style: 'plain' }, { text: 'production', style: 'bold' }, { text: ': ', style: 'plain' }, { text: '1.2.3', style: 'code' }] },
      { type: 'list', items: [[{ text: 'one', style: 'plain' }], [{ text: 'two', style: 'plain' }]] },
    ])
  })

  it.concurrent('falls back to streamed items when response.completed has an empty output', async () => {
    const item = { type: 'function_call', call_id: 'c1', name: 'show_link', namespace: 'capgo_ui', arguments: '{"title":"A","path":"/apps"}' }
    const turn = await readResponseStream(new Response(sse([{ type: 'response.output_item.done', item }, { type: 'response.completed', response: { output: [] } }])).body!)
    expect(turn.calls).toEqual([{ type: 'function_call', call_id: 'c1', name: 'show_link', namespace: 'capgo_ui', arguments: '{"title":"A","path":"/apps"}' }])
  })

  it.concurrent('reports a failed or interrupted stream', async () => {
    const failed = await readResponseStream(new Response(sse([{ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }])).body!)
    expect(failed.failedCode).toBe('subscription_sharing_usage_limit_exceeded')
    const interrupted = await readResponseStream(new Response(sse([{ type: 'response.output_text.delta', delta: 'hi' }])).body!)
    expect(interrupted.failedCode).toBe('stream_interrupted')
  })
})

describe('sign in with ChatGPT helpers', () => {
  it.concurrent('registers a dynamic agent client like the Capgo browser app', async () => {
    const url = new URL(buildAuthorizeUrl({
      endpoints: chatGptEndpoints(),
      clientId: CHATGPT_DYNAMIC_CLIENT_ID,
      redirectUri: CHATGPT_LOOPBACK_REDIRECT_URI,
      state: 's',
      nonce: 'n',
      codeChallenge: 'c',
      hostId: 'urn:uuid:00000000-0000-4000-8000-000000000000',
      agentNameHint: 'Capgo',
    }))
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'dynamic_agent_client',
      redirect_uri: 'http://127.0.0.1:1455/auth/callback',
      ext_agent_host_id: 'urn:uuid:00000000-0000-4000-8000-000000000000',
      agent_name_hint: 'Capgo',
    })
    expect(chatGptEndpoints().jwks).toBe('https://auth.openai.com/api/accounts/oauth/jwks')
  })

  it.concurrent('requires an issued client on registration and refuses a client switch', () => {
    expect(resolveIssuedClientId(CHATGPT_DYNAMIC_CLIENT_ID, 'oaiapp_new')).toBe('oaiapp_new')
    expect(resolveIssuedClientId(CHATGPT_DYNAMIC_CLIENT_ID, undefined)).toBeNull()
    expect(resolveIssuedClientId(CHATGPT_DYNAMIC_CLIENT_ID, CHATGPT_DYNAMIC_CLIENT_ID)).toBeNull()
    expect(resolveIssuedClientId('oaiapp_saved', undefined)).toBe('oaiapp_saved')
    expect(resolveIssuedClientId('oaiapp_saved', 'oaiapp_saved')).toBe('oaiapp_saved')
    expect(resolveIssuedClientId('oaiapp_saved', 'oaiapp_other')).toBeNull()
  })

  it.concurrent('parses only the loopback callback address', () => {
    expect(parseChatGptCallback('http://127.0.0.1:1455/auth/callback?code=abc&state=xyz&client_id=oaiapp_1&scope=openid', CHATGPT_LOOPBACK_REDIRECT_URI))
      .toEqual({ code: 'abc', state: 'xyz', clientId: 'oaiapp_1', error: undefined })
    expect(parseChatGptCallback(' http://127.0.0.1:1455/auth/callback?error=access_denied&state=xyz ', CHATGPT_LOOPBACK_REDIRECT_URI))
      .toMatchObject({ error: 'access_denied' })
    expect(parseChatGptCallback('https://evil.example/auth/callback?code=abc', CHATGPT_LOOPBACK_REDIRECT_URI)).toBeNull()
    expect(parseChatGptCallback('not a url', CHATGPT_LOOPBACK_REDIRECT_URI)).toBeNull()
  })

  it.concurrent('builds the authorize URL with PKCE, plan usage scope and resource', async () => {
    const url = new URL(buildAuthorizeUrl({
      endpoints: chatGptEndpoints(),
      clientId: 'oaiapp_test',
      redirectUri: 'https://console.capgo.app/assistant/chatgpt-callback',
      state: 'state-value',
      nonce: 'nonce-value',
      codeChallenge: await pkceChallenge('verifier'),
    }))
    expect(url.origin + url.pathname).toBe('https://auth.openai.com/api/accounts/authorize')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'oaiapp_test',
      response_type: 'code',
      scope: CHATGPT_SCOPES,
      resource: 'https://api.openai.com/v1',
      code_challenge_method: 'S256',
      state: 'state-value',
      nonce: 'nonce-value',
    })
    expect(CHATGPT_SCOPES).toContain('chatgpt.tokens.use.direct')
  })

  it.concurrent('encrypts tokens and refuses the wrong secret', async () => {
    const payload = await encryptSecret('refresh-token', 'secret-a')
    expect(payload).not.toContain('refresh-token')
    expect(await decryptSecret(payload, 'secret-a')).toBe('refresh-token')
    expect(await decryptSecret(payload, 'secret-b')).toBeNull()
  })

  it.concurrent('keeps return paths inside the console', () => {
    expect(safeReturnTo('/app/com.example.app')).toBe('/app/com.example.app')
    expect(safeReturnTo('https://evil.example')).toBe('/dashboard')
    expect(safeReturnTo('//evil.example')).toBe('/dashboard')
  })

  it.concurrent('detects the plan usage scope', () => {
    expect(hasPlanUsage('openid email chatgpt.tokens.use.direct')).toBe(true)
    expect(hasPlanUsage('openid email')).toBe(false)
  })

  it.concurrent('verifies ID token signature, issuer, audience and nonce', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
    const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'key-1' }
    const now = Math.floor(Date.now() / 1000)
    const sign = async (claims: Record<string, unknown>) => {
      const encode = (value: unknown) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)))
      const unsigned = `${encode({ alg: 'RS256', kid: 'key-1' })}.${encode(claims)}`
      const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(unsigned))
      return `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`
    }
    const base = { iss: 'https://auth.openai.com', aud: 'oaiapp_test', sub: 'user-sub', iat: now, exp: now + 300, nonce: 'n1', email: 'customer-onboarding@example.com' }
    const expected = { issuer: 'https://auth.openai.com', clientId: 'oaiapp_test', nonce: 'n1' }

    expect(await verifyIdToken(await sign(base), { keys: [jwk] }, expected)).toMatchObject({ sub: 'user-sub', email: 'customer-onboarding@example.com' })
    expect(await verifyIdToken(await sign({ ...base, nonce: 'other' }), { keys: [jwk] }, expected)).toBeNull()
    expect(await verifyIdToken(await sign({ ...base, aud: 'oaiapp_other' }), { keys: [jwk] }, expected)).toBeNull()
    expect(await verifyIdToken(await sign({ ...base, exp: now - 60 }), { keys: [jwk] }, expected)).toBeNull()
    const tampered = (await sign(base)).replace(/\.[^.]+\./, `.${base64UrlEncode(new TextEncoder().encode(JSON.stringify({ ...base, sub: 'attacker' })))}.`)
    expect(await verifyIdToken(tampered, { keys: [jwk] }, expected)).toBeNull()
  })
})

describe('assistant loop on the Responses API', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the ChatGPT token, stateless streaming, and returns link cards', async () => {
    const requests = mockResponses([
      { calls: [['capgo_list_apps', {}]] },
      { calls: [['show_link', { title: 'Channels', path: '/app/com.example.app/channels' }], ['show_link', { title: 'Bad', path: 'https://evil.example' }]] },
      { text: 'Your channels are here.' },
    ])
    const { ctx, calls } = fakeToolContext()
    const result = await runAssistant(fakeHonoContext, { messages: [{ role: 'user', content: 'Where are my channels?' }] }, ctx, chatgptAccess)

    expect(calls).toEqual([{ method: 'GET', path: '/app', query: {} }])
    expect(result.reply).toBe('Your channels are here.')
    expect(result.cards).toEqual([{ type: 'link', title: 'Channels', description: undefined, path: '/app/com.example.app/channels' }])
    expect(result.actions).toEqual([{ tool: 'capgo_list_apps', title: 'List apps', ok: true }])
    expect(requests[0].url).toBe('https://api.openai.com/v1/responses')
    expect(requests[0].body).toMatchObject({ model: 'gpt-plan-default' })
    expect(requests[0].auth).toBe('Bearer chatgpt-access-token')
    expect(requests.every(request => request.body.store === false && request.body.stream === true)).toBe(true)
    // History is resent each round: the function call and its output follow the user message.
    expect(requests[1].body.input.map(item => item.type ?? item.role)).toEqual(['user', 'function_call', 'function_call_output'])
    expect(requests[1].body.input[1]).toMatchObject({ name: 'capgo_list_apps', namespace: 'capgo' })
  })

  it('turns ask_user into a question card and stops', async () => {
    const requests = mockResponses([
      { calls: [['ask_user', { question: 'Which app?', options: ['com.a', 'com.b'] }]] },
      { text: 'Pick an app.' },
    ])
    const { ctx } = fakeToolContext()
    const result = await runAssistant(fakeHonoContext, { messages: [{ role: 'user', content: 'Show devices' }] }, ctx, chatgptAccess)

    expect(result.cards).toEqual([{ type: 'question', question: 'Which app?', options: ['com.a', 'com.b'], allowFreeText: false }])
    expect(result.reply).toBe('Pick an app.')
    expect(requests).toHaveLength(2)
    expect(requests[1].body).toMatchObject({ tool_choice: 'none' })
  })

  it('never runs a destructive tool without confirmation', async () => {
    mockResponses([
      { calls: [['capgo_delete_channel', { appId: 'com.example.app', channel: 'beta' }]] },
      { text: 'Confirm to delete beta.' },
    ])
    const { ctx, calls } = fakeToolContext()
    const result = await runAssistant(fakeHonoContext, { messages: [{ role: 'user', content: 'Delete beta' }] }, ctx, chatgptAccess)

    expect(calls).toEqual([])
    expect(result.cards).toMatchObject([{ type: 'confirm', tool: 'capgo_delete_channel', arguments: { appId: 'com.example.app', channel: 'beta' } }])
  })

  it('runs the confirmed action before asking the model to summarize', async () => {
    const requests = mockResponses([{ text: 'Channel beta deleted.' }])
    const { ctx, calls } = fakeToolContext({ status: 'ok' })
    const result = await runAssistant(fakeHonoContext, {
      messages: [{ role: 'user', content: 'Delete beta' }],
      confirm: { tool: 'capgo_delete_channel', arguments: { appId: 'com.example.app', channel: 'beta' } },
    }, ctx, chatgptAccess)

    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('DELETE')
    expect(result.actions).toEqual([{ tool: 'capgo_delete_channel', title: 'Delete channel', ok: true }])
    expect(String(requests[0].body.input.at(-1)?.content)).toContain('I confirmed the action capgo_delete_channel')
  })

  it('still reports a confirmed action when the summary call fails', async () => {
    mockResponses([sse([{ type: 'response.failed', response: { error: { code: 'server_error' } } }])])
    const { ctx, calls } = fakeToolContext({ status: 'ok' })
    const result = await runAssistant(fakeHonoContext, {
      messages: [{ role: 'user', content: 'Delete beta' }],
      confirm: { tool: 'capgo_delete_channel', arguments: { appId: 'com.example.app', channel: 'beta' } },
    }, ctx, chatgptAccess)

    expect(calls).toHaveLength(1)
    expect(result.actions).toEqual([{ tool: 'capgo_delete_channel', title: 'Delete channel', ok: true }])
    expect(result.reply).toContain('completed')
  })

  it('picks a model listed for the ChatGPT plan', async () => {
    mockResponses([])
    expect(await resolveModel(fakeHonoContext, { token: 'plan-token-for-model-test', source: 'chatgpt' })).toBe('gpt-plan-default')
  })

  it('refuses to confirm a tool that does not need confirmation', async () => {
    mockResponses([])
    const { ctx } = fakeToolContext()
    await expect(runAssistant(fakeHonoContext, {
      messages: [{ role: 'user', content: 'hi' }],
      confirm: { tool: 'capgo_list_apps', arguments: {} },
    }, ctx, chatgptAccess)).rejects.toThrow()
  })

  it('maps the ChatGPT plan usage limit to a dedicated error', async () => {
    mockResponses([sse([{ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }])])
    const { ctx } = fakeToolContext()
    await expect(runAssistant(fakeHonoContext, { messages: [{ role: 'user', content: 'hi' }] }, ctx, chatgptAccess))
      .rejects
      .toMatchObject({ status: 429 })
  })
})
