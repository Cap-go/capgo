#!/usr/bin/env node
import { renderMarkdown } from '../src/ai/render-markdown.ts'
import { createStreamingMarkdownRenderer } from '../src/ai/stream-markdown.ts'

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`✅ ${name}`)
    passed++
  }
  catch (err) {
    console.error(`❌ ${name}\n   ${err.message}`)
    failed++
  }
}

function streamRender(chunks, isTTY = true) {
  let out = ''
  const r = createStreamingMarkdownRenderer((t) => { out += t }, isTTY)
  for (const c of chunks) r.feed(c)
  r.flush()
  return out
}

const SAMPLES = [
  // Realistic AI analysis shape
  '### Likely cause\nThe build failed because `compileSdkVersion` is **missing**.\n\n#### Evidence\n```\nerror: cannot find symbol\n  import com.example.Missing;\n```\n\n### Suggested fix\n1. Edit `build.gradle`.\n2. Re-run with *care*.\n- bullet one\n* bullet two\n',
  // No trailing newline
  '### Header\nplain tail without newline',
  // Header as very first line
  '### First',
  // Fence-only content and unclosed fence
  '```\ncode line\n```',
  '```\nunclosed fence tail',
  // Empty and whitespace
  '',
  '\n',
  'plain only',
]

// THE core property: streamed output must equal the buffered render for
// EVERY possible 2-chunk split point of every sample.
test('streamed output === buffered render for every split point', () => {
  for (const md of SAMPLES) {
    const expected = renderMarkdown(md, true)
    for (let split = 0; split <= md.length; split++) {
      const got = streamRender([md.slice(0, split), md.slice(split)])
      if (got !== expected)
        throw new Error(`split ${split} of ${JSON.stringify(md.slice(0, 40))}…: ${JSON.stringify(got)} !== ${JSON.stringify(expected)}`)
    }
  }
})

test('streamed output === buffered render when fed one character at a time', () => {
  for (const md of SAMPLES) {
    const expected = renderMarkdown(md, true)
    const got = streamRender([...md])
    if (got !== expected)
      throw new Error(`char-at-a-time on ${JSON.stringify(md.slice(0, 40))}…: ${JSON.stringify(got)} !== ${JSON.stringify(expected)}`)
  }
})

test('fence marker split across two chunks still toggles code mode', () => {
  const md = '### not a header\n```\ncode\n```\ndone'
  const expected = renderMarkdown(md, true)
  // Split right in the middle of the ``` fence
  const i = md.indexOf('```') + 1
  const got = streamRender([md.slice(0, i), md.slice(i)])
  if (got !== expected)
    throw new Error(`${JSON.stringify(got)} !== ${JSON.stringify(expected)}`)
})

test('lines emit as soon as their newline arrives (progressive)', () => {
  const writes = []
  const r = createStreamingMarkdownRenderer(t => writes.push(t), true)
  r.feed('### Head')
  if (writes.length !== 0)
    throw new Error('emitted before the line was complete')
  r.feed('er\nbody ')
  if (writes.length !== 1)
    throw new Error(`expected 1 write after header newline, got ${writes.length}`)
  if (!writes[0].includes('Header'))
    throw new Error(`first write should contain the rendered header: ${JSON.stringify(writes[0])}`)
  r.feed('text\n')
  if (writes.length !== 2)
    throw new Error(`expected 2 writes, got ${writes.length}`)
  r.flush()
})

test('non-TTY mode is a raw passthrough', () => {
  const md = '### Header\n`code` and **bold**\n'
  const got = streamRender([md.slice(0, 7), md.slice(7)], false)
  if (got !== md)
    throw new Error(`expected raw passthrough, got ${JSON.stringify(got)}`)
})

test('headers render bold green', () => {
  const got = streamRender(['### Hello\n'])
  if (!got.includes('\x1B[1m\x1B[32mHello\x1B[0m'))
    throw new Error(`missing bold green header: ${JSON.stringify(got)}`)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
