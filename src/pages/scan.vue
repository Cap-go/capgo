<script setup lang="ts">
import type { HttpResponse, PluginListenerHandle } from '@capacitor/core'
import type { BarcodeScanErrorEvent, BarcodeScannedEvent, BarcodeScannerOptions } from '@capgo/camera-preview'
import type { DownloadEvent, DownloadOptions, StartPreviewSessionOptions } from '@capgo/capacitor-updater'
import type { PreviewDeepLink } from '~/services/previewLinks'
import { Clipboard } from '@capacitor/clipboard'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { CameraPreview } from '@capgo/camera-preview'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconDownload from '~icons/heroicons/arrow-down-tray-20-solid'
import IconArrowLeft from '~icons/heroicons/arrow-left-20-solid'
import IconArrowPath from '~icons/heroicons/arrow-path-20-solid'
import IconClipboard from '~icons/heroicons/clipboard-document-20-solid'
import IconLink from '~icons/heroicons/link-20-solid'
import IconQrCode from '~icons/heroicons/qr-code-20-solid'
import { buildChannelPreviewLatestOptions, parsePreviewDeepLink } from '~/services/previewLinks'
import { useDisplayStore } from '~/stores/display'
import { buildChannelPreviewSubdomain, buildPreviewSubdomain, parsePreviewHostname } from '../../shared/preview-subdomain.ts'

const route = useRoute()
const router = useRouter()
const displayStore = useDisplayStore()

const isNativePlatform = Capacitor.isNativePlatform()
const isScanning = ref(false)
const isLoading = ref(false)
const downloadProgress = ref(0)
const scannedUrl = ref('')
const errorMessage = ref('')
const manualUrl = ref('')
const statusMessage = ref('')
const scannerFrameRef = ref<HTMLElement | null>(null)
const debugMessages = ref<string[]>([])

let downloadListener: Awaited<ReturnType<typeof CapacitorUpdater.addListener>> | null = null
let barcodeScannedListener: PluginListenerHandle | null = null
let barcodeScanErrorListener: PluginListenerHandle | null = null
let cameraPreviewStarted = false
let isHandlingBarcode = false
let barcodeWatchdogTimer: ReturnType<typeof setTimeout> | null = null

interface PreviewPayload {
  appId?: string
  version?: string
  url?: string
  checksum?: string | null
  sessionKey?: string | null
  manifest?: DownloadOptions['manifest']
}

interface PreviewHostTarget {
  appId: string
  channelId?: number
  payloadUrl: string
  rootUrl: string
  versionId?: number
}

interface PreviewFetchResult {
  bytes: Uint8Array
  contentType: string
  status: number
  url: string
}

interface PreviewPayloadFetchResult {
  payload: PreviewPayload
  sessionPayloadUrl?: string
}

const PREVIEW_ASSET_LIMIT = 500
const PREVIEW_PAYLOAD_PATH = '/.capgo/preview.json'
const PREVIEW_DOWNLOAD_PLACEHOLDER_URL = 'https://404.capgo.app/no.zip'
const TEXT_ASSET_EXTENSIONS = new Set([
  'css',
  'html',
  'htm',
  'js',
  'json',
  'mjs',
  'svg',
  'txt',
  'webmanifest',
  'xml',
])

function formatDebugData(data: unknown) {
  try {
    if (data instanceof Error)
      return data.message || data.stack || String(data)

    const serialized = typeof data === 'string' ? data : JSON.stringify(data)
    return serialized.length > 1200 ? `${serialized.slice(0, 1200)}...` : serialized
  }
  catch {
    return String(data)
  }
}

function debugLog(message: string, data?: unknown) {
  const line = data === undefined ? message : `${message}: ${formatDebugData(data)}`
  debugMessages.value = [`${new Date().toISOString().slice(11, 19)} ${line}`, ...debugMessages.value].slice(0, 80)

  if (data === undefined)
    console.log('[PreviewScan]', message)
  else
    console.log('[PreviewScan]', message, data)
}

function debugWarn(message: string, data?: unknown) {
  debugLog(message, data)

  if (data === undefined)
    console.warn('[PreviewScan]', message)
  else
    console.warn('[PreviewScan]', message, data)
}

async function copyDebugLogs() {
  if (!debugMessages.value.length)
    return

  const logs = debugMessages.value.slice().reverse().join('\n')
  try {
    await Clipboard.write({ string: logs })
    toast.success('Debug logs copied')
  }
  catch (error) {
    debugWarn('failed to copy debug logs with native clipboard', error)
    try {
      await navigator.clipboard.writeText(logs)
      toast.success('Debug logs copied')
    }
    catch (clipboardError) {
      debugWarn('failed to copy debug logs with browser clipboard', clipboardError)
      toast.error('Failed to copy debug logs')
    }
  }
}

function parseSafeUrl(value: string) {
  try {
    return new URL(value.trim())
  }
  catch {
    return null
  }
}

function isHttpUrl(value: string) {
  if (!value)
    return false

  const parsedUrl = parseSafeUrl(value)
  return parsedUrl?.protocol === 'https:' || parsedUrl?.protocol === 'http:'
}

function previewHostTargetFromUrl(value: string): PreviewHostTarget | null {
  const parsedUrl = parseSafeUrl(value)
  if (!parsedUrl || (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:'))
    return null

  const parsedHost = parsePreviewHostname(parsedUrl.hostname)
  if (!parsedHost)
    return null

  return {
    ...parsedHost,
    payloadUrl: new URL(PREVIEW_PAYLOAD_PATH, parsedUrl.origin).toString(),
    rootUrl: new URL('/', parsedUrl.origin).toString(),
  }
}

function previewStartUrlFromUrl(value: string) {
  return previewHostTargetFromUrl(value)?.rootUrl ?? ''
}

function previewRootUrlFromChannelLink(previewLink: Extract<PreviewDeepLink, { type: 'channel' }>) {
  if (typeof previewLink.channelId !== 'number')
    return ''

  try {
    const subdomain = buildChannelPreviewSubdomain(previewLink.appId, previewLink.channelId)
    return `https://${subdomain}.preview.capgo.app/`
  }
  catch {
    return ''
  }
}

function previewRootUrlFromBundleLink(previewLink: Extract<PreviewDeepLink, { type: 'bundle' }>) {
  if (!previewLink.appId || typeof previewLink.versionId !== 'number')
    return ''

  try {
    const subdomain = buildPreviewSubdomain(previewLink.appId, previewLink.versionId)
    return `https://${subdomain}.preview.capgo.app/`
  }
  catch {
    return ''
  }
}

function base64ToBytes(value: string) {
  const binary = atob(value.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function responseDataToBytes(data: unknown) {
  if (data instanceof Uint8Array)
    return data
  if (data instanceof ArrayBuffer)
    return new Uint8Array(data)
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  if (data instanceof Blob)
    return new Uint8Array(await data.arrayBuffer())
  if (typeof data === 'string')
    return base64ToBytes(data)

  throw new Error('Preview asset response is not binary data')
}

function responseHeader(headers: Record<string, string> | Headers, name: string) {
  if (headers instanceof Headers)
    return headers.get(name) ?? ''

  const lowerName = name.toLowerCase()
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === lowerName)
  return entry?.[1] ?? ''
}

async function fetchPreviewBytes(url: string): Promise<PreviewFetchResult> {
  if (isNativePlatform) {
    const response = await CapacitorHttp.get({
      headers: { Accept: '*/*' },
      responseType: 'arraybuffer',
      url,
    })
    const bytes = response.status >= 200 && response.status < 300
      ? await responseDataToBytes(response.data)
      : new Uint8Array()
    return {
      bytes,
      contentType: responseHeader(response.headers, 'content-type'),
      status: response.status,
      url: response.url || url,
    }
  }

  const response = await fetch(url, { headers: { Accept: '*/*' } })
  return {
    bytes: response.ok ? new Uint8Array(await response.arrayBuffer()) : new Uint8Array(),
    contentType: response.headers.get('content-type') ?? '',
    status: response.status,
    url: response.url,
  }
}

async function sha256Hex(bytes: Uint8Array) {
  if (!crypto.subtle)
    throw new Error('SHA-256 is not available in this WebView')

  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function isTextPreviewAsset(fileName: string, contentType: string) {
  const cleanContentType = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (cleanContentType.startsWith('text/'))
    return true
  if (cleanContentType.includes('javascript') || cleanContentType.includes('json') || cleanContentType.includes('xml') || cleanContentType.includes('svg'))
    return true

  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return TEXT_ASSET_EXTENSIONS.has(extension)
}

function normalizePreviewAssetUrl(rawValue: string, baseUrl: string, rootUrl: string) {
  const value = rawValue.trim()
  if (!value || value.startsWith('#'))
    return ''
  if (value.includes('${') || value.includes('%24%7B') || value.includes('%24%7b'))
    return ''

  try {
    const base = new URL(baseUrl)
    const url = value.startsWith('//')
      ? new URL(`${base.protocol}${value}`)
      : new URL(value, baseUrl)
    const root = new URL(rootUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:')
      return ''
    if (url.origin !== root.origin)
      return ''
    if (url.pathname === PREVIEW_PAYLOAD_PATH)
      return ''

    url.hash = ''
    return url.toString()
  }
  catch {
    return ''
  }
}

function previewFileNameFromUrl(value: string, rootUrl: string) {
  const url = new URL(value)
  const root = new URL(rootUrl)
  if (url.origin !== root.origin)
    return ''

  if (url.pathname === '/' || url.pathname === '')
    return 'index.html'

  const fileName = decodeURIComponent(url.pathname).replace(/^\/+/, '')
  if (!fileName || fileName.endsWith('/'))
    return ''

  return fileName
}

function previewDownloadUrlForFile(fileName: string, rootUrl: string) {
  if (fileName === 'index.html')
    return new URL('/index.html', rootUrl).toString()
  return new URL(`/${fileName}`, rootUrl).toString()
}

function extractPreviewAssetUrls(text: string, baseUrl: string, rootUrl: string) {
  const urls = new Set<string>()
  const add = (rawValue: string) => {
    const normalized = normalizePreviewAssetUrl(rawValue, baseUrl, rootUrl)
    if (normalized)
      urls.add(normalized)
  }

  for (const match of text.matchAll(/\b(?:href|src|poster|data-href|data-src)\s*=\s*["']([^"']+)["']/gi))
    add(match[1])

  for (const match of text.matchAll(/url\(([^)]{1,2048})\)/gi))
    add(match[1].trim().replace(/^['"]|['"]$/g, ''))

  for (const match of text.matchAll(/\b(?:from|import)\s*(?:\(\s*)?["']([^"']+)["']/gi))
    add(match[1])

  for (const match of text.matchAll(/["'`]((?:\/|\.\.?\/)?(?:assets|fonts|images|img|static)\/[^"'`)\s?#]+(?:\?[^"'`)\s#]+)?)/gi))
    add(match[1])

  return [...urls]
}

function previewVersionFromHostTarget(target: PreviewHostTarget) {
  if (typeof target.versionId === 'number')
    return `preview-${target.versionId}`
  if (typeof target.channelId === 'number')
    return `preview-channel-${target.channelId}-${Date.now()}`
  return `preview-${Date.now()}`
}

async function buildPreviewPayloadFromHost(target: PreviewHostTarget): Promise<PreviewPayload> {
  const firstUrl = previewDownloadUrlForFile('index.html', target.rootUrl)
  const queuedUrls = new Set([firstUrl])
  const queue = [firstUrl]
  const manifest: NonNullable<DownloadOptions['manifest']> = []
  const collectedFiles = new Set<string>()

  debugLog('building preview payload from host', {
    appId: target.appId,
    channelId: target.channelId,
    rootUrl: target.rootUrl,
    versionId: target.versionId,
  })

  while (queue.length) {
    if (manifest.length >= PREVIEW_ASSET_LIMIT)
      throw new Error(`Preview has more than ${PREVIEW_ASSET_LIMIT} linked files`)

    const assetUrl = queue.shift() as string
    const fileName = previewFileNameFromUrl(assetUrl, target.rootUrl)
    if (!fileName || collectedFiles.has(fileName))
      continue

    const downloadUrl = previewDownloadUrlForFile(fileName, target.rootUrl)
    statusMessage.value = `Preparing preview files (${manifest.length + 1})`
    const response = await fetchPreviewBytes(downloadUrl)
    if (response.status < 200 || response.status >= 300)
      throw new Error(`Failed to fetch preview file ${fileName}: HTTP ${response.status}`)

    const fileHash = await sha256Hex(response.bytes)
    manifest.push({
      download_url: downloadUrl,
      file_hash: fileHash,
      file_name: fileName,
    })
    collectedFiles.add(fileName)
    debugLog('preview file prepared', {
      bytes: response.bytes.byteLength,
      contentType: response.contentType,
      fileName,
    })

    if (!isTextPreviewAsset(fileName, response.contentType))
      continue

    const text = new TextDecoder().decode(response.bytes)
    for (const discoveredUrl of extractPreviewAssetUrls(text, downloadUrl, target.rootUrl)) {
      const discoveredFileName = previewFileNameFromUrl(discoveredUrl, target.rootUrl)
      if (discoveredFileName && !collectedFiles.has(discoveredFileName) && !queuedUrls.has(discoveredUrl)) {
        queuedUrls.add(discoveredUrl)
        queue.push(discoveredUrl)
      }
    }
  }

  if (!collectedFiles.has('index.html'))
    throw new Error('Preview did not expose an index.html file')

  const version = previewVersionFromHostTarget(target)
  debugLog('preview host payload built', {
    files: manifest.length,
    version,
  })

  return {
    appId: target.appId,
    manifest,
    url: PREVIEW_DOWNLOAD_PLACEHOLDER_URL,
    version,
  }
}

const progressPercentage = computed(() => Math.round(downloadProgress.value))
const trimmedManualUrl = computed(() => manualUrl.value.trim())
const manualPreviewLink = computed(() => parsePreviewDeepLink(trimmedManualUrl.value))
const normalizedManualUrl = computed(() => {
  const value = trimmedManualUrl.value
  if (!value)
    return ''

  if (manualPreviewLink.value)
    return value

  return /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`
})
const manualPreviewStartUrl = computed(() => previewStartUrlFromUrl(normalizedManualUrl.value))
const canSubmitManualUrl = computed(() => !isLoading.value && (!!manualPreviewLink.value || !!manualPreviewStartUrl.value || isHttpUrl(normalizedManualUrl.value)))
const manualActionLabel = computed(() => {
  if (manualPreviewLink.value || manualPreviewStartUrl.value)
    return 'Start preview'
  return isNativePlatform ? 'Download update' : 'Open update URL'
})
const scannerStatusLabel = computed(() => {
  if (isLoading.value)
    return 'Applying update'
  if (isScanning.value)
    return 'Camera active'
  return 'Ready'
})
const scannerTitle = computed(() => {
  if (isLoading.value)
    return 'Applying preview'
  if (isScanning.value)
    return 'Camera active'
  return 'Ready to scan'
})
const downloadHost = computed(() => {
  if (!scannedUrl.value || !isHttpUrl(scannedUrl.value))
    return ''

  return new URL(scannedUrl.value).host
})

onMounted(async () => {
  displayStore.NavTitle = 'Test preview'
  displayStore.defaultBack = '/login'
  debugLog('scan page mounted', { isNativePlatform, previewQuery: route.query.preview })

  const previewLink = Array.isArray(route.query.preview) ? route.query.preview[0] : route.query.preview
  if (previewLink) {
    debugLog('handling preview query parameter', previewLink)
    await handleBarcodeScan(previewLink)
    return
  }

  if (!isNativePlatform) {
    debugLog('native scanner unavailable on web platform')
    statusMessage.value = 'Live camera scanning is available in the iOS and Android app. Paste a preview link or bundle URL below.'
  }
})

onUnmounted(async () => {
  debugLog('scan page unmounting')
  await stopScanner(true)
  await removeDownloadListener()
})

async function removeDownloadListener() {
  if (!downloadListener)
    return

  debugLog('removing download listener')
  await downloadListener.remove()
  downloadListener = null
}

async function removeScannerListeners() {
  if (barcodeScannedListener || barcodeScanErrorListener)
    debugLog('removing barcode listeners')

  await barcodeScannedListener?.remove()
  await barcodeScanErrorListener?.remove()
  barcodeScannedListener = null
  barcodeScanErrorListener = null
}

function clearBarcodeWatchdog() {
  if (!barcodeWatchdogTimer)
    return

  clearTimeout(barcodeWatchdogTimer)
  barcodeWatchdogTimer = null
}

function startBarcodeWatchdog(startResult: unknown) {
  clearBarcodeWatchdog()
  barcodeWatchdogTimer = setTimeout(async () => {
    barcodeWatchdogTimer = null

    if (!isScanning.value || isHandlingBarcode)
      return

    let previewSize: unknown
    try {
      previewSize = await CameraPreview.getPreviewSize()
    }
    catch (error) {
      previewSize = formatDebugData(error)
    }

    debugLog('barcode scanner still waiting for QR', {
      diagnostics: getScannerDiagnostics(),
      previewSize,
      startResult,
    })
  }, 2500)
}

function getScannerDiagnostics() {
  const rect = scannerFrameRef.value?.getBoundingClientRect()
  const visualViewport = window.visualViewport

  return {
    cameraPreviewStarted,
    devicePixelRatio: window.devicePixelRatio,
    documentVisibility: document.visibilityState,
    frame: rect
      ? {
          height: Math.round(rect.height),
          width: Math.round(rect.width),
          x: Math.round(rect.left),
          y: Math.round(rect.top),
        }
      : null,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    isHandlingBarcode,
    isScanning: isScanning.value,
    scrollY: Math.round(window.scrollY),
    visualViewport: visualViewport
      ? {
          height: Math.round(visualViewport.height),
          offsetTop: Math.round(visualViewport.offsetTop),
          width: Math.round(visualViewport.width),
        }
      : null,
  }
}

function setCameraPreviewActive(active: boolean) {
  document.documentElement.classList.toggle('camera-preview-active', active)
  document.body.classList.toggle('camera-preview-active', active)
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function getScannerFrame() {
  const frame = scannerFrameRef.value
  if (!frame)
    throw new Error('Scanner frame is not ready')

  const rect = frame.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1)
    throw new Error('Scanner frame is not visible')

  return {
    height: Math.round(rect.height),
    width: Math.round(rect.width),
    x: Math.round(rect.left),
    y: Math.round(rect.top),
  }
}

async function stopScanner(force = false) {
  debugLog('stopScanner called', { cameraPreviewStarted, force, isScanning: isScanning.value })
  clearBarcodeWatchdog()

  if (!cameraPreviewStarted && !force) {
    isScanning.value = false
    isHandlingBarcode = false
    setCameraPreviewActive(false)
    await removeScannerListeners()
    debugLog('scanner stopped without native stop')
    return
  }

  try {
    await CameraPreview.stopBarcodeScanner()
    debugLog('native barcode scanner stopped')
  }
  catch (error) {
    debugWarn('failed to stop barcode scanner', error)
  }

  try {
    await CameraPreview.stop({ force: true })
    debugLog('camera preview stopped')
  }
  catch (error) {
    debugWarn('failed to stop camera preview', error)
  }

  cameraPreviewStarted = false
  isScanning.value = false
  isHandlingBarcode = false
  setCameraPreviewActive(false)
  await removeScannerListeners()
  debugLog('scanner state cleared')
}

async function startScanner() {
  if (!isNativePlatform) {
    debugLog('startScanner ignored on web platform')
    statusMessage.value = 'Live camera scanning is available in the iOS and Android app. Paste a preview link or bundle URL below.'
    return
  }

  if (isScanning.value || isLoading.value) {
    debugLog('startScanner ignored because scanner is busy', { isScanning: isScanning.value, isLoading: isLoading.value })
    return
  }

  try {
    debugLog('starting scanner')
    isScanning.value = true
    isHandlingBarcode = false
    errorMessage.value = ''
    statusMessage.value = ''
    scannedUrl.value = ''
    manualUrl.value = ''

    await nextTick()
    const frame = getScannerFrame()
    debugLog('scanner frame measured', frame)

    await removeScannerListeners()
    barcodeScannedListener = await CameraPreview.addListener('barcodeScanned', async ({ barcodes }: BarcodeScannedEvent) => {
      clearBarcodeWatchdog()
      debugLog('barcodeScanned event received', {
        count: barcodes.length,
        values: barcodes.map(barcode => ({
          displayValue: barcode.displayValue,
          format: barcode.format,
          value: barcode.value,
        })),
      })

      if (isHandlingBarcode)
        return

      const barcode = barcodes.find(result => result.value)
      if (!barcode) {
        debugLog('barcode event did not contain a value')
        return
      }

      isHandlingBarcode = true
      debugLog('handling scanned barcode', { format: barcode.format, value: barcode.value })
      await stopScanner()
      await handleBarcodeScan(barcode.value)
    })
    barcodeScanErrorListener = await CameraPreview.addListener('barcodeScanError', ({ message }: BarcodeScanErrorEvent) => {
      debugWarn('barcode scan error event', message)
    })
    debugLog('barcode listeners attached')

    cameraPreviewStarted = true
    setCameraPreviewActive(true)
    debugLog('camera preview transparency enabled')
    await waitForPaint()

    const startResult = await CameraPreview.start({
      ...frame,
      aspectMode: 'cover',
      disableAudio: true,
      force: true,
      position: 'rear',
      toBack: true,
    })
    debugLog('camera preview started', {
      diagnostics: getScannerDiagnostics(),
      startResult,
    })

    const barcodeScannerOptions: BarcodeScannerOptions = { detectionInterval: 200, formats: ['qr_code'] }
    debugLog('starting native barcode scanner', barcodeScannerOptions)
    await CameraPreview.startBarcodeScanner(barcodeScannerOptions)
    debugLog('native barcode scanner started')
    startBarcodeWatchdog(startResult)
  }
  catch (error) {
    debugWarn('failed to start scanner', error)
    errorMessage.value = 'The camera could not start. Check camera permissions, then tap scan again or paste the link manually.'
    await stopScanner(true)
  }
}

async function handleBarcodeScan(scannedValue: string) {
  const value = scannedValue.trim()
  debugLog('handleBarcodeScan called', value)
  const previewLink = parsePreviewDeepLink(value)
  if (previewLink) {
    debugLog('scan parsed as preview deep link', previewLink)
    scannedUrl.value = value
    manualUrl.value = ''
    await startPreviewLink(previewLink)
    return
  }

  const previewStartUrl = previewStartUrlFromUrl(value)
  if (previewStartUrl) {
    debugLog('scan parsed as preview host', { previewStartUrl, value })
    scannedUrl.value = value
    manualUrl.value = value
    await startPreviewPayload(previewStartUrl)
    return
  }

  if (!isHttpUrl(value)) {
    debugWarn('scan value is unsupported', value)
    errorMessage.value = 'This QR code is not a Capgo preview link or an HTTPS bundle URL.'
    manualUrl.value = value
    toast.error('Scanned QR code is not a supported preview link')
    return
  }

  scannedUrl.value = value
  manualUrl.value = value
  debugLog('scan parsed as direct HTTP update URL', value)
  await downloadUpdate(value)
}

async function startPreviewSession(appId?: string, payloadUrl?: string) {
  const options: StartPreviewSessionOptions = {}
  if (appId)
    options.appId = appId
  if (payloadUrl)
    options.payloadUrl = payloadUrl

  const hasOptions = Object.keys(options).length > 0
  debugLog('starting preview session', {
    appId: options.appId,
    hasPayloadUrl: !!options.payloadUrl,
    payloadUrl: options.payloadUrl,
  })
  await CapacitorUpdater.startPreviewSession(hasOptions ? options : undefined)
  debugLog('preview session started', {
    appId: options.appId,
    hasPayloadUrl: !!options.payloadUrl,
    payloadUrl: options.payloadUrl,
  })
}

function parsePreviewPayloadBody(data: unknown, status: number) {
  if (typeof data !== 'string')
    return data

  try {
    return JSON.parse(data)
  }
  catch {
    throw new Error(data || `Preview payload request failed with HTTP ${status}`)
  }
}

function stringFromPayloadValue(value: unknown) {
  if (value === undefined || value === null)
    return ''

  if (typeof value === 'string')
    return value

  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)

  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}

function previewPayloadErrorMessage(payload: unknown, status: number) {
  if (typeof payload === 'object' && payload) {
    const payloadRecord = payload as Record<string, unknown>
    for (const key of ['message', 'error', 'details', 'detail']) {
      const message = stringFromPayloadValue(payloadRecord[key])
      if (message)
        return message
    }
  }

  return `Preview payload request failed with HTTP ${status}`
}

function validatePreviewPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object')
    throw new Error('Preview payload is invalid')

  return payload as PreviewPayload
}

async function previewPayloadFromResponse(response: Response): Promise<PreviewPayload> {
  const text = await response.text()
  debugLog('browser preview payload body received', {
    body: text,
    status: response.status,
  })
  const payload = parsePreviewPayloadBody(text, response.status)

  if (!response.ok)
    throw new Error(previewPayloadErrorMessage(payload, response.status))

  return validatePreviewPayload(payload)
}

function previewPayloadFromHttpResponse(response: HttpResponse): PreviewPayload {
  const payload = parsePreviewPayloadBody(response.data, response.status)

  if (response.status < 200 || response.status >= 300)
    throw new Error(previewPayloadErrorMessage(payload, response.status))

  return validatePreviewPayload(payload)
}

async function fetchPreviewPayloadWithNativeHttp(payloadUrl: string) {
  const response = await CapacitorHttp.get({
    headers: { Accept: 'application/json' },
    responseType: 'text',
    url: payloadUrl,
  })
  debugLog('native preview payload response received', {
    body: response.data,
    dataType: typeof response.data,
    status: response.status,
    url: response.url,
  })
  return previewPayloadFromHttpResponse(response)
}

async function fetchPreviewPayloadWithBrowserFetch(payloadUrl: string) {
  const response = await fetch(payloadUrl, {
    headers: { Accept: 'application/json' },
  })
  debugLog('browser preview payload response received', {
    ok: response.ok,
    status: response.status,
    url: response.url,
  })
  return previewPayloadFromResponse(response)
}

async function fetchPreviewPayload(payloadUrl: string) {
  debugLog('fetching preview payload', {
    payloadUrl,
    transport: isNativePlatform ? 'native-http' : 'fetch',
  })
  const payload = isNativePlatform
    ? await fetchPreviewPayloadWithNativeHttp(payloadUrl)
    : await fetchPreviewPayloadWithBrowserFetch(payloadUrl)
  if (!payload.version)
    throw new Error('Preview payload is missing a version')
  if (!payload.url && !payload.manifest?.length)
    throw new Error('Preview payload is missing download information')
  debugLog('preview payload received', {
    appId: payload.appId,
    hasManifest: !!payload.manifest?.length,
    hasUrl: !!payload.url,
    version: payload.version,
  })
  return payload
}

function downloadOptionsFromPreviewPayload(payload: PreviewPayload): DownloadOptions {
  if (!payload.version)
    throw new Error('Preview payload is missing a version')

  return {
    checksum: payload.checksum ?? undefined,
    manifest: payload.manifest,
    sessionKey: payload.sessionKey ?? undefined,
    url: payload.url || PREVIEW_DOWNLOAD_PLACEHOLDER_URL,
    version: payload.version,
  }
}

async function fetchPreviewPayloadWithHostFallback(payloadUrl: string, appId?: string): Promise<PreviewPayloadFetchResult> {
  const target = previewHostTargetFromUrl(payloadUrl)
  if (target) {
    const parsedUrl = parseSafeUrl(payloadUrl)
    if (parsedUrl?.pathname !== PREVIEW_PAYLOAD_PATH) {
      debugLog('using preview host directly', {
        appId: appId || target.appId,
        rootUrl: target.rootUrl,
      })
      return {
        payload: await buildPreviewPayloadFromHost({
          ...target,
          appId: appId || target.appId,
        }),
      }
    }
  }

  try {
    return {
      payload: await fetchPreviewPayload(payloadUrl),
      sessionPayloadUrl: payloadUrl,
    }
  }
  catch (error) {
    if (!target)
      throw error

    debugWarn('preview payload endpoint unavailable, falling back to host crawl', error)
    return {
      payload: await buildPreviewPayloadFromHost({
        ...target,
        appId: appId || target.appId,
      }),
    }
  }
}

async function startPreviewPayload(payloadUrl: string, appId?: string) {
  try {
    debugLog('starting preview payload flow', { appId, payloadUrl })
    isLoading.value = true
    downloadProgress.value = 0

    await removeDownloadListener()
    downloadListener = await CapacitorUpdater.addListener('download', (state: DownloadEvent) => {
      downloadProgress.value = state.percent || 0
      debugLog('download progress', { percent: state.percent })
    })

    toast.success('Starting preview')

    const { payload, sessionPayloadUrl } = await fetchPreviewPayloadWithHostFallback(payloadUrl, appId)
    const bundle = await CapacitorUpdater.download(downloadOptionsFromPreviewPayload(payload))
    debugLog('preview payload downloaded', bundle)

    await startPreviewSession(payload.appId || appId, sessionPayloadUrl)
    await CapacitorUpdater.set(bundle)
    debugLog('preview payload applied', bundle)
  }
  catch (error) {
    debugWarn('failed to start preview payload flow', error)
    const message = error instanceof Error ? error.message : String(error)
    errorMessage.value = `Failed to start preview: ${message}`
    manualUrl.value = scannedUrl.value
    toast.error(errorMessage.value)
  }
  finally {
    isLoading.value = false
    await removeDownloadListener()
  }
}

async function startPreviewLink(previewLink: PreviewDeepLink) {
  debugLog('starting preview link', previewLink)
  if (previewLink.payloadUrl) {
    await startPreviewPayload(previewLink.payloadUrl, previewLink.appId)
    return
  }

  if (previewLink.type === 'channel') {
    const previewRootUrl = previewRootUrlFromChannelLink(previewLink)
    if (previewRootUrl) {
      debugLog('channel preview link converted to preview host', { previewRootUrl })
      await startPreviewPayload(previewRootUrl, previewLink.appId)
      return
    }
  }

  if (previewLink.type === 'bundle') {
    const previewRootUrl = previewRootUrlFromBundleLink(previewLink)
    if (previewRootUrl) {
      debugLog('bundle preview link converted to preview host', { previewRootUrl })
      await startPreviewPayload(previewRootUrl, previewLink.appId)
      return
    }
  }

  if (previewLink.type === 'channel')
    await startChannelPreview(previewLink)
}

async function startChannelPreview(previewLink: Extract<PreviewDeepLink, { type: 'channel' }>) {
  try {
    debugLog('starting channel preview flow', previewLink)
    isLoading.value = true
    downloadProgress.value = 0

    await removeDownloadListener()
    downloadListener = await CapacitorUpdater.addListener('download', (state: DownloadEvent) => {
      downloadProgress.value = state.percent || 0
      debugLog('download progress', { percent: state.percent })
    })

    toast.success('Starting preview')

    const latest = await CapacitorUpdater.getLatest(buildChannelPreviewLatestOptions(previewLink))
    debugLog('latest preview response received', {
      error: latest.error,
      hasManifest: !!latest.manifest?.length,
      hasUrl: !!latest.url,
      message: latest.message,
      version: latest.version,
    })
    if (!latest.url)
      throw new Error(latest.message || latest.error || 'No preview update is available for this channel')

    const bundle = await CapacitorUpdater.download({
      checksum: latest.checksum,
      manifest: latest.manifest,
      sessionKey: latest.sessionKey,
      url: latest.url,
      version: latest.version,
    })
    debugLog('channel preview downloaded', bundle)

    await startPreviewSession(previewLink.appId)
    await CapacitorUpdater.set(bundle)
    debugLog('channel preview applied', bundle)
  }
  catch (error) {
    debugWarn('failed to start channel preview flow', error)
    const message = error instanceof Error ? error.message : String(error)
    errorMessage.value = `Failed to start preview: ${message}`
    manualUrl.value = scannedUrl.value
    toast.error(errorMessage.value)
  }
  finally {
    isLoading.value = false
    await removeDownloadListener()
  }
}

async function downloadUpdate(updateUrl: string) {
  debugLog('downloadUpdate called', updateUrl)
  const previewLink = parsePreviewDeepLink(updateUrl)
  if (previewLink) {
    await startPreviewLink(previewLink)
    return
  }

  const previewStartUrl = previewStartUrlFromUrl(updateUrl)
  if (previewStartUrl) {
    await startPreviewPayload(previewStartUrl)
    return
  }

  if (!isHttpUrl(updateUrl)) {
    debugWarn('downloadUpdate rejected unsupported URL', updateUrl)
    errorMessage.value = 'This is not a downloadable bundle URL. Use a Capgo preview QR code or an HTTPS bundle URL.'
    toast.error('Unsupported update URL')
    return
  }

  try {
    debugLog('starting direct download flow', updateUrl)
    isLoading.value = true
    downloadProgress.value = 0

    await removeDownloadListener()
    downloadListener = await CapacitorUpdater.addListener('download', (state: DownloadEvent) => {
      downloadProgress.value = state.percent || 0
      debugLog('download progress', { percent: state.percent })
    })

    toast.success(`Starting download from ${new URL(updateUrl).host}`)

    const bundle = await CapacitorUpdater.download({
      url: updateUrl,
      version: `scan-${Date.now()}`,
    })
    debugLog('direct update downloaded', bundle)

    toast.success('Download completed. Applying update...')

    await startPreviewSession()
    await CapacitorUpdater.set(bundle)
    debugLog('direct update applied', bundle)

    toast.success('Update applied. The app will reload automatically.')
  }
  catch (error) {
    debugWarn('failed to download/apply update', error)
    const message = error instanceof Error ? error.message : String(error)
    toast.error(`Failed to apply update: ${message}`)
  }
  finally {
    isLoading.value = false
    await removeDownloadListener()
  }
}

async function submitManualUrl() {
  debugLog('submitManualUrl called', normalizedManualUrl.value)
  if (!canSubmitManualUrl.value) {
    toast.error('Enter a valid preview link or update URL')
    return
  }

  errorMessage.value = ''
  statusMessage.value = ''
  scannedUrl.value = normalizedManualUrl.value

  if (isScanning.value || cameraPreviewStarted)
    await stopScanner(true)

  if (manualPreviewLink.value) {
    await startPreviewLink(manualPreviewLink.value)
    return
  }

  if (manualPreviewStartUrl.value) {
    await startPreviewPayload(manualPreviewStartUrl.value)
    return
  }

  if (!isNativePlatform) {
    toast.success(`Opening ${new URL(normalizedManualUrl.value).host}`)
    window.location.assign(normalizedManualUrl.value)
    return
  }

  await downloadUpdate(normalizedManualUrl.value)
}

async function retryScanning() {
  debugLog('retryScanning called')
  errorMessage.value = ''
  statusMessage.value = ''
  scannedUrl.value = ''
  manualUrl.value = ''
  downloadProgress.value = 0
  await stopScanner(true)
  await startScanner()
}

async function goBack() {
  if (window.history.length > 1) {
    await router.back()
    return
  }

  await router.push('/login')
}
</script>

<template>
  <main
    class="camera-preview-page fixed inset-0 h-dvh overflow-hidden text-white"
    :class="isScanning ? 'bg-transparent' : 'bg-slate-950'"
  >
    <div v-if="!isScanning" class="absolute inset-0 bg-slate-950" />

    <div class="relative z-10 mx-auto flex h-dvh w-full max-w-md flex-col px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
      <header class="flex shrink-0 items-center gap-3">
        <button
          class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-950/70 text-white shadow-lg shadow-black/20 backdrop-blur transition-colors hover:bg-slate-900"
          aria-label="Go back"
          @click="goBack"
        >
          <IconArrowLeft class="h-5 w-5" />
        </button>
        <div class="min-w-0 flex-1">
          <p class="text-xs font-semibold uppercase tracking-wide text-cyan-200">
            Preview test
          </p>
          <h1 class="truncate text-xl font-semibold text-white">
            Scan QR
          </h1>
        </div>
        <span class="shrink-0 rounded-full border border-emerald-300/30 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-emerald-100 shadow-lg shadow-black/20 backdrop-blur">
          {{ scannerStatusLabel }}
        </span>
      </header>

      <section class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-3">
        <div class="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-black/20 backdrop-blur">
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-300 text-slate-950">
            <IconQrCode class="h-5 w-5" />
          </span>
          <span class="truncate">{{ scannerTitle }}</span>
        </div>

        <div
          ref="scannerFrameRef"
          class="scan-camera-frame relative mx-auto aspect-[3/4] shrink-0 overflow-hidden rounded-[2rem] border border-cyan-200/30 shadow-2xl shadow-black/40"
          :class="isScanning ? 'bg-transparent ring-2 ring-cyan-300/70' : 'bg-slate-950 ring-1 ring-white/10'"
          style="width: min(74vw, 17rem, 34dvh);"
        >
          <div v-if="!isScanning" class="absolute inset-0 bg-slate-950" />
          <div
            v-if="isScanning"
            class="scanner-sweep absolute left-8 right-8 top-10 h-px bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.95)]"
          />
          <div class="absolute left-4 top-4 h-12 w-12 rounded-tl-2xl border-l-4 border-t-4 border-cyan-300" />
          <div class="absolute right-4 top-4 h-12 w-12 rounded-tr-2xl border-r-4 border-t-4 border-cyan-300" />
          <div class="absolute bottom-4 left-4 h-12 w-12 rounded-bl-2xl border-b-4 border-l-4 border-cyan-300" />
          <div class="absolute bottom-4 right-4 h-12 w-12 rounded-br-2xl border-b-4 border-r-4 border-cyan-300" />
        </div>

        <div class="min-h-[4.25rem] w-full max-w-sm">
          <div v-if="isLoading" class="rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-3 shadow-lg shadow-black/20 backdrop-blur" aria-live="polite">
            <div class="flex items-center justify-between gap-3">
              <span class="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <IconDownload class="h-5 w-5 animate-bounce text-cyan-200" />
                Applying preview
              </span>
              <span class="text-sm font-semibold text-cyan-100">
                {{ progressPercentage }}%
              </span>
            </div>
            <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                class="h-full rounded-full bg-cyan-300 transition-all duration-300 ease-out"
                :style="{ width: `${downloadProgress}%` }"
              />
            </div>
            <p v-if="downloadHost" class="mt-2 truncate text-xs text-slate-400">
              Source: {{ downloadHost }}
            </p>
          </div>

          <p v-else-if="statusMessage" class="rounded-2xl border border-cyan-300/20 bg-slate-950/80 px-3 py-3 text-sm leading-6 text-cyan-100 shadow-lg shadow-black/20 backdrop-blur" aria-live="polite">
            {{ statusMessage }}
          </p>
          <p v-else-if="!errorMessage" class="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-center text-sm font-semibold leading-6 text-slate-100 shadow-lg shadow-black/20 backdrop-blur" aria-live="polite">
            {{ isScanning ? 'Hold QR in frame' : 'Camera opens when you scan' }}
          </p>
          <p v-if="errorMessage" class="mt-2 rounded-2xl border border-amber-300/25 bg-slate-950/80 px-3 py-3 text-sm leading-6 text-amber-100 shadow-lg shadow-black/20 backdrop-blur" aria-live="polite">
            {{ errorMessage }}
          </p>
        </div>
      </section>

      <section class="shrink-0">
        <div class="mx-auto max-w-md space-y-2">
          <div class="max-h-[20dvh] space-y-2 overflow-y-auto pr-1">
            <details class="rounded-2xl border border-white/10 bg-slate-950/80 p-3 shadow-lg shadow-black/20 backdrop-blur">
              <summary class="flex cursor-pointer list-none items-center gap-3 text-sm font-semibold text-white">
                <IconLink class="h-5 w-5 text-cyan-200" />
                Paste preview link
              </summary>

              <label class="mt-3 block text-sm font-medium text-slate-200" for="manual-url">
                Preview link or bundle URL
              </label>
              <input
                id="manual-url"
                v-model="manualUrl"
                type="url"
                inputmode="url"
                placeholder="https://preview.capgo.app/..."
                class="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-hidden transition-colors placeholder:text-slate-500 focus:border-cyan-300/70"
              >

              <button
                class="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!canSubmitManualUrl"
                @click="submitManualUrl"
              >
                <IconDownload class="h-5 w-5" />
                {{ manualActionLabel }}
              </button>
            </details>

            <details v-if="debugMessages.length" class="rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-xs text-slate-300 shadow-lg shadow-black/20 backdrop-blur" open>
              <summary class="cursor-pointer select-none font-semibold text-slate-100">
                Debug
              </summary>
              <div class="mt-2 flex items-center justify-between gap-3">
                <span class="min-w-0 text-[11px] font-medium text-slate-400">
                  {{ debugMessages.length }} entries
                </span>
                <button
                  type="button"
                  class="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-2.5 text-[11px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/20"
                  @click="copyDebugLogs"
                >
                  <IconClipboard class="h-4 w-4" />
                  Copy logs
                </button>
              </div>
              <ol class="mt-2 max-h-36 space-y-1 overflow-y-auto font-mono leading-5">
                <li v-for="message in debugMessages" :key="message">
                  {{ message }}
                </li>
              </ol>
            </details>
          </div>

          <button
            v-if="isNativePlatform"
            class="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="isScanning || isLoading"
            @click="retryScanning"
          >
            <IconArrowPath v-if="errorMessage || statusMessage" class="h-5 w-5" />
            <IconQrCode v-else class="h-5 w-5" />
            {{ isScanning ? 'Camera open' : errorMessage || statusMessage ? 'Scan again' : 'Scan QR code' }}
          </button>
          <p v-else class="rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-center text-sm leading-6 text-slate-300">
            Paste a preview link below to test from this browser.
          </p>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.camera-preview-page {
  overscroll-behavior: none;
  touch-action: manipulation;
}

.scanner-sweep {
  animation: scanner-sweep 2.2s ease-in-out infinite;
}

@keyframes scanner-sweep {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  50% {
    transform: translateY(16rem);
    opacity: 1;
  }
}
</style>

<style>
html.camera-preview-active,
body.camera-preview-active,
body.camera-preview-active #app,
body.camera-preview-active #app > .app-shell,
body.camera-preview-active .camera-preview-page,
body.camera-preview-active .scan-camera-frame {
  background: transparent !important;
  background-color: transparent !important;
}
</style>

<route lang="yaml">
meta:
  layout: naked
</route>
