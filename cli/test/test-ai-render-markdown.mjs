#!/usr/bin/env node
import { renderMarkdown } from '../src/ai/render-markdown.ts'

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

// non-TTY: passthrough
test('renderMarkdown(md, false) returns input unchanged (non-TTY)', () => {
  const md = '### Likely cause\nfoo\n\n```\nx\n```'
  const out = renderMarkdown(md, false)
  if (out !== md)
    throw new Error(`expected passthrough, got: ${JSON.stringify(out)}`)
})

// TTY: header gets styled
test('header line gets bold+green styling in TTY mode', () => {
  const out = renderMarkdown('### Hello', true)
  if (!out.includes('\x1B[1m\x1B[32mHello\x1B[0m'))
    throw new Error(`missing styled header in: ${JSON.stringify(out)}`)
})

// Code block: fence lines hidden, each line prefixed with a gray vertical bar
test('fenced code block: fences hidden, lines prefixed with gray bar', () => {
  const out = renderMarkdown('```\nfoo\n```', true)
  // The ``` fence lines must NOT appear in the output
  if (out.includes('```'))
    throw new Error(`fence line leaked through: ${JSON.stringify(out)}`)
  // Each content line should have the gray vertical bar prefix
  if (!out.includes('\x1B[90m▎ \x1B[0mfoo'))
    throw new Error(`code line missing bar prefix: ${JSON.stringify(out)}`)
})

test('multi-line code block: every line including blanks gets the bar', () => {
  const out = renderMarkdown('```\nline1\n\nline3\n```', true)
  const bar = '\x1B[90m▎ \x1B[0m'
  if (!out.includes(`${bar}line1`))
    throw new Error(`line1 missing bar: ${JSON.stringify(out)}`)
  if (!out.includes(`${bar}line3`))
    throw new Error(`line3 missing bar: ${JSON.stringify(out)}`)
  // The blank line in the middle should still get the bar so the left edge is unbroken
  const linesWithBar = out.split('\n').filter(l => l.startsWith(bar))
  if (linesWithBar.length !== 3)
    throw new Error(`expected 3 barred lines (incl. blank), got ${linesWithBar.length}: ${JSON.stringify(out)}`)
})

// Numbered list: number colored, rest plain
test('numbered list number is yellow, rest stays plain', () => {
  const out = renderMarkdown('1. do thing', true)
  if (!out.includes('\x1B[33m1.\x1B[0m do thing'))
    throw new Error(`numbered list not styled: ${JSON.stringify(out)}`)
})

// Bullet list
test('bullet list dash becomes •', () => {
  const out = renderMarkdown('- item', true)
  if (!out.includes('\x1B[33m•\x1B[0m item'))
    throw new Error(`bullet not styled: ${JSON.stringify(out)}`)
})

// Inline code
test('`inline code` gets dim cyan styling', () => {
  const out = renderMarkdown('use `foo` here', true)
  if (!out.includes('\x1B[36m\x1B[2mfoo\x1B[0m'))
    throw new Error(`inline code not styled: ${JSON.stringify(out)}`)
})

// Bold
test('**bold** gets bold styling', () => {
  const out = renderMarkdown('this is **important**', true)
  if (!out.includes('\x1B[1mimportant\x1B[0m'))
    throw new Error(`bold not styled: ${JSON.stringify(out)}`)
})

// Multi-section realistic AI output
test('realistic AI output: headers + code fence + list all render', () => {
  const md = [
    '### Likely cause',
    'Gradle resolution failure',
    '',
    '### Evidence',
    '```',
    'error: not found',
    '```',
    '',
    '### Suggested fix',
    '1. Edit build.gradle',
    '2. Sync',
  ].join('\n')
  const out = renderMarkdown(md, true)
  if (!out.includes('Likely cause') || !out.includes('Evidence') || !out.includes('Suggested fix'))
    throw new Error('missing section headers')
  if (!out.includes('error: not found'))
    throw new Error('missing code content')
  if (!out.includes('\x1B[33m1.\x1B[0m'))
    throw new Error('missing numbered list styling')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
