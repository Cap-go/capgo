// Shared contract for the App Store Connect API-key helper's stdout "stats
// protocol". The native Swift helper (see the asc-key-helper repo /
// StatsProtocol.swift) writes newline-delimited JSON ("NDJSON") to stdout — one
// self-describing envelope per line, tagged with `capgoAscKey` (the protocol
// version) so we can ignore incidental stdout chatter:
//
//   {"capgoAscKey":1,"kind":"event","ts":12,"runId":"...","name":"step_changed","props":{}}
//   {"capgoAscKey":1,"kind":"result","ts":900,"runId":"...","ok":true,"keyId":"...","issuerId":"...","privateKey":"..."}
//   {"capgoAscKey":1,"kind":"result","ts":900,"runId":"...","ok":false,"errorCode":"USER_CANCELLED","message":"..."}
//
// `event` lines are forwarded to PostHog. The terminal `result` line carries the
// credentials on success and is the ONLY place the private key ever appears —
// it must never be forwarded to analytics. Human diagnostics stay on stderr and
// are not part of this protocol.

/** Protocol version understood by this CLI. Bumped on breaking changes. */
export const ASC_PROTOCOL_VERSION = 1

/** Analytics channel every forwarded helper event is sent on. */
export const ASC_KEY_CHANNEL = 'app-store-connect-key'

/** A non-sensitive analytics event emitted by the helper. */
export interface AscEventLine {
  capgoAscKey: number
  kind: 'event'
  /** Milliseconds since the helper started. */
  ts: number
  /** Correlates every line of a single helper run. */
  runId: string
  /** snake_case event name, e.g. `step_changed`, `validation_succeeded`. */
  name: string
  /** Non-sensitive properties. NEVER contains the private key. */
  props: Record<string, unknown>
}

/** Severity levels a helper diagnostic `log` line may carry. */
export const ASC_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type AscLogLevel = (typeof ASC_LOG_LEVELS)[number]

/**
 * A verbose diagnostic line. Unlike an `event` (which feeds PostHog analytics),
 * a `log` line is routed into the CLI's **internal support log** — the bundle a
 * user emails to support when a run goes wrong. Use it generously for anything
 * that helps a human diagnose a stuck/failed run after the fact: a finder that
 * matched nothing, an unexpected navigation, the detail of a validation error.
 * It is NOT analytics and, like an event, NEVER carries the private key.
 */
export interface AscLogLine {
  capgoAscKey: number
  kind: 'log'
  /** Milliseconds since the helper started. */
  ts: number
  /** Correlates every line of a single helper run. */
  runId: string
  /** Severity, defaulting to `info` when the helper omits/garbles it. */
  level: AscLogLevel
  /** Human-readable diagnostic message. */
  message: string
  /** Optional structured context. NEVER contains the private key. */
  props: Record<string, unknown>
}

/** The captured credentials, delivered on the terminal success line. */
export interface AscCredentials {
  keyId: string
  issuerId: string
  privateKey: string
}

/** Terminal line: success carries credentials, failure carries an error. */
export interface AscResultLine {
  capgoAscKey: number
  kind: 'result'
  ts: number
  runId: string
  ok: boolean
  // Success fields:
  keyId?: string
  issuerId?: string
  privateKey?: string
  // Failure fields:
  errorCode?: string
  message?: string
}

export type AscProtocolLine = AscEventLine | AscLogLine | AscResultLine

/** Coerce an arbitrary `level` value to a known {@link AscLogLevel}. */
function normalizeLogLevel(value: unknown): AscLogLevel {
  return (typeof value === 'string' && (ASC_LOG_LEVELS as readonly string[]).includes(value))
    ? value as AscLogLevel
    : 'info'
}

/**
 * Parse a single raw stdout line into a protocol envelope, or `null` when the
 * line is not part of the protocol (blank line, incidental chatter, wrong
 * version, or malformed JSON). Never throws — a misbehaving helper must not
 * crash the CLI.
 */
export function parseAscProtocolLine(line: string): AscProtocolLine | null {
  const trimmed = line.trim().replace(/^\uFEFF/, '')
  if (!trimmed || trimmed[0] !== '{')
    return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  }
  catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object')
    return null
  const obj = parsed as Record<string, unknown>
  // The version tag is what distinguishes a protocol line from random JSON.
  if (obj.capgoAscKey !== ASC_PROTOCOL_VERSION)
    return null
  if (obj.kind === 'event') {
    if (typeof obj.name !== 'string')
      return null
    return {
      capgoAscKey: ASC_PROTOCOL_VERSION,
      kind: 'event',
      ts: typeof obj.ts === 'number' ? obj.ts : 0,
      runId: typeof obj.runId === 'string' ? obj.runId : '',
      name: obj.name,
      props: (obj.props && typeof obj.props === 'object') ? obj.props as Record<string, unknown> : {},
    }
  }
  if (obj.kind === 'log') {
    if (typeof obj.message !== 'string')
      return null
    return {
      capgoAscKey: ASC_PROTOCOL_VERSION,
      kind: 'log',
      ts: typeof obj.ts === 'number' ? obj.ts : 0,
      runId: typeof obj.runId === 'string' ? obj.runId : '',
      level: normalizeLogLevel(obj.level),
      message: obj.message,
      props: (obj.props && typeof obj.props === 'object') ? obj.props as Record<string, unknown> : {},
    }
  }
  if (obj.kind === 'result') {
    return {
      capgoAscKey: ASC_PROTOCOL_VERSION,
      kind: 'result',
      ts: typeof obj.ts === 'number' ? obj.ts : 0,
      runId: typeof obj.runId === 'string' ? obj.runId : '',
      ok: obj.ok === true,
      keyId: typeof obj.keyId === 'string' ? obj.keyId : undefined,
      issuerId: typeof obj.issuerId === 'string' ? obj.issuerId : undefined,
      privateKey: typeof obj.privateKey === 'string' ? obj.privateKey : undefined,
      errorCode: typeof obj.errorCode === 'string' ? obj.errorCode : undefined,
      message: typeof obj.message === 'string' ? obj.message : undefined,
    }
  }
  return null
}

/**
 * Incremental line splitter for a streamed stdout. Push raw chunks as they
 * arrive; get back the protocol lines completed by that chunk. Partial trailing
 * data is buffered until its newline arrives. Call {@link flush} at EOF to parse
 * any final newline-less remainder.
 */
export class AscProtocolParser {
  private buffer = ''

  push(chunk: string): AscProtocolLine[] {
    this.buffer += chunk
    const out: AscProtocolLine[] = []
    let newlineIndex = this.buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const rawLine = this.buffer.slice(0, newlineIndex)
      this.buffer = this.buffer.slice(newlineIndex + 1)
      const parsed = parseAscProtocolLine(rawLine)
      if (parsed)
        out.push(parsed)
      newlineIndex = this.buffer.indexOf('\n')
    }
    return out
  }

  flush(): AscProtocolLine[] {
    const rest = this.buffer
    this.buffer = ''
    const parsed = parseAscProtocolLine(rest)
    return parsed ? [parsed] : []
  }
}

// Defensive: never let a value that looks like a secret reach analytics, even
// if a future helper version mistakenly puts one in event props.
const SECRET_KEY_PATTERN = /private[_-]?key|secret|p8|pem|password|token/i

/** Coerce an arbitrary prop value to a PostHog-safe scalar, or drop it. */
function coerceTagValue(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value
  if (value === null || value === undefined)
    return undefined
  // Flatten small structured values so they're still queryable.
  try {
    return JSON.stringify(value)
  }
  catch {
    return undefined
  }
}

/**
 * Build the `trackEvent` tags for a forwarded helper event: the helper's
 * `props` (secret-stripped + scalar-coerced) plus protocol context. Exported
 * for testing.
 */
export function buildEventTags(event: AscEventLine): Record<string, string | number | boolean> {
  const tags: Record<string, string | number | boolean> = {
    helper_event: event.name,
    helper_run_id: event.runId,
    helper_ts_ms: event.ts,
  }
  for (const [key, raw] of Object.entries(event.props)) {
    if (SECRET_KEY_PATTERN.test(key))
      continue
    const value = coerceTagValue(raw)
    if (value !== undefined)
      tags[`prop_${key}`] = value
  }
  return tags
}

/**
 * Map a helper event line to a `trackEvent` input. The `event` field is a
 * human-readable Title Case rendering of the snake_case name (e.g.
 * `step_changed` -> "Step Changed"), under the {@link ASC_KEY_CHANNEL} channel.
 */
export function ascEventToTrack(event: AscEventLine): {
  channel: string
  event: string
  icon: string
  tags: Record<string, string | number | boolean>
} {
  const humanName = event.name
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
  return {
    channel: ASC_KEY_CHANNEL,
    event: `ASC Key: ${humanName}`,
    icon: '🔑',
    tags: buildEventTags(event),
  }
}

// NOTE: `log` lines are routed to the internal support log by the CLI consumer
// (helper.ts) with minimal shaping — the helper's own level/message/props pass
// through, and `appendInternalLog` supplies the timestamp and runs
// `redactSecrets`. The CLI deliberately does NOT render a bespoke display format
// here; secret coverage lives in one place (redactSecrets), not a second guard.
