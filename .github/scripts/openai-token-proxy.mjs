#!/usr/bin/env node
import { Buffer } from 'node:buffer'
import http from 'node:http'
import process from 'node:process'

const port = Number(process.env.PROXY_PORT ?? 8787)
const upstream = new URL('https://api.openai.com')
const maxRequestBytes = Number(process.env.MAX_OPENAI_PROXY_REQUEST_BYTES ?? 10 * 1024 * 1024)
const upstreamTimeoutMs = Number(process.env.OPENAI_PROXY_UPSTREAM_TIMEOUT_MS ?? 30000)
const maxRequests = Number(process.env.OPENAI_PROXY_MAX_REQUESTS ?? 200)
const maxTotalRequestBytes = Number(process.env.OPENAI_PROXY_MAX_TOTAL_REQUEST_BYTES ?? 40 * 1024 * 1024)
const maxTotalResponseBytes = Number(process.env.OPENAI_PROXY_MAX_TOTAL_RESPONSE_BYTES ?? 80 * 1024 * 1024)
const maxOutputTokens = Number(process.env.OPENAI_PROXY_MAX_OUTPUT_TOKENS ?? 4096)
const allowedModels = new Set((process.env.OPENAI_PROXY_ALLOWED_MODELS ?? 'gpt-5.5').split(',').map(model => model.trim()).filter(Boolean))
const allowedPaths = new Set([
  '/v1/chat/completions',
  '/v1/responses',
])
const forwardedHeaders = new Set([
  'accept',
  'content-type',
  'user-agent',
])
const allowedResponseFields = new Set([
  'client_metadata',
  'include',
  'input',
  'instructions',
  'max_output_tokens',
  'model',
  'parallel_tool_calls',
  'prompt_cache_key',
  'reasoning',
  'store',
  'stream',
  'text',
  'tool_choice',
  'tools',
])
const allowedChatFields = new Set([
  'frequency_penalty',
  'max_completion_tokens',
  'max_tokens',
  'messages',
  'model',
  'presence_penalty',
  'reasoning_effort',
  'stop',
  'stream',
  'temperature',
  'top_p',
  'user',
])
const allowedResponseToolNames = new Set([
  'apply_patch',
  'close_agent',
  'exec_command',
  'request_user_input',
  'resume_agent',
  'send_input',
  'spawn_agent',
  'update_plan',
  'view_image',
  'wait_agent',
  'write_stdin',
])
const allowedResponseInclude = new Set([
  'reasoning.encrypted_content',
])
const allowedReasoningEfforts = new Set([
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
])
const allowedTextVerbosities = new Set([
  'low',
  'medium',
  'high',
])

let requestCount = 0
let totalRequestBytes = 0
let totalResponseBytes = 0

const chunks = []
for await (const chunk of process.stdin) {
  chunks.push(Buffer.from(chunk))
}

const [openaiToken, clientToken] = Buffer.concat(chunks).toString('utf8').split('\n').map(part => part.trim())
if (!openaiToken || !clientToken) {
  console.error('OpenAI proxy did not receive both required tokens')
  process.exit(1)
}

function writePlain(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.end(body)
}

function readJsonBody(body) {
  try {
    const parsed = body.length > 0 ? JSON.parse(body.toString('utf8')) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return undefined
    return parsed
  }
  catch {
    return undefined
  }
}

function capTokenField(body, field) {
  if (body[field] === undefined) {
    body[field] = maxOutputTokens
    return
  }
  if (!Number.isInteger(body[field]) || body[field] < 1 || body[field] > maxOutputTokens)
    body[field] = maxOutputTokens
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hasOnlyAllowedFields(body, allowedFields) {
  return Object.keys(body).every(field => allowedFields.has(field))
}

function hasOnlyKeys(body, allowedKeys) {
  return Object.keys(body).every(field => allowedKeys.includes(field))
}

function isValidResponseTools(tools) {
  if (tools === undefined)
    return true

  if (!Array.isArray(tools))
    return false

  return tools.every((tool) => {
    if (!isPlainObject(tool) || typeof tool.name !== 'string' || !allowedResponseToolNames.has(tool.name))
      return false

    if (tool.type === 'function') {
      return hasOnlyKeys(tool, ['type', 'name', 'description', 'strict', 'parameters'])
        && typeof tool.description === 'string'
        && typeof tool.strict === 'boolean'
        && isPlainObject(tool.parameters)
    }

    if (tool.type === 'custom') {
      return tool.name === 'apply_patch'
        && hasOnlyKeys(tool, ['type', 'name', 'description', 'format'])
        && typeof tool.description === 'string'
        && isPlainObject(tool.format)
    }

    return false
  })
}

function isValidResponseInclude(include) {
  return include === undefined || (Array.isArray(include) && include.every(item => allowedResponseInclude.has(item)))
}

function isValidResponseReasoning(reasoning) {
  return reasoning === undefined
    || (
      isPlainObject(reasoning)
      && hasOnlyKeys(reasoning, ['effort'])
      && allowedReasoningEfforts.has(reasoning.effort)
    )
}

function isValidResponseText(text) {
  return text === undefined
    || (
      isPlainObject(text)
      && hasOnlyKeys(text, ['verbosity'])
      && allowedTextVerbosities.has(text.verbosity)
    )
}

function normalizeResponsesBody(body) {
  if (!hasOnlyAllowedFields(body, allowedResponseFields))
    return undefined

  if (!isValidResponseTools(body.tools) || !isValidResponseInclude(body.include) || !isValidResponseReasoning(body.reasoning) || !isValidResponseText(body.text))
    return undefined

  if (body.tool_choice !== undefined && body.tool_choice !== 'auto')
    return undefined

  if (body.store !== undefined && body.store !== false)
    return undefined

  if (body.stream !== undefined && body.stream !== true)
    return undefined

  body.tool_choice = 'auto'
  body.parallel_tool_calls = false
  body.store = false
  body.stream = true
  capTokenField(body, 'max_output_tokens')

  return body
}

function normalizeChatBody(body) {
  if (!hasOnlyAllowedFields(body, allowedChatFields))
    return undefined

  if (!Array.isArray(body.messages))
    return undefined

  if (body.max_tokens !== undefined)
    capTokenField(body, 'max_tokens')
  capTokenField(body, 'max_completion_tokens')

  return body
}

function buildPolicyBody(pathname, body) {
  const json = readJsonBody(body)
  if (!json)
    return undefined

  if (typeof json.model !== 'string' || !allowedModels.has(json.model))
    return undefined

  const policyBody = pathname === '/v1/responses'
    ? normalizeResponsesBody(json)
    : normalizeChatBody(json)

  if (!policyBody)
    return undefined

  return Buffer.from(JSON.stringify(policyBody))
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    writePlain(res, 200, 'ok')
    return
  }

  try {
    if (req.method !== 'POST') {
      writePlain(res, 405, 'method not allowed')
      return
    }

    if (req.headers.authorization !== `Bearer ${clientToken}`) {
      writePlain(res, 401, 'unauthorized')
      return
    }

    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (requestUrl.pathname.includes('/../') || requestUrl.pathname.includes('/./') || requestUrl.search || !allowedPaths.has(requestUrl.pathname)) {
      writePlain(res, 404, 'not found')
      return
    }

    requestCount += 1
    if (requestCount > maxRequests) {
      writePlain(res, 429, 'request budget exceeded')
      return
    }

    const bodyChunks = []
    let bodyBytes = 0
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk)
      bodyBytes += buffer.length
      if (bodyBytes > maxRequestBytes) {
        writePlain(res, 413, 'request too large')
        req.destroy()
        return
      }
      bodyChunks.push(buffer)
    }
    const body = Buffer.concat(bodyChunks)
    const policyBody = buildPolicyBody(requestUrl.pathname, body)
    if (!policyBody) {
      writePlain(res, 400, 'request rejected by OpenAI proxy policy')
      return
    }

    totalRequestBytes += policyBody.length
    if (totalRequestBytes > maxTotalRequestBytes) {
      writePlain(res, 429, 'request byte budget exceeded')
      return
    }

    const headers = {}

    for (const [key, value] of Object.entries(req.headers)) {
      const lowerKey = key.toLowerCase()
      if (!forwardedHeaders.has(lowerKey))
        continue
      headers[key] = value
    }

    headers.authorization = `Bearer ${openaiToken}`
    headers['content-type'] = 'application/json'

    const upstreamUrl = new URL(requestUrl.pathname, upstream)
    upstreamUrl.search = requestUrl.search

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), upstreamTimeoutMs)
    const abortOnClose = () => {
      if (!res.writableEnded)
        controller.abort()
    }
    let reader
    res.on('close', abortOnClose)

    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method: req.method,
        headers,
        body: policyBody,
        redirect: 'manual',
        signal: controller.signal,
      })

      for (const [key, value] of upstreamResponse.headers.entries()) {
        const lowerKey = key.toLowerCase()
        if (lowerKey === 'content-encoding' || lowerKey === 'transfer-encoding' || lowerKey === 'connection')
          continue
        res.setHeader(key, value)
      }

      res.statusCode = upstreamResponse.status
      if (!upstreamResponse.body) {
        res.end()
        return
      }

      reader = upstreamResponse.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done)
          break
        totalResponseBytes += value.byteLength
        if (totalResponseBytes > maxTotalResponseBytes) {
          controller.abort()
          throw new Error('OpenAI proxy response byte budget exceeded')
        }
        res.write(value)
      }
      res.end()
    }
    finally {
      clearTimeout(timeout)
      res.off('close', abortOnClose)
      if (controller.signal.aborted && reader)
        await reader.cancel().catch(() => {})
    }
  }
  catch (error) {
    console.error('OpenAI proxy request failed:', error instanceof Error ? error.message : String(error))
    if (res.writableEnded)
      return
    if (res.headersSent) {
      res.end()
      return
    }
    writePlain(res, 502, 'OpenAI proxy request failed')
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`OpenAI proxy listening on 127.0.0.1:${port}`)
})
