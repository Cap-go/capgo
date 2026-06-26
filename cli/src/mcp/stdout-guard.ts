import type { Writable } from 'node:stream'
import process from 'node:process'
import { Writable as NodeWritable } from 'node:stream'

/**
 * Harden a stdio MCP server against stdout pollution.
 *
 * The MCP stdio transport frames JSON-RPC over `process.stdout`. Any *other* write to
 * stdout — a clack `intro`/`log`, a stray `console.log`, a chatty dependency — injects
 * non-JSON bytes into that stream, and a strict client (e.g. Codex) then drops the
 * connection with "Transport closed". Per-call `silent` flags (see sdk.ts) are easy to
 * miss one-by-one, so this is the backstop: it routes EVERY ambient `process.stdout`
 * write to stderr (still visible for debugging, harmless to the protocol) and returns a
 * dedicated Writable — bound to the real stdout — for the transport to send JSON-RPC on.
 *
 * Call once, before constructing StdioServerTransport, and hand it the returned stream:
 *   const out = installMcpStdoutGuard()
 *   const transport = new StdioServerTransport(process.stdin, out)
 *
 * @returns a Writable wired to the real fd-1 stdout, for the transport only.
 */
export function installMcpStdoutGuard(): Writable {
  // Capture the ORIGINAL writer before reassigning process.stdout.write below, so the
  // transport keeps a direct line to fd 1 regardless of the ambient redirect.
  const realStdoutWrite = process.stdout.write.bind(process.stdout)

  const transportStdout = new NodeWritable({
    write(chunk, encoding, callback) {
      realStdoutWrite(chunk as never, encoding as never, callback)
    },
  })

  // Ambient stdout (console.log, clack, dependencies) → stderr. process.stderr.write
  // normalizes the (chunk), (chunk, cb), (chunk, encoding, cb) overloads itself, so we
  // forward all three positionally.
  const stderrWrite = process.stderr.write.bind(process.stderr)
  process.stdout.write = function write(chunk: never, encoding?: never, callback?: never): boolean {
    return stderrWrite(chunk, encoding, callback)
  } as typeof process.stdout.write

  return transportStdout
}
