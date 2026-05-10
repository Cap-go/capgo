#!/usr/bin/env node
import { Buffer } from 'node:buffer'
import http from 'node:http'
import process from 'node:process'

const port = Number(process.env.PROXY_PORT ?? 8787)
const upstream = new URL(process.env.AI_GATEWAY_UPSTREAM ?? 'https://ai-gateway.vercel.sh')
const maxRequestBytes = Number(process.env.MAX_AI_PROXY_REQUEST_BYTES ?? 10 * 1024 * 1024)
const allowedPaths = new Set([
  '/v1/chat/completions',
  '/v1/embeddings',
  '/v1/models',
  '/v1/responses',
])

const chunks = []
for await (const chunk of process.stdin) {
  chunks.push(Buffer.from(chunk))
}

const [gatewayToken, clientToken] = Buffer.concat(chunks).toString('utf8').split('\n').map(part => part.trim())
if (!gatewayToken || !clientToken) {
  console.error('AI Gateway proxy did not receive both required tokens')
  process.exit(1)
}

function writePlain(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.end(body)
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
    if (requestUrl.pathname.includes('/../') || requestUrl.pathname.includes('/./') || !allowedPaths.has(requestUrl.pathname)) {
      writePlain(res, 404, 'not found')
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
    const headers = {}

    for (const [key, value] of Object.entries(req.headers)) {
      const lowerKey = key.toLowerCase()
      if (lowerKey === 'host' || lowerKey === 'content-length' || lowerKey === 'connection')
        continue
      headers[key] = value
    }

    headers.authorization = `Bearer ${gatewayToken}`

    const upstreamUrl = new URL(requestUrl.pathname, upstream)
    upstreamUrl.search = requestUrl.search

    const upstreamResponse = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body: body.length > 0 ? body : undefined,
      redirect: 'manual',
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

    const reader = upstreamResponse.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      res.write(value)
    }
    res.end()
  }
  catch (error) {
    console.error('AI Gateway proxy request failed:', error instanceof Error ? error.message : String(error))
    writePlain(res, 502, 'AI Gateway proxy request failed')
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`AI Gateway proxy listening on 127.0.0.1:${port}`)
})
