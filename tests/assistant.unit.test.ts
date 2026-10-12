import type { Context } from 'hono'
import type { McpApiRequest, McpToolContext } from '../supabase/functions/_backend/mcp/tools.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenizeAssistantText } from '../src/utils/assistantText.ts'
import { MCP_TOOLS_BY_NAME } from '../supabase/functions/_backend/mcp/tools.ts'
import { needsConfirmation, runAssistant, sanitizeConsolePath } from '../supabase/functions/_backend/private/assistant.ts'

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
  env: { OPENAI_API_KEY: 'sk-test' },
  get: () => 'request-id',
} as unknown as Context

function toolCall(id: string, name: string, args: Record<string, unknown>) {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } }
}

/** Queue OpenAI chat completion answers and record the request bodies. */
function mockOpenAi(messages: Array<{ content: string | null, tool_calls?: unknown[] }>) {
  const bodies: Array<{ messages: Array<{ role: string, content?: string }> }> = []
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)))
    const message = messages.shift() ?? { content: 'done' }
    return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return bodies
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

  it.concurrent('renders bold, code and lists as plain text tokens', () => {
    expect(tokenizeAssistantText('Live on **production**: `1.2.3`\n\n- one\n- two')).toEqual([
      { type: 'paragraph', spans: [{ text: 'Live on ', style: 'plain' }, { text: 'production', style: 'bold' }, { text: ': ', style: 'plain' }, { text: '1.2.3', style: 'code' }] },
      { type: 'list', items: [[{ text: 'one', style: 'plain' }], [{ text: 'two', style: 'plain' }]] },
    ])
  })
})

describe('assistant loop', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('runs read tools and returns link cards', async () => {
    mockOpenAi([
      { content: null, tool_calls: [toolCall('1', 'capgo_list_apps', {})] },
      { content: null, tool_calls: [toolCall('2', 'show_link', { title: 'Channels', path: '/app/com.example.app/channels' }), toolCall('3', 'show_link', { title: 'Bad', path: 'https://evil.example' })] },
      { content: 'Your channels are here.' },
    ])
    const { ctx, calls } = fakeToolContext()
    const result = await runAssistant(fakeHonoContext, { messages: [{ role: 'user', content: 'Where are my channels?' }] }, ctx)

    expect(calls).toEqual([{ method: 'GET', path: '/app', query: {} }])
    expect(result.reply).toBe('Your channels are here.')
    expect(result.cards).toEqual([{ type: 'link', title: 'Channels', description: undefined, path: '/app/com.example.app/channels' }])
    expect(result.actions).toEqual([{ tool: 'capgo_list_apps', title: 'List apps', ok: true }])
  })

  it('turns ask_user into a question card and stops', async () => {
    const bodies = mockOpenAi([
      { content: null, tool_calls: [toolCall('1', 'ask_user', { question: 'Which app?', options: ['com.a', 'com.b'] })] },
      { content: 'Pick an app.' },
    ])
    const { ctx } = fakeToolContext()
    const result = await runAssistant(fakeHonoContext, { messages: [{ role: 'user', content: 'Show devices' }] }, ctx)

    expect(result.cards).toEqual([{ type: 'question', question: 'Which app?', options: ['com.a', 'com.b'], allowFreeText: false }])
    expect(result.reply).toBe('Pick an app.')
    expect(bodies).toHaveLength(2)
  })

  it('never runs a destructive tool without confirmation', async () => {
    mockOpenAi([
      { content: null, tool_calls: [toolCall('1', 'capgo_delete_channel', { appId: 'com.example.app', channel: 'beta' })] },
      { content: 'Confirm to delete beta.' },
    ])
    const { ctx, calls } = fakeToolContext()
    const result = await runAssistant(fakeHonoContext, { messages: [{ role: 'user', content: 'Delete beta' }] }, ctx)

    expect(calls).toEqual([])
    expect(result.cards).toMatchObject([{ type: 'confirm', tool: 'capgo_delete_channel', arguments: { appId: 'com.example.app', channel: 'beta' } }])
  })

  it('runs the confirmed action before asking the model to summarize', async () => {
    const bodies = mockOpenAi([{ content: 'Channel beta deleted.' }])
    const { ctx, calls } = fakeToolContext({ status: 'ok' })
    const result = await runAssistant(fakeHonoContext, {
      messages: [{ role: 'user', content: 'Delete beta' }],
      confirm: { tool: 'capgo_delete_channel', arguments: { appId: 'com.example.app', channel: 'beta' } },
    }, ctx)

    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('DELETE')
    expect(result.actions).toEqual([{ tool: 'capgo_delete_channel', title: 'Delete channel', ok: true }])
    expect(bodies[0].messages.at(-1)?.content).toContain('I confirmed the action capgo_delete_channel')
  })

  it('refuses to confirm a tool that does not need confirmation', async () => {
    mockOpenAi([])
    const { ctx } = fakeToolContext()
    await expect(runAssistant(fakeHonoContext, {
      messages: [{ role: 'user', content: 'hi' }],
      confirm: { tool: 'capgo_list_apps', arguments: {} },
    }, ctx)).rejects.toThrow()
  })
})
