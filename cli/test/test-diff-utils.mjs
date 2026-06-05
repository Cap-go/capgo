#!/usr/bin/env node

import process from 'node:process'
import { diffLines } from '../src/build/onboarding/diff-utils.ts'

console.log('🧪 Testing diff-utils...\n')

let testsPassed = 0
let testsFailed = 0

async function test(name, fn) {
  try {
    console.log(`\n🔍 ${name}`)
    await fn()
    console.log(`✅ PASSED: ${name}`)
    testsPassed++
  }
  catch (error) {
    console.error(`❌ FAILED: ${name}`)
    console.error(`   Error: ${error.message}`)
    testsFailed++
  }
}

function assertDeepEquals(actual, expected, message) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e)
    throw new Error(message || `Expected ${e}, got ${a}`)
}

await test('new file (empty before) → every line is an addition', () => {
  const result = diffLines('', 'name: Capgo\non: workflow_dispatch')
  assertDeepEquals(result, [
    { kind: 'add', text: 'name: Capgo' },
    { kind: 'add', text: 'on: workflow_dispatch' },
  ])
})

await test('removed file (empty after) → every line is a deletion', () => {
  const result = diffLines('foo\nbar', '')
  assertDeepEquals(result, [
    { kind: 'del', text: 'foo' },
    { kind: 'del', text: 'bar' },
  ])
})

await test('identical files → all lines marked eq', () => {
  const result = diffLines('one\ntwo\nthree', 'one\ntwo\nthree')
  assertDeepEquals(result, [
    { kind: 'eq', text: 'one' },
    { kind: 'eq', text: 'two' },
    { kind: 'eq', text: 'three' },
  ])
})

await test('single-line replacement → del + add', () => {
  const result = diffLines('hello\nworld', 'hello\nthere')
  assertDeepEquals(result, [
    { kind: 'eq', text: 'hello' },
    { kind: 'del', text: 'world' },
    { kind: 'add', text: 'there' },
  ])
})

await test('insertion in the middle → context preserved', () => {
  const result = diffLines('a\nb\nc', 'a\nNEW\nb\nc')
  assertDeepEquals(result, [
    { kind: 'eq', text: 'a' },
    { kind: 'add', text: 'NEW' },
    { kind: 'eq', text: 'b' },
    { kind: 'eq', text: 'c' },
  ])
})

await test('deletion at the end', () => {
  const result = diffLines('a\nb\nc', 'a\nb')
  assertDeepEquals(result, [
    { kind: 'eq', text: 'a' },
    { kind: 'eq', text: 'b' },
    { kind: 'del', text: 'c' },
  ])
})

await test('empty strings (both sides) → empty result', () => {
  const result = diffLines('', '')
  assertDeepEquals(result, [])
})

await test('preserves trailing-newline split semantics', () => {
  // 'a\n' splits to ['a', ''] — both pieces flow through unchanged.
  const result = diffLines('a\n', 'a\n')
  assertDeepEquals(result, [
    { kind: 'eq', text: 'a' },
    { kind: 'eq', text: '' },
  ])
})

if (testsFailed > 0) {
  console.error(`\n❌ ${testsFailed} test(s) failed`)
  process.exit(1)
}
console.log(`\n✅ diff-utils tests passed (${testsPassed})`)
