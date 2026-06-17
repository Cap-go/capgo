#!/usr/bin/env node
/**
 * The MCP stdio transport frames JSON-RPC over stdout. A stray write to stdout from
 * any tool or dependency (a clack `intro`/`log`, a console.log) injects non-JSON bytes
 * into that stream and a strict client (e.g. Codex) drops the connection with
 * "Transport closed". installMcpStdoutGuard() is the backstop: ambient stdout writes
 * are routed to stderr, and the transport gets a dedicated stream to the real stdout.
 *
 * This pins both halves of that contract.
 */
import process from 'node:process'

console.log('🧪 Testing MCP stdout guard...\n')

const { installMcpStdoutGuard } = await import('../src/mcp/stdout-guard.ts')

let pass = 0
let fail = 0
async function test(name, fn) {
  try { await fn(); console.log(`✅ PASSED: ${name}`); pass++ }
  catch (e) { console.error(`❌ FAILED: ${name}`); console.error(`   ${e.message}`); fail++ }
}
function ok(c, msg) { if (!c) throw new Error(msg || 'expected truthy') }

await test('ambient stdout → stderr; transport stream → real stdout', async () => {
  const origStdoutWrite = process.stdout.write
  const origStderrWrite = process.stderr.write
  const stdoutBuf = []
  const stderrBuf = []
  // Stand-in sinks for fd-1 / fd-2 that the guard will bind to / redirect to.
  const cap = buf => (chunk, enc, cb) => {
    buf.push(String(chunk))
    const done = typeof enc === 'function' ? enc : cb
    if (typeof done === 'function') done()
    return true
  }
  process.stdout.write = cap(stdoutBuf)
  process.stderr.write = cap(stderrBuf)

  let transportStdout
  try {
    transportStdout = installMcpStdoutGuard()
    // What clack/console.log do — must NOT land on the stdout sink.
    process.stdout.write('AMBIENT_POLLUTION\n')
    // What the transport does — must reach the real stdout sink.
    transportStdout.write('{"jsonrpc":"2.0","id":1}\n')
    await new Promise(r => setImmediate(r)) // let the Writable flush _write
  }
  finally {
    process.stdout.write = origStdoutWrite
    process.stderr.write = origStderrWrite
  }

  const onStdout = stdoutBuf.join('')
  const onStderr = stderrBuf.join('')
  ok(!onStdout.includes('AMBIENT_POLLUTION'), 'ambient write must NOT reach stdout (it would corrupt JSON-RPC framing)')
  ok(onStderr.includes('AMBIENT_POLLUTION'), 'ambient write must be redirected to stderr')
  ok(onStdout.includes('{"jsonrpc":"2.0","id":1}'), 'transport frames must still reach the real stdout')
  ok(!onStderr.includes('{"jsonrpc":"2.0","id":1}'), 'transport frames must NOT be redirected to stderr')
})

console.log(`\n📊 Results: ${pass} passed, ${fail} failed`)
if (fail > 0)
  process.exit(1)
