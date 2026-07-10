#!/usr/bin/env node
import { existsSync, statSync, readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  getLogCapturePath,
  startCaptureForJob,
  appendCapturedLine,
  cleanupCapturedJobFiles,
  shouldCaptureLogs,
} from '../src/ai/log-capture.ts'

let passed = 0
let failed = 0

function test(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { console.log(`✅ ${name}`); passed++ })
    .catch((err) => { console.error(`❌ ${name}\n   ${err.message}`); failed++ })
}

const TEST_DIR = join(tmpdir(), `capgo-ai-test-${Date.now()}`)
const JOB_ID = 'job-test-abc'

await mkdir(TEST_DIR, { recursive: true })
process.env.CAPGO_AI_LOG_BASE_DIR = TEST_DIR // override /tmp/capgo-builds for tests

await test('getLogCapturePath returns expected path under override base dir', () => {
  const p = getLogCapturePath(JOB_ID)
  if (p !== join(TEST_DIR, `${JOB_ID}.log`))
    throw new Error(`unexpected path: ${p}`)
})

await test('shouldCaptureLogs returns false when not a TTY', () => {
  const orig = process.stdout.isTTY
  process.stdout.isTTY = false
  const result = shouldCaptureLogs()
  process.stdout.isTTY = orig
  if (result !== false)
    throw new Error(`expected false when not TTY, got ${result}`)
})

await test('shouldCaptureLogs returns true when stdout is TTY', () => {
  const orig = process.stdout.isTTY
  process.stdout.isTTY = true
  const result = shouldCaptureLogs()
  process.stdout.isTTY = orig
  if (result !== true)
    throw new Error(`expected true when TTY, got ${result}`)
})

await test('startCaptureForJob creates the directory and empty file', async () => {
  await startCaptureForJob(JOB_ID)
  const p = getLogCapturePath(JOB_ID)
  if (!existsSync(p))
    throw new Error(`log file not created at ${p}`)
  if (statSync(p).size !== 0)
    throw new Error(`expected empty file, size = ${statSync(p).size}`)
})

await test('appendCapturedLine appends lines with newlines', async () => {
  await startCaptureForJob(JOB_ID)
  await appendCapturedLine(JOB_ID, 'first line')
  await appendCapturedLine(JOB_ID, 'second line')
  const content = readFileSync(getLogCapturePath(JOB_ID), 'utf8')
  if (content !== 'first line\nsecond line\n')
    throw new Error(`unexpected content: ${JSON.stringify(content)}`)
})

await test('cleanupCapturedJobFiles removes the log file', async () => {
  await startCaptureForJob(JOB_ID)
  await appendCapturedLine(JOB_ID, 'something')
  await cleanupCapturedJobFiles(JOB_ID, { keepAiPromptFile: false })
  if (existsSync(getLogCapturePath(JOB_ID)))
    throw new Error('log file should have been deleted')
})

await test('cleanupCapturedJobFiles is idempotent (no throw when file missing)', async () => {
  await cleanupCapturedJobFiles(JOB_ID, { keepAiPromptFile: false })
  await cleanupCapturedJobFiles(JOB_ID, { keepAiPromptFile: false }) // second call
  // no error = pass
})

await test('cleanupCapturedJobFiles with keepAiPromptFile=true preserves .ai-prompt.txt', async () => {
  await startCaptureForJob(JOB_ID)
  const promptPath = join(TEST_DIR, `${JOB_ID}.ai-prompt.txt`)
  // simulate that local-AI flow wrote this file
  await writeFile(promptPath, 'prompt + logs')
  await cleanupCapturedJobFiles(JOB_ID, { keepAiPromptFile: true })
  if (existsSync(getLogCapturePath(JOB_ID)))
    throw new Error('log file should have been deleted')
  if (!existsSync(promptPath))
    throw new Error('.ai-prompt.txt should have been preserved')
})

await rm(TEST_DIR, { recursive: true, force: true })

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
