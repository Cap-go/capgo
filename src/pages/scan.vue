<script setup lang="ts">
import type { PluginListenerHandle } from '@capacitor/core'
import type { BarcodeScanErrorEvent, BarcodeScannedEvent } from '@capgo/camera-preview'
import type { DownloadEvent, DownloadOptions } from '@capgo/capacitor-updater'
import type { PreviewDeepLink } from '~/services/previewLinks'
import { Capacitor } from '@capacitor/core'
import { CameraPreview } from '@capgo/camera-preview'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconDownload from '~icons/heroicons/arrow-down-tray-20-solid'
import IconArrowLeft from '~icons/heroicons/arrow-left-20-solid'
import IconArrowPath from '~icons/heroicons/arrow-path-20-solid'
import IconLink from '~icons/heroicons/link-20-solid'
import IconQrCode from '~icons/heroicons/qr-code-20-solid'
import { buildChannelPreviewLatestOptions, parsePreviewDeepLink } from '~/services/previewLinks'
import { useDisplayStore } from '~/stores/display'

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

let downloadListener: Awaited<ReturnType<typeof CapacitorUpdater.addListener>> | null = null
let barcodeScannedListener: PluginListenerHandle | null = null
let barcodeScanErrorListener: PluginListenerHandle | null = null
let cameraPreviewStarted = false
let isHandlingBarcode = false

interface PreviewPayload {
  appId?: string
  version?: string
  url?: string
  checksum?: string | null
  sessionKey?: string | null
  manifest?: DownloadOptions['manifest']
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

function isPreviewHost(hostname: string) {
  return /^[^.]+\.preview(?:\.[^.]+)?\.(?:capgo\.app|usecapgo\.com)$/.test(hostname)
}

function previewPayloadUrlFromUrl(value: string) {
  const parsedUrl = parseSafeUrl(value)
  if (!parsedUrl || (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:'))
    return ''

  if (!isPreviewHost(parsedUrl.hostname))
    return ''

  return new URL('/.capgo/preview.json', parsedUrl.origin).toString()
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
const manualPreviewPayloadUrl = computed(() => previewPayloadUrlFromUrl(normalizedManualUrl.value))
const canSubmitManualUrl = computed(() => !isLoading.value && (!!manualPreviewLink.value || !!manualPreviewPayloadUrl.value || isHttpUrl(normalizedManualUrl.value)))
const manualActionLabel = computed(() => {
  if (manualPreviewLink.value || manualPreviewPayloadUrl.value)
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

  const previewLink = Array.isArray(route.query.preview) ? route.query.preview[0] : route.query.preview
  if (previewLink) {
    await handleBarcodeScan(previewLink)
    return
  }

  if (!isNativePlatform)
    statusMessage.value = 'Live camera scanning is available in the iOS and Android app. Paste a preview link or bundle URL below.'
})

onUnmounted(async () => {
  await stopScanner(true)
  await removeDownloadListener()
})

async function removeDownloadListener() {
  if (!downloadListener)
    return

  await downloadListener.remove()
  downloadListener = null
}

async function removeScannerListeners() {
  await barcodeScannedListener?.remove()
  await barcodeScanErrorListener?.remove()
  barcodeScannedListener = null
  barcodeScanErrorListener = null
}

function setCameraPreviewActive(active: boolean) {
  document.documentElement.classList.toggle('camera-preview-active', active)
  document.body.classList.toggle('camera-preview-active', active)
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
  if (!cameraPreviewStarted && !force) {
    isScanning.value = false
    isHandlingBarcode = false
    setCameraPreviewActive(false)
    await removeScannerListeners()
    return
  }

  try {
    await CameraPreview.stopBarcodeScanner()
  }
  catch (error) {
    console.warn('Failed to stop barcode scanner:', error)
  }

  try {
    await CameraPreview.stop({ force: true })
  }
  catch (error) {
    console.warn('Failed to stop camera preview:', error)
  }

  cameraPreviewStarted = false
  isScanning.value = false
  isHandlingBarcode = false
  setCameraPreviewActive(false)
  await removeScannerListeners()
}

async function startScanner() {
  if (!isNativePlatform) {
    statusMessage.value = 'Live camera scanning is available in the iOS and Android app. Paste a preview link or bundle URL below.'
    return
  }

  if (isScanning.value || isLoading.value)
    return

  try {
    isScanning.value = true
    isHandlingBarcode = false
    errorMessage.value = ''
    statusMessage.value = ''
    scannedUrl.value = ''
    manualUrl.value = ''

    await nextTick()
    const frame = getScannerFrame()

    await removeScannerListeners()
    barcodeScannedListener = await CameraPreview.addListener('barcodeScanned', async ({ barcodes }: BarcodeScannedEvent) => {
      if (isHandlingBarcode)
        return

      const barcode = barcodes.find(result => result.value)
      if (!barcode)
        return

      isHandlingBarcode = true
      await stopScanner()
      await handleBarcodeScan(barcode.value)
    })
    barcodeScanErrorListener = await CameraPreview.addListener('barcodeScanError', ({ message }: BarcodeScanErrorEvent) => {
      console.warn('Barcode scan error:', message)
    })

    cameraPreviewStarted = true
    setCameraPreviewActive(true)
    await CameraPreview.start({
      ...frame,
      aspectMode: 'cover',
      barcodeScanner: {
        detectionInterval: 350,
        formats: ['qr_code'],
      },
      disableAudio: true,
      force: true,
      position: 'rear',
      toBack: true,
    })
  }
  catch (error) {
    console.error('Failed to scan:', error)
    errorMessage.value = 'The camera could not start. Check camera permissions, then tap scan again or paste the link manually.'
    await stopScanner(true)
  }
}

async function handleBarcodeScan(scannedValue: string) {
  const value = scannedValue.trim()
  const previewLink = parsePreviewDeepLink(value)
  if (previewLink) {
    scannedUrl.value = value
    manualUrl.value = ''
    await startPreviewLink(previewLink)
    return
  }

  const previewPayloadUrl = previewPayloadUrlFromUrl(value)
  if (previewPayloadUrl) {
    scannedUrl.value = value
    manualUrl.value = value
    await startPreviewPayload(previewPayloadUrl)
    return
  }

  if (!isHttpUrl(value)) {
    errorMessage.value = 'This QR code is not a Capgo preview link or an HTTPS bundle URL.'
    manualUrl.value = value
    toast.error('Scanned QR code is not a supported preview link')
    return
  }

  scannedUrl.value = value
  manualUrl.value = value
  await downloadUpdate(value)
}

async function startPreviewSession(appId?: string) {
  await CapacitorUpdater.startPreviewSession(appId ? { appId } : undefined)
}

async function previewPayloadFromResponse(response: Response): Promise<PreviewPayload> {
  const text = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(text)
  }
  catch {
    throw new Error(text || `Preview payload request failed with HTTP ${response.status}`)
  }

  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'message' in payload
      ? String((payload as { message?: unknown }).message)
      : `Preview payload request failed with HTTP ${response.status}`
    throw new Error(message)
  }

  if (!payload || typeof payload !== 'object')
    throw new Error('Preview payload is invalid')

  return payload as PreviewPayload
}

async function fetchPreviewPayload(payloadUrl: string) {
  const response = await fetch(payloadUrl, {
    headers: { Accept: 'application/json' },
  })
  const payload = await previewPayloadFromResponse(response)
  if (!payload.version)
    throw new Error('Preview payload is missing a version')
  if (!payload.url && !payload.manifest?.length)
    throw new Error('Preview payload is missing download information')
  return payload
}

function downloadOptionsFromPreviewPayload(payload: PreviewPayload): DownloadOptions {
  if (!payload.version)
    throw new Error('Preview payload is missing a version')

  return {
    checksum: payload.checksum ?? undefined,
    manifest: payload.manifest,
    sessionKey: payload.sessionKey ?? undefined,
    url: payload.url || 'https://404.capgo.app/no.zip',
    version: payload.version,
  }
}

async function startPreviewPayload(payloadUrl: string, appId?: string) {
  try {
    isLoading.value = true
    downloadProgress.value = 0

    await removeDownloadListener()
    downloadListener = await CapacitorUpdater.addListener('download', (state: DownloadEvent) => {
      downloadProgress.value = state.percent || 0
    })

    toast.success('Starting preview')

    const payload = await fetchPreviewPayload(payloadUrl)
    const bundle = await CapacitorUpdater.download(downloadOptionsFromPreviewPayload(payload))

    await startPreviewSession(payload.appId || appId)
    await CapacitorUpdater.set(bundle)
  }
  catch (error) {
    console.error('Failed to start preview:', error)
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
  if (previewLink.payloadUrl) {
    await startPreviewPayload(previewLink.payloadUrl, previewLink.appId)
    return
  }

  if (previewLink.type === 'channel')
    await startChannelPreview(previewLink)
}

async function startChannelPreview(previewLink: Extract<PreviewDeepLink, { type: 'channel' }>) {
  try {
    isLoading.value = true
    downloadProgress.value = 0

    await removeDownloadListener()
    downloadListener = await CapacitorUpdater.addListener('download', (state: DownloadEvent) => {
      downloadProgress.value = state.percent || 0
    })

    toast.success('Starting preview')

    const latest = await CapacitorUpdater.getLatest(buildChannelPreviewLatestOptions(previewLink))
    if (!latest.url)
      throw new Error(latest.message || latest.error || 'No preview update is available for this channel')

    const bundle = await CapacitorUpdater.download({
      checksum: latest.checksum,
      manifest: latest.manifest,
      sessionKey: latest.sessionKey,
      url: latest.url,
      version: latest.version,
    })

    await startPreviewSession(previewLink.appId)
    await CapacitorUpdater.set(bundle)
  }
  catch (error) {
    console.error('Failed to start channel preview:', error)
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
  const previewLink = parsePreviewDeepLink(updateUrl)
  if (previewLink) {
    await startPreviewLink(previewLink)
    return
  }

  const previewPayloadUrl = previewPayloadUrlFromUrl(updateUrl)
  if (previewPayloadUrl) {
    await startPreviewPayload(previewPayloadUrl)
    return
  }

  if (!isHttpUrl(updateUrl)) {
    errorMessage.value = 'This is not a downloadable bundle URL. Use a Capgo preview QR code or an HTTPS bundle URL.'
    toast.error('Unsupported update URL')
    return
  }

  try {
    isLoading.value = true
    downloadProgress.value = 0

    await removeDownloadListener()
    downloadListener = await CapacitorUpdater.addListener('download', (state: DownloadEvent) => {
      downloadProgress.value = state.percent || 0
    })

    toast.success(`Starting download from ${new URL(updateUrl).host}`)

    const bundle = await CapacitorUpdater.download({
      url: updateUrl,
      version: `scan-${Date.now()}`,
    })

    toast.success('Download completed. Applying update...')

    await startPreviewSession()
    await CapacitorUpdater.set(bundle)

    toast.success('Update applied. The app will reload automatically.')
  }
  catch (error) {
    console.error('Failed to download/apply update:', error)
    const message = error instanceof Error ? error.message : String(error)
    toast.error(`Failed to apply update: ${message}`)
  }
  finally {
    isLoading.value = false
    await removeDownloadListener()
  }
}

async function submitManualUrl() {
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

  if (manualPreviewPayloadUrl.value) {
    await startPreviewPayload(manualPreviewPayloadUrl.value)
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
    class="min-h-dvh overflow-y-auto pb-[calc(6rem+env(safe-area-inset-bottom))] text-white"
    :class="isScanning ? 'bg-transparent' : 'bg-slate-950'"
  >
    <div class="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <header class="flex items-center gap-3">
        <button
          class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10"
          aria-label="Go back"
          @click="goBack"
        >
          <IconArrowLeft class="h-5 w-5" />
        </button>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-cyan-200">
            Preview test
          </p>
          <h1 class="text-2xl font-semibold text-white">
            Scan QR code
          </h1>
        </div>
        <span class="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-100">
          {{ scannerStatusLabel }}
        </span>
      </header>

      <section class="mt-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
        <div class="flex items-start gap-3">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-300 text-slate-950">
            <IconQrCode class="h-5 w-5" />
          </span>
          <div>
            <h2 class="text-lg font-semibold text-white">
              {{ scannerTitle }}
            </h2>
            <p class="mt-1 text-sm leading-6 text-slate-300">
              Open the preview on your desktop, tap scan, then keep the app open until it reloads.
            </p>
          </div>
        </div>
      </section>

      <section
        class="mt-4 rounded-2xl border border-white/10 p-4"
        :class="isScanning ? 'bg-slate-950/45' : 'bg-slate-900'"
      >
        <div
          ref="scannerFrameRef"
          class="relative mx-auto aspect-square w-full max-w-[13.5rem] overflow-hidden rounded-2xl border border-cyan-200/25"
          :class="isScanning ? 'bg-transparent ring-2 ring-cyan-300/60' : 'bg-slate-950'"
        >
          <div
            v-if="isScanning"
            class="scanner-sweep absolute left-7 right-7 top-14 h-px bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.95)]"
          />
          <div class="absolute left-4 top-4 h-10 w-10 rounded-tl-xl border-l-4 border-t-4 border-cyan-300" />
          <div class="absolute right-4 top-4 h-10 w-10 rounded-tr-xl border-r-4 border-t-4 border-cyan-300" />
          <div class="absolute bottom-4 left-4 h-10 w-10 rounded-bl-xl border-b-4 border-l-4 border-cyan-300" />
          <div class="absolute bottom-4 right-4 h-10 w-10 rounded-br-xl border-b-4 border-r-4 border-cyan-300" />
          <div class="absolute inset-x-5 bottom-5 rounded-xl bg-slate-900/90 px-3 py-2 text-center text-xs font-medium leading-5 text-slate-200">
            {{ isScanning ? 'Center the QR code and hold steady.' : 'The camera opens only after you tap scan.' }}
          </div>
        </div>

        <div v-if="isLoading" class="mt-4" aria-live="polite">
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
          <p v-if="downloadHost" class="mt-3 text-xs text-slate-400">
            Source: {{ downloadHost }}
          </p>
        </div>

        <p v-if="statusMessage && !isLoading" class="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-sm leading-6 text-cyan-100" aria-live="polite">
          {{ statusMessage }}
        </p>
        <p v-if="errorMessage" class="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-sm leading-6 text-amber-100" aria-live="polite">
          {{ errorMessage }}
        </p>
      </section>

      <details class="mt-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
        <summary class="flex cursor-pointer list-none items-center gap-3 text-sm font-semibold text-white">
          <IconLink class="h-5 w-5 text-cyan-200" />
          Paste a preview link
        </summary>

        <label class="mt-4 block text-sm font-medium text-slate-200" for="manual-url">
          Preview link or bundle URL
        </label>
        <input
          id="manual-url"
          v-model="manualUrl"
          type="url"
          inputmode="url"
          placeholder="capgo://preview/..."
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

      <div class="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
        <div class="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent" />
        <div class="relative mx-auto max-w-md">
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
      </div>
    </div>
  </main>
</template>

<style scoped>
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
    transform: translateY(9.5rem);
    opacity: 1;
  }
}
</style>

<style>
html.camera-preview-active,
body.camera-preview-active,
body.camera-preview-active #app {
  background: transparent !important;
}
</style>

<route lang="yaml">
meta:
  layout: naked
</route>
