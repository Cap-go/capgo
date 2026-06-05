#!/usr/bin/env node
// cli/test/test-ai-sse-parser.mjs
import { createSseParser } from '../src/ai/sse.ts'

let passed = 0
let failed = 0

function test(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { console.log(`✅ ${name}`); passed++ })
    .catch((err) => { console.error(`❌ ${name}\n   ${err.message}`); failed++ })
}

await test('parses a single complete frame', () => {
  const events = []
  const feed = createSseParser(e => events.push(e))
  feed('event: chunk\ndata: {"text":"hi"}\n\n')
  if (events.length !== 1) throw new Error(`got ${events.length} events`)
  if (events[0].event !== 'chunk') throw new Error(`got event ${events[0].event}`)
  if (events[0].data !== '{"text":"hi"}') throw new Error(`got data ${events[0].data}`)
})

await test('handles frames split across feeds', () => {
  const events = []
  const feed = createSseParser(e => events.push(e))
  feed('event: chu')
  feed('nk\ndata: {"text":"split"}\n')
  feed('\nevent: done\ndata: {"durationMs":3}\n\n')
  if (events.length !== 2) throw new Error(`got ${events.length} events`)
  if (events[0].data !== '{"text":"split"}') throw new Error(`got ${events[0].data}`)
  if (events[1].event !== 'done') throw new Error(`got ${events[1].event}`)
})

await test('joins multi-line data fields with newline', () => {
  const events = []
  const feed = createSseParser(e => events.push(e))
  feed('event: chunk\ndata: line1\ndata: line2\n\n')
  if (events[0].data !== 'line1\nline2') throw new Error(`got ${events[0].data}`)
})

await test('ignores comment lines and frames without data', () => {
  const events = []
  const feed = createSseParser(e => events.push(e))
  feed(': keep-alive\n\nevent: chunk\ndata: {"text":"x"}\n\n')
  if (events.length !== 1) throw new Error(`got ${events.length} events`)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
