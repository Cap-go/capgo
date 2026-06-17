import type { eventWithTime, fullSnapshotEvent, incrementalSnapshotEvent, metaEvent, serializedNodeWithId } from '@rrweb/types'
import { randomUUID } from 'node:crypto'
import type { Document as HappyDocument } from 'happy-dom'
import { env, stderr, stdin, stdout } from 'node:process'
import { EventType, IncrementalSource, MouseInteractions, PointerTypes } from '@rrweb/types'
import { SerializeAddon } from '@xterm/addon-serialize'
import { Terminal } from '@xterm/headless'
import { isCI } from 'ci-info'
import { Window } from 'happy-dom'
import { snapshot } from 'rrweb-snapshot'
import pack from '../../package.json'
import { getPosthogToken, isTruthyEnvValue } from '../posthog'
import { redactSecrets } from '../support/redact'
import { createSupabaseClient } from '../utils'

const DEFAULT_REPLAY_URL = 'https://eu.i.posthog.com/s/'
const DEFAULT_COLS = 100
const DEFAULT_ROWS = 30
const REPLAY_CHAR_WIDTH_PX = 9
const REPLAY_LINE_HEIGHT_PX = 20
const REPLAY_PADDING_PX = 32
const REPLAY_FRAME_THROTTLE_MS = 1000
const REPLAY_FLUSH_TIMEOUT_MS = 1500
const REPLAY_IDENTITY_TIMEOUT_MS = 3000
const TERMINAL_PIXEL_SIZE_TIMEOUT_MS = 200
const DEFAULT_REPLAY_CURRENT_URL = 'capgo-cli://init'
const DEFAULT_REPLAY_SESSION_PREFIX = 'init'
const XTERM_ESCAPE = String.fromCharCode(27)
const XTERM_REPORT_TEXT_AREA_SIZE = `${XTERM_ESCAPE}[14t`
const XTERM_TEXT_AREA_SIZE_RESPONSE = new RegExp(`${XTERM_ESCAPE}\\[4;(\\d+);(\\d+)t`)

type CliStream = typeof stdout | typeof stderr
type StreamWrite = CliStream['write']
interface TerminalSnapshot {
  node: serializedNodeWithId
  terminalNodeId: number
}

export interface TerminalReplayFrame {
  height: number
  html: string
  text: string
  width: number
}

export interface TerminalPixelSize {
  height: number
  width: number
}

interface InitReplayGateInput {
  analyticsEnabled?: boolean
  apikey?: string
  isCi?: boolean
  posthogToken?: string
  stdinIsTTY?: boolean
  stdoutIsTTY?: boolean
  telemetryDisabled?: boolean
}
export interface InitReplayIdentity {
  distinctId: string
  email?: string
  userId?: string
}

interface InitReplaySnapshotBody {
  api_key: string
  distinct_id: string
  event: '$snapshot'
  properties: {
    $current_url: string
    $lib: string
    $lib_version: string
    $session_id: string
    $set?: {
      email?: string
    }
    $snapshot_bytes: number
    $snapshot_data: eventWithTime[]
    $snapshot_source: string
    $window_id: string
    distinct_id: string
    token: string
    user_id?: string
  }
  timestamp: string
}

type InitReplayTransport = (url: string, body: InitReplaySnapshotBody, signal?: AbortSignal) => Promise<boolean>

interface StartInitReplayOptions {
  analyticsEnabled?: boolean
  apikey?: string
  ariaLabel?: string
  cols?: number
  currentUrl?: string
  identity?: InitReplayIdentity
  identityResolver?: (apikey: string, signal?: AbortSignal) => Promise<InitReplayIdentity | undefined>
  posthogToken?: string
  replayUrl?: string
  rows?: number
  sessionPrefix?: string
  throttleMs?: number
  terminalPixelSize?: TerminalPixelSize
  transport?: InitReplayTransport
}

export interface InitReplayController {
  finish: () => Promise<void>
  sessionId: string
}

let activeReplayFinish: (() => Promise<void>) | undefined
let activeReplaySessionId: string | undefined

export function getActiveCliReplaySessionId() {
  return activeReplaySessionId
}

export async function finishActiveCliReplay() {
  await activeReplayFinish?.()
}

export function isCliTelemetryDisabled() {
  return isTruthyEnvValue(env.CAPGO_DISABLE_TELEMETRY) || isTruthyEnvValue(env.CAPGO_DISABLE_POSTHOG)
}

export function shouldStartInitReplay(input: InitReplayGateInput) {
  return Boolean(
    input.apikey?.trim()
    && input.analyticsEnabled !== false
    && input.stdinIsTTY
    && input.stdoutIsTTY
    && !input.isCi
    && !input.telemetryDisabled
    && input.posthogToken?.trim(),
  )
}

export async function resolveInitReplayIdentity(apikey: string, signal?: AbortSignal): Promise<InitReplayIdentity | undefined> {
  const trimmedApiKey = apikey.trim()
  if (!trimmedApiKey)
    return undefined

  try {
    const supabase = await createSupabaseClient(trimmedApiKey, undefined, undefined, true, false, signal)
    let query = supabase
      .rpc('get_user_identity_for_apikey' as never, { apikey: trimmedApiKey } as never)
    if (signal)
      query = query.abortSignal(signal)
    const { data, error } = await query.maybeSingle()

    if (error || !data)
      return undefined

    const row = data as { email?: unknown, user_id?: unknown }
    const userId = typeof row.user_id === 'string' && row.user_id.trim() ? row.user_id : undefined
    const email = typeof row.email === 'string' && row.email.trim() ? row.email : undefined
    const distinctId = userId || email
    return distinctId ? { distinctId, email, userId } : undefined
  }
  catch {
    return undefined
  }
}

function withTimeout<T>(task: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T | undefined> {
  const controller = new AbortController()
  let timer: NodeJS.Timeout | undefined
  return Promise.race([
    task(controller.signal).catch(() => undefined),
    new Promise<undefined>((resolve) => {
      timer = setTimeout(() => {
        controller.abort()
        resolve(undefined)
      }, timeoutMs)
      timer.unref?.()
    }),
  ]).finally(() => {
    if (timer)
      clearTimeout(timer)
  })
}

export function resolvePosthogReplayUrl(host = env.CAPGO_CLI_POSTHOG_API_HOST?.trim() || env.POSTHOG_API_HOST?.trim() || DEFAULT_REPLAY_URL) {
  const trimmedHost = host.trim()
  if (!trimmedHost)
    return undefined

  try {
    const withoutTrailingSlash = trimmedHost.replace(/\/+$/, '')
    if (withoutTrailingSlash.endsWith('/s'))
      return `${withoutTrailingSlash}/`

    const normalizedHost = withoutTrailingSlash
      .replace(/\/i\/v0\/e$/, '/')
      .replace(/\/capture$/, '/')
      .replace(/\/e$/, '/')

    return new URL('s/', normalizedHost.endsWith('/') ? normalizedHost : `${normalizedHost}/`).toString()
  }
  catch {
    return undefined
  }
}
function isUsableTerminalPixelSize(size?: TerminalPixelSize): size is TerminalPixelSize {
  return Boolean(
    size
    && Number.isFinite(size.height)
    && Number.isFinite(size.width)
    && size.height > 0
    && size.width > 0,
  )
}

export function parseTerminalPixelSizeResponse(input: string): TerminalPixelSize | undefined {
  const match = XTERM_TEXT_AREA_SIZE_RESPONSE.exec(input)
  if (!match)
    return undefined

  const height = Number(match[1])
  const width = Number(match[2])
  return isUsableTerminalPixelSize({ height, width }) ? { height, width } : undefined
}

export function getReplayViewportSize(cols = DEFAULT_COLS, rows = DEFAULT_ROWS, terminalPixelSize?: TerminalPixelSize) {
  if (isUsableTerminalPixelSize(terminalPixelSize))
    return { height: Math.round(terminalPixelSize.height), width: Math.round(terminalPixelSize.width) }

  return {
    height: Math.max(480, Math.round(rows * REPLAY_LINE_HEIGHT_PX + REPLAY_PADDING_PX)),
    width: Math.max(800, Math.round(cols * REPLAY_CHAR_WIDTH_PX + REPLAY_PADDING_PX)),
  }
}

function createTerminal(cols: number, rows: number) {
  const term = new Terminal({
    allowProposedApi: true,
    cols,
    convertEol: true,
    fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    fontSize: 14,
    rows,
    theme: {
      background: '#0d1117',
      foreground: '#d6deeb',
    },
  } as unknown as ConstructorParameters<typeof Terminal>[0])
  const serializeAddon = new SerializeAddon()
  term.loadAddon(serializeAddon)
  return { serializeAddon, term }
}
function writeTerminal(term: Terminal, text: string) {
  return new Promise<void>((resolve) => {
    term.write(text, () => resolve())
  })
}

function chunkToString(chunk: unknown, encoding?: BufferEncoding) {
  if (typeof chunk === 'string')
    return chunk
  if (chunk instanceof Uint8Array)
    return Buffer.from(chunk).toString(encoding || 'utf8')
  return String(chunk ?? '')
}

export function queryTerminalPixelSize(timeoutMs = TERMINAL_PIXEL_SIZE_TIMEOUT_MS): Promise<TerminalPixelSize | undefined> {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== 'function')
    return Promise.resolve(undefined)

  return new Promise((resolve) => {
    let settled = false
    let response = ''
    const wasPaused = stdin.isPaused()
    const wasRaw = stdin.isRaw
    const timer = setTimeout(() => cleanup(undefined), timeoutMs)
    timer.unref?.()

    function cleanup(size: TerminalPixelSize | undefined) {
      if (settled)
        return

      settled = true
      clearTimeout(timer)
      stdin.off('data', onData)
      try {
        if (!wasRaw)
          stdin.setRawMode(false)
        if (wasPaused)
          stdin.pause()
      }
      catch {}
      resolve(size)
    }

    function onData(chunk: Buffer | string) {
      response += chunkToString(chunk)
      const size = parseTerminalPixelSizeResponse(response)
      if (size)
        cleanup(size)
    }

    try {
      stdin.setRawMode(true)
      stdin.resume()
      stdin.on('data', onData)
      stdout.write(XTERM_REPORT_TEXT_AREA_SIZE)
    }
    catch {
      cleanup(undefined)
    }
  })
}

function visibleTerminalText(term: Terminal) {
  const lines: string[] = []
  const buffer = term.buffer.active
  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i)
    const text = line?.translateToString(true) ?? ''
    if (line?.isWrapped && lines.length > 0) {
      lines[lines.length - 1] += text
      continue
    }
    lines.push(text)
  }

  while (lines.length > 0 && lines[lines.length - 1] === '')
    lines.pop()

  return lines.join('\n')
}

function extractHtmlFragment(html: string) {
  const startMarker = '<!--StartFragment-->'
  const endMarker = '<!--EndFragment-->'
  const start = html.indexOf(startMarker)
  const end = html.indexOf(endMarker)
  if (start === -1 || end === -1 || end <= start)
    return html

  return html.slice(start + startMarker.length, end)
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function renderRedactedTerminalFrame(rawAnsi: string, cols = DEFAULT_COLS, rows = DEFAULT_ROWS, terminalPixelSize?: TerminalPixelSize): Promise<TerminalReplayFrame> {
  const normalizedTerminal = createTerminal(cols, rows)
  await writeTerminal(normalizedTerminal.term, rawAnsi)
  const text = redactSecrets(visibleTerminalText(normalizedTerminal.term))
  normalizedTerminal.term.dispose()

  const { serializeAddon, term } = createTerminal(cols, rows)
  await writeTerminal(term, text)
  const html = extractHtmlFragment(serializeAddon.serializeAsHTML({ includeGlobalBackground: true, scrollback: 0 }))
  const viewport = getReplayViewportSize(cols, rows, terminalPixelSize)
  term.dispose()
  return { height: viewport.height, html, text, width: viewport.width }
}

export async function renderRedactedTerminalText(rawAnsi: string, cols = DEFAULT_COLS, rows = DEFAULT_ROWS) {
  return (await renderRedactedTerminalFrame(rawAnsi, cols, rows)).text
}

async function patchRrwebGlobals<T>(window: Window, document: HappyDocument, task: () => T | Promise<T>) {
  const globalObject = globalThis as unknown as Record<string, unknown>
  const windowObject = window as unknown as Record<string, unknown>
  const patchedEntries: Array<[string, PropertyDescriptor | undefined]> = []
  const patchGlobal = (key: string, value: unknown) => {
    const previousDescriptor = Object.getOwnPropertyDescriptor(globalObject, key)
    patchedEntries.push([key, previousDescriptor])
    Object.defineProperty(globalObject, key, {
      configurable: true,
      enumerable: previousDescriptor?.enumerable ?? true,
      value,
      writable: true,
    })
  }

  for (const [key, value] of Object.entries(windowObject)) {
    if (typeof value !== 'function' || !/^(HTML|SVG|CSS|Node|Document|Element|Text|CharacterData|Comment|ShadowRoot|MutationObserver|XML)/.test(key))
      continue

    patchGlobal(key, value)
  }

  for (const [key, value] of [
    ['document', document],
    ['window', window],
    ['navigator', window.navigator],
  ] as const)
    patchGlobal(key, value)

  try {
    return await task()
  }
  finally {
    for (const [key, previousDescriptor] of patchedEntries.reverse()) {
      if (previousDescriptor)
        Object.defineProperty(globalObject, key, previousDescriptor)
      else delete globalObject[key]
    }
  }
}

function findSerializedNodeId(node: serializedNodeWithId, tagName: string): number | undefined {
  const candidate = node as unknown as { childNodes?: serializedNodeWithId[], id?: number, tagName?: string }
  if (candidate.tagName === tagName && typeof candidate.id === 'number')
    return candidate.id

  for (const child of candidate.childNodes || []) {
    const id = findSerializedNodeId(child, tagName)
    if (id !== undefined)
      return id
  }

  return undefined
}
function findSerializedNodeIdByAttribute(node: serializedNodeWithId, attribute: string, value: string): number | undefined {
  const candidate = node as unknown as { attributes?: Record<string, unknown>, childNodes?: serializedNodeWithId[], id?: number }
  if (candidate.attributes?.[attribute] === value && typeof candidate.id === 'number')
    return candidate.id

  for (const child of candidate.childNodes || []) {
    const id = findSerializedNodeIdByAttribute(child, attribute, value)
    if (id !== undefined)
      return id
  }

  return undefined
}

function normalizeTerminalFrame(frame: TerminalReplayFrame | string): TerminalReplayFrame {
  if (typeof frame === 'string') {
    const viewport = getReplayViewportSize()
    return {
      height: viewport.height,
      html: `<pre>${escapeHtml(frame)}</pre>`,
      text: frame,
      width: viewport.width,
    }
  }
  return frame
}

function buildTerminalImageDataUrl(frame: TerminalReplayFrame) {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}">`,
    `<rect width="${frame.width}" height="${frame.height}" fill="#0d1117"/>`,
    `<foreignObject width="${frame.width}" height="${frame.height}">`,
    '<div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:100%;height:100%;padding:16px;background:#0d1117;color:#d6deeb;overflow:hidden;font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">',
    frame.html,
    '</div></foreignObject></svg>',
  ].join('')

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

export async function createTerminalSnapshot(frameInput: TerminalReplayFrame | string, options: { ariaLabel?: string, currentUrl?: string } = {}): Promise<TerminalSnapshot> {
  const frame = normalizeTerminalFrame(frameInput)
  const window = new Window({ url: options.currentUrl || DEFAULT_REPLAY_CURRENT_URL })
  const document = window.document as HappyDocument

  document.documentElement.setAttribute('style', 'margin:0;min-height:100%;background:#0d1117;color:#d6deeb;')
  document.body.setAttribute('style', 'margin:0;min-height:100%;background:#0d1117;color:#d6deeb;')

  const terminal = document.createElement('div')
  terminal.setAttribute('aria-label', options.ariaLabel || 'Capgo terminal replay')
  terminal.setAttribute('aria-multiline', 'true')
  terminal.setAttribute('data-capgo-terminal', 'true')
  terminal.setAttribute('role', 'textbox')
  terminal.setAttribute('style', [
    'box-sizing:border-box',
    'width:100vw',
    'min-height:100vh',
    'margin:0',
    'padding:0',
    'background:#0d1117',
    'color:#d6deeb',
    'overflow:hidden',
  ].join(';'))

  const terminalImage = document.createElement('img')
  terminalImage.setAttribute('alt', frame.text)
  terminalImage.setAttribute('src', buildTerminalImageDataUrl(frame))
  terminalImage.setAttribute('style', [
    'display:block',
    'width:100%',
    'height:100vh',
    'object-fit:contain',
    'object-position:top left',
    'background:#0d1117',
  ].join(';'))
  terminal.appendChild(terminalImage)
  document.body.appendChild(terminal)

  const node = await patchRrwebGlobals(window, document, () => snapshot(document as unknown as Document, {
    blockClass: 'ph-no-capture',
    inlineStylesheet: false,
    maskTextClass: 'ph-mask',
    preserveWhiteSpace: true,
  }))

  if (!node)
    throw new Error('Could not serialize init replay snapshot')

  return {
    node,
    terminalNodeId: findSerializedNodeIdByAttribute(node, 'data-capgo-terminal', 'true') || findSerializedNodeId(node, 'div') || node.id,
  }
}

export async function createTerminalSnapshotNode(frame: TerminalReplayFrame | string): Promise<serializedNodeWithId> {
  return (await createTerminalSnapshot(frame)).node
}
export function createTerminalInteractionEvents(input: {
  terminalNodeId: number
  text: string
  timestamp: number
}): eventWithTime[] {
  const clickEventWithTime = {
    data: {
      id: input.terminalNodeId,
      pointerType: PointerTypes.Mouse,
      source: IncrementalSource.MouseInteraction,
      type: MouseInteractions.Click,
      x: 24,
      y: 24,
    },
    timestamp: input.timestamp,
    type: EventType.IncrementalSnapshot,
  } satisfies incrementalSnapshotEvent & { timestamp: number }

  const inputEventWithTime = {
    data: {
      id: input.terminalNodeId,
      isChecked: false,
      source: IncrementalSource.Input,
      text: input.text,
      userTriggered: true,
    },
    timestamp: input.timestamp + 1,
    type: EventType.IncrementalSnapshot,
  } satisfies incrementalSnapshotEvent & { timestamp: number }

  return [clickEventWithTime, inputEventWithTime]
}


export function buildInitReplayBody(input: {
  currentUrl?: string
  events: eventWithTime[]
  identity?: InitReplayIdentity
  sessionId: string
  timestamp: string
  token: string
  windowId: string
}): InitReplaySnapshotBody {
  const distinctId = input.identity?.distinctId || `cli:${input.sessionId}`
  return {
    api_key: input.token,
    distinct_id: distinctId,
    event: '$snapshot',
    properties: {
      $current_url: input.currentUrl || DEFAULT_REPLAY_CURRENT_URL,
      $lib: '@capgo/cli',
      $lib_version: pack.version,
      $session_id: input.sessionId,
      ...(input.identity?.email ? { $set: { email: input.identity.email } } : {}),
      $snapshot_bytes: Buffer.byteLength(JSON.stringify(input.events)),
      $snapshot_data: input.events,
      $snapshot_source: 'web',
      $window_id: input.windowId,
      distinct_id: distinctId,
      token: input.token,
      ...(input.identity?.userId ? { user_id: input.identity.userId } : {}),
    },
    timestamp: input.timestamp,
  }
}

const defaultReplayTransport: InitReplayTransport = async (url, body, signal) => {
  try {
    const response = await fetch(url, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal,
    })
    return response.ok
  }
  catch {
    return false
  }
}

class InitReplayRecorder implements InitReplayController {
  readonly sessionId: string
  private readonly pendingSends = new Set<Promise<boolean>>()
  private readonly restoreWrites: Array<() => void> = []
  private readonly serializeAddon: SerializeAddon
  private readonly term: Terminal
  private captureTimer: NodeJS.Timeout | undefined
  private disposed = false
  private hasSentMeta = false
  private lastSnapshotText = ''
  private pendingTerminalWrite = Promise.resolve()
  private resolvedTerminalPixelSize: TerminalPixelSize | undefined
  private readonly windowId = `cli-${randomUUID()}`

  constructor(
    private readonly token: string,
    private readonly replayUrl: string,
    private readonly transport: InitReplayTransport,
    private readonly identity: Promise<InitReplayIdentity | undefined>,
    private readonly currentUrl: string,
    private readonly ariaLabel: string | undefined,
    private readonly cols: number,
    private readonly rows: number,
    private readonly throttleMs: number,
    private readonly terminalPixelSize: Promise<TerminalPixelSize | undefined>,
    sessionPrefix: string,
  ) {
    this.sessionId = `${sessionPrefix}-${randomUUID()}`
    const { serializeAddon, term } = createTerminal(cols, rows)
    this.serializeAddon = serializeAddon
    this.term = term
    this.patchStream(stdout)
    this.patchStream(stderr)
    stdout.on('resize', this.resize)
    activeReplayFinish = () => this.finish()
    activeReplaySessionId = this.sessionId
  }
  async finish() {
    if (this.disposed)
      return

    this.disposed = true
    if (this.captureTimer) {
      clearTimeout(this.captureTimer)
      this.captureTimer = undefined
    }

    await this.captureFrame(true).catch(() => {})
    this.restore()

    const inFlight = [...this.pendingSends]
    if (inFlight.length > 0) {
      await Promise.race([
        Promise.allSettled(inFlight),
        new Promise(resolve => setTimeout(resolve, REPLAY_FLUSH_TIMEOUT_MS)),
      ])
    }
    this.term.dispose()
    if (activeReplaySessionId === this.sessionId) {
      activeReplayFinish = undefined
      activeReplaySessionId = undefined
    }
  }

  private patchStream(stream: CliStream) {
    const originalWrite = stream.write
    ;(stream as unknown as { write: (...args: unknown[]) => boolean }).write = (...args: unknown[]) => {
      this.recordOutput(args[0], typeof args[1] === 'string' ? args[1] as BufferEncoding : undefined)
      return (originalWrite as (...writeArgs: unknown[]) => boolean).apply(stream, args)
    }
    this.restoreWrites.push(() => {
      stream.write = originalWrite as StreamWrite
    })
  }

  private readonly resize = () => {
    if (this.disposed)
      return

    this.term.resize(stdout.columns || this.cols, stdout.rows || this.rows)
    this.scheduleCapture()
  }

  private recordOutput(chunk: unknown, encoding?: BufferEncoding) {
    if (this.disposed)
      return

    const text = chunkToString(chunk, encoding)
    if (!text)
      return

    this.pendingTerminalWrite = this.pendingTerminalWrite.then(() => writeTerminal(this.term, text)).catch(() => {})
    this.scheduleCapture()
  }

  private scheduleCapture() {
    if (this.captureTimer || this.disposed)
      return

    this.captureTimer = setTimeout(() => {
      this.captureTimer = undefined
      void this.captureFrame(false).catch(() => {})
    }, this.throttleMs)
    this.captureTimer.unref?.()
  }

  private async captureFrame(force: boolean) {
    if (this.pendingSends.size > 5 && !force)
      return
    await this.pendingTerminalWrite

    const rawAnsi = this.serializeAddon.serialize({ scrollback: 0 })
    const terminalPixelSize = await this.resolveTerminalPixelSize()
    const frame = await renderRedactedTerminalFrame(rawAnsi, stdout.columns || this.cols, stdout.rows || this.rows, terminalPixelSize)
    if (!frame.text || (!force && frame.text === this.lastSnapshotText))
      return

    this.lastSnapshotText = frame.text
    const timestamp = Date.now()
    const viewport = getReplayViewportSize(stdout.columns || this.cols, stdout.rows || this.rows, terminalPixelSize)
    const events: eventWithTime[] = []

    if (!this.hasSentMeta) {
      const metaEventWithTime = {
        data: {
          height: viewport.height,
          href: this.currentUrl,
          width: viewport.width,
        },
        timestamp,
        type: EventType.Meta,
      } satisfies metaEvent & { timestamp: number }
      events.push(metaEventWithTime)
      this.hasSentMeta = true
    }

    const terminalSnapshot = await createTerminalSnapshot(frame, { ariaLabel: this.ariaLabel, currentUrl: this.currentUrl })
    const snapshotEventWithTime = {
      data: {
        initialOffset: { left: 0, top: 0 },
        node: terminalSnapshot.node,
      },
      timestamp,
      type: EventType.FullSnapshot,
    } satisfies fullSnapshotEvent & { timestamp: number }
    events.push(snapshotEventWithTime)

    events.push(...createTerminalInteractionEvents({
      terminalNodeId: terminalSnapshot.terminalNodeId,
      text: frame.text,
      timestamp: timestamp + 1,
    }))

    const identity = await this.identity
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REPLAY_FLUSH_TIMEOUT_MS)
    timeout.unref?.()
    const body = buildInitReplayBody({
      currentUrl: this.currentUrl,
      events,
      identity,
      sessionId: this.sessionId,
      timestamp: new Date(timestamp).toISOString(),
      token: this.token,
      windowId: this.windowId,
    })
    const pending = this.transport(this.replayUrl, body, controller.signal)
      .catch(() => false)
      .finally(() => {
        clearTimeout(timeout)
        this.pendingSends.delete(pending)
      })
    this.pendingSends.add(pending)
  }

  private async resolveTerminalPixelSize() {
    if (this.resolvedTerminalPixelSize)
      return this.resolvedTerminalPixelSize

    this.resolvedTerminalPixelSize = await this.terminalPixelSize.catch(() => undefined)
    return this.resolvedTerminalPixelSize
  }

  private restore() {
    stdout.off('resize', this.resize)
    while (this.restoreWrites.length > 0)
      this.restoreWrites.pop()?.()
  }
}

export function startInitReplay(options: StartInitReplayOptions = {}): InitReplayController | undefined {
  const token = options.posthogToken?.trim() || getPosthogToken()
  const shouldStart = shouldStartInitReplay({
    analyticsEnabled: options.analyticsEnabled,
    apikey: options.apikey,
    isCi: isCI,
    posthogToken: token,
    stdinIsTTY: Boolean(stdin.isTTY),
    stdoutIsTTY: Boolean(stdout.isTTY),
    telemetryDisabled: isCliTelemetryDisabled(),
  })

  if (!shouldStart || !token)
    return undefined

  const replayUrl = resolvePosthogReplayUrl(options.replayUrl)
  if (!replayUrl)
    return undefined

  try {
    const apikey = options.apikey?.trim() || ''
    const currentUrl = options.currentUrl?.trim() || DEFAULT_REPLAY_CURRENT_URL
    const sessionPrefix = options.sessionPrefix?.trim() || DEFAULT_REPLAY_SESSION_PREFIX
    const identityResolver = options.identityResolver || resolveInitReplayIdentity
    const identityPromise = options.identity
      ? Promise.resolve(options.identity)
      : withTimeout(signal => identityResolver(apikey, signal), REPLAY_IDENTITY_TIMEOUT_MS)
    const terminalPixelSize = options.terminalPixelSize
      ? Promise.resolve(options.terminalPixelSize)
      : queryTerminalPixelSize()

    return new InitReplayRecorder(
      token,
      replayUrl,
      options.transport || defaultReplayTransport,
      identityPromise,
      currentUrl,
      options.ariaLabel,
      options.cols || stdout.columns || DEFAULT_COLS,
      options.rows || stdout.rows || DEFAULT_ROWS,
      options.throttleMs || REPLAY_FRAME_THROTTLE_MS,
      terminalPixelSize,
      sessionPrefix,
    )
  }
  catch {
    return undefined
  }
}
