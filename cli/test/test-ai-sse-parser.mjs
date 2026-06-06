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

await test('parses CRLF-delimited frames', () => {
  const events = []
  const feed = createSseParser(e => events.push(e))
  feed('event: chunk\r\ndata: {"text":"crlf"}\r\n\r\nevent: done\r\ndata: {"durationMs":7}\r\n\r\n')
  if (events.length !== 2) throw new Error(`got ${events.length} events`)
  if (events[0].data !== '{"text":"crlf"}') throw new Error(`got ${events[0].data}`)
  if (events[1].event !== 'done') throw new Error(`got ${events[1].event}`)
})

await test('handles a CRLF sequence split across feeds', () => {
  const events = []
  const feed = createSseParser(e => events.push(e))
  feed('event: chunk\r\ndata: {"text":"x"}\r')
  feed('\n\r')
  feed('\nevent: done\r\ndata: {"durationMs":1}\r\n\r\n')
  if (events.length !== 2) throw new Error(`got ${events.length} events`)
  if (events[0].data !== '{"text":"x"}') throw new Error(`got ${events[0].data}`)
})

await test('parses lone-CR line endings (held trailing CR resolves on next feed)', () => {
  const events = []
  const feed = createSseParser(e => events.push(e))
  feed('event: chunk\rdata: {"text":"cr"}\r\r')
  // The final \r is held back — it could be the first half of a \r\n pair
  // split across network chunks — so nothing dispatches yet.
  if (events.length !== 0) throw new Error('dispatched before terminator resolved')
  feed('event: done\rdata: {"durationMs":1}\r\r\r')
  if (events.length !== 2) throw new Error(`got ${events.length} events`)
  if (events[0].data !== '{"text":"cr"}') throw new Error(`got ${events[0].data}`)
  if (events[1].event !== 'done') throw new Error(`got ${events[1].event}`)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
