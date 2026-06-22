#!/usr/bin/env node
/**
 * Regression: the MCP server must complete the JSON-RPC initialize handshake with a CLEAN
 * stdout even when NO API key is reachable (no CAPGO_TOKEN, no ~/.capgo, no ./.capgo).
 *
 * The bug: startup resolved the saved key with the throwing/logging findSavedKey()
 * variant. On the no-key path it wrote a clack "please login" line to STDOUT before
 * throwing, and those non-JSON bytes corrupted the JSON-RPC frame stream. A strict client
 * (Codex) dropped the connection with "connection closed: initialize response". This is
 * the exact state a first-time user is in BEFORE calling capgo_login, so it broke sign-in
 * for its entire intended audience.
 *
 * Why this test reads RAW stdout instead of using the MCP SDK client: the SDK client is
 * lenient and can still surface the initialize response even with a trailing stray line,
 * so it does NOT reliably catch the regression. The actual contract is byte-level: EVERY
 * line the server writes to stdout must be valid JSON-RPC. We assert that directly.
 *
 * The fix: install the stdout guard first, and resolve the key with findSavedKeySilent()
 * (never logs, never throws). Pairs with test-mcp-stdout-guard.mjs (guard in isolation).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

const bundlePath = join(process.cwd(), 'dist', 'index.js')
if (!existsSync(bundlePath)) {
  console.error('dist/index.js not found. Run "bun run build" first.')
  process.exit(1)
}

console.log('🧪 Testing MCP no-key handshake (raw stdout must be pure JSON-RPC)...\n')

// A throwaway HOME + cwd with no .capgo, and an env with every key source stripped, so
// the server resolves no key — the real first-time-user condition.
const emptyHome = mkdtempSync(join(tmpdir(), 'capgo-mcp-nokey-home-'))
const emptyCwd = mkdtempSync(join(tmpdir(), 'capgo-mcp-nokey-cwd-'))
const childEnv = { ...process.env }
delete childEnv.CAPGO_TOKEN
delete childEnv.CAPGO_API_KEY
childEnv.HOME = emptyHome
childEnv.USERPROFILE = emptyHome

const child = spawn(process.execPath, [bundlePath, 'mcp'], {
  cwd: emptyCwd,
  env: childEnv,
  stdio: ['pipe', 'pipe', 'pipe'],
})

let stdoutBuf = ''
let stderrBuf = ''
const stdoutLines = [] // every complete non-empty line the server wrote to stdout
let initResult = null
child.stderr.on('data', d => (stderrBuf += d.toString()))
child.stdout.on('data', (d) => {
  stdoutBuf += d.toString()
  let nl
  while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
    const line = stdoutBuf.slice(0, nl)
    stdoutBuf = stdoutBuf.slice(nl + 1)
    if (line.trim())
      stdoutLines.push(line)
  }
})

const send = obj => child.stdin.write(`${JSON.stringify(obj)}\n`)
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'capgo-nokey', version: '0' } } })

const settle = ms => new Promise(r => setTimeout(r, ms))
// Give the server time to boot, respond, and flush any stray startup writes.
await settle(6000)

child.kill('SIGKILL')
rmSync(emptyHome, { recursive: true, force: true })
rmSync(emptyCwd, { recursive: true, force: true })

let pass = 0
let fail = 0
function test(name, fn) {
  try { fn(); console.log(`✅ PASSED: ${name}`); pass++ }
  catch (e) { console.error(`❌ FAILED: ${name}`); console.error(`   ${e.message}`); fail++ }
}

// The core contract: NOTHING but JSON-RPC reaches stdout. A clack/console line fails here.
test('every stdout line is valid JSON (no stray clack/console output corrupts the stream)', () => {
  const offenders = []
  for (const line of stdoutLines) {
    try {
      const msg = JSON.parse(line)
      if (msg.id === 1 && msg.result)
        initResult = msg.result
    }
    catch {
      offenders.push(line.slice(0, 160))
    }
  }
  if (offenders.length)
    throw new Error(`Non-JSON line(s) on stdout would corrupt the handshake:\n   ${offenders.join('\n   ')}`)
})

test('initialize response was received on the no-key handshake', () => {
  if (!initResult)
    throw new Error(`No initialize response. stderr:\n${stderrBuf.slice(0, 600)}`)
})

console.log(`\n📊 Results: ${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
