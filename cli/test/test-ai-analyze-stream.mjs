#!/usr/bin/env node
// cli/test/test-ai-analyze-stream.mjs
import { postAnalyzeStreamRequest } from '../src/ai/analyze.ts'

let passed = 0
let failed = 0

function test(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { console.log(`✅ ${name}`); passed++ })
    .catch((err) => { console.error(`❌ ${name}\n   ${err.message}`); failed++ })
}

const baseInput = { apiHost: 'https://api.test', apikey: 'k', jobId: 'j1', appId: 'a1', logs: 'log text' }

function sseResponse(frames, status = 200) {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f))
      controller.close()
    },
  })
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } })
}

await test('accumulates chunks and resolves ok on done; onChunk fires per delta', async () => {
  globalThis.fetch = async (url, init) => {
    if (!String(url).endsWith('/build/ai_analyze_stream')) throw new Error(`wrong url ${url}`)
    if (init.headers.accept !== 'text/event-stream') throw new Error('missing accept header')
    return sseResponse([
      'event: chunk\ndata: {"text":"Hello "}\n\n',
      'event: chunk\ndata: {"text":"world"}\n\n',
      'event: done\ndata: {"durationMs":42}\n\n',
    ])
  }
  const chunks = []
  const r = await postAnalyzeStreamRequest({ ...baseInput, onChunk: t => chunks.push(t) })
  if (r.kind !== 'ok') throw new Error(`got ${r.kind}: ${r.message}`)
  if (r.analysis !== 'Hello world') throw new Error(`got ${r.analysis}`)
  if (chunks.join('|') !== 'Hello |world') throw new Error(`got chunks ${chunks.join('|')}`)
})

await test('mid-stream error event returns kind error with partial text', async () => {
  globalThis.fetch = async () => sseResponse([
    'event: chunk\ndata: {"text":"partial diag"}\n\n',
    'event: error\ndata: {"code":"idle_timeout"}\n\n',
  ])
  const r = await postAnalyzeStreamRequest(baseInput)
  if (r.kind !== 'error') throw new Error(`got ${r.kind}`)
  if (r.message !== 'idle_timeout') throw new Error(`got ${r.message}`)
  if (r.partial !== 'partial diag') throw new Error(`got partial ${r.partial}`)
})

await test('maps 409 to already_analyzed', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'already_analyzed' }), { status: 409 })
  const r = await postAnalyzeStreamRequest(baseInput)
  if (r.kind !== 'already_analyzed') throw new Error(`got ${r.kind}`)
})

await test('maps 413 to too_big', async () => {
  globalThis.fetch = async () => new Response('', { status: 413 })
  const r = await postAnalyzeStreamRequest(baseInput)
  if (r.kind !== 'too_big') throw new Error(`got ${r.kind}`)
})

await test('maps 426 to upgrade_required with the server message', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Please upgrade', code: 'upgrade_required' }), { status: 426 })
  const r = await postAnalyzeStreamRequest(baseInput)
  if (r.kind !== 'upgrade_required') throw new Error(`got ${r.kind}`)
  if (r.message !== 'Please upgrade') throw new Error(`got ${r.message}`)
})

await test('stream ending without a terminal event is an error with partial', async () => {
  globalThis.fetch = async () => sseResponse(['event: chunk\ndata: {"text":"cut"}\n\n'])
  const r = await postAnalyzeStreamRequest(baseInput)
  if (r.kind !== 'error') throw new Error(`got ${r.kind}`)
  if (r.partial !== 'cut') throw new Error(`got partial ${r.partial}`)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
