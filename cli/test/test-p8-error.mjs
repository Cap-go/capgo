#!/usr/bin/env node
// Unit tests for the pure .p8 submit-error classifier (ui/p8-error.ts).
//
// The iOS onboarding .p8 submit handlers (api-key-instructions onPathSubmit +
// input-p8-path onSubmit in ui/app.tsx) wrap MORE than the readFile in their
// try — savePartialProgress / loadProgress run after the read succeeded. The
// old catch rewrote EVERY failure to "File not found: <path>", masking real
// persistence errors. The handlers now classify via classifyP8SubmitError:
//   • ENOENT (the file genuinely isn't there)  → 'not-found' → keep the
//     friendly "File not found" message.
//   • anything else (EACCES, persistence I/O, programming errors, non-Error
//     throwables) → 'other' → surface the REAL error through handleError.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { classifyP8SubmitError } from '../src/build/onboarding/ui/p8-error.ts'

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

async function asyncTest(name, fn) {
  try {
    await fn()
    console.log(`✅ ${name}`)
    passed++
  }
  catch (err) {
    console.error(`❌ ${name}\n   ${err.message}`)
    failed++
  }
}

test('ENOENT-coded error → not-found', () => {
  const err = Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
  if (classifyP8SubmitError(err) !== 'not-found')
    throw new Error(`expected 'not-found', got '${classifyP8SubmitError(err)}'`)
})

await asyncTest('a REAL fs readFile miss classifies as not-found', async () => {
  const missing = join(tmpdir(), `capgo-p8-error-test-${Date.now()}-${Math.random().toString(36).slice(2)}.p8`)
  let caught = null
  try {
    await readFile(missing, 'utf-8')
  }
  catch (err) {
    caught = err
  }
  if (!caught)
    throw new Error('expected readFile of a missing path to throw')
  if (classifyP8SubmitError(caught) !== 'not-found')
    throw new Error(`expected 'not-found', got '${classifyP8SubmitError(caught)}'`)
})

test('plain Error (e.g. savePartialProgress failure) → other', () => {
  if (classifyP8SubmitError(new Error('disk full while saving progress')) !== 'other')
    throw new Error('a plain Error must NOT be rewritten to File not found')
})

test('EACCES-coded error → other (permission problem is not "not found")', () => {
  const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
  if (classifyP8SubmitError(err) !== 'other')
    throw new Error(`expected 'other', got '${classifyP8SubmitError(err)}'`)
})

test('non-Error object carrying code ENOENT → not-found (code is the discriminator)', () => {
  if (classifyP8SubmitError({ code: 'ENOENT' }) !== 'not-found')
    throw new Error('plain object with code ENOENT should classify as not-found')
})

test('non-object throwables (string / null / undefined / number) → other', () => {
  for (const v of ['boom', null, undefined, 42]) {
    if (classifyP8SubmitError(v) !== 'other')
      throw new Error(`expected 'other' for ${JSON.stringify(v)}`)
  }
})

test('error with non-string/unexpected code value → other', () => {
  const err = Object.assign(new Error('weird'), { code: 2 })
  if (classifyP8SubmitError(err) !== 'other')
    throw new Error('numeric code must not match ENOENT')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0)
  process.exit(1)
