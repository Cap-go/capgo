<script setup lang="ts">
import type { DownloadEvent } from '@capgo/capacitor-updater'
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerCameraDirection,
  CapacitorBarcodeScannerScanOrientation,
  CapacitorBarcodeScannerTypeHint,
} from '@capacitor/barcode-scanner'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconDownload from '~icons/heroicons/arrow-down-tray-20-solid'
import IconArrowLeft from '~icons/heroicons/arrow-left-20-solid'
import IconArrowPath from '~icons/heroicons/arrow-path-20-solid'
import IconLink from '~icons/heroicons/link-20-solid'
import IconQrCode from '~icons/heroicons/qr-code-20-solid'
import { buildChannelPreviewLatestOptions, parseChannelPreviewDeepLink } from '~/services/previewLinks'
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

let downloadListener: Awaited<ReturnType<typeof CapacitorUpdater.addListener>> | null = null

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

const progressPercentage = computed(() => Math.round(downloadProgress.value))
const trimmedManualUrl = computed(() => manualUrl.value.trim())
const manualPreviewLink = computed(() => parseChannelPreviewDeepLink(trimmedManualUrl.value))
const normalizedManualUrl = computed(() => {
  const value = trimmedManualUrl.value
  if (!value)
    return ''

  if (manualPreviewLink.value)
    return value

  return /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`
})
const canSubmitManualUrl = computed(() => !isLoading.value && (!!manualPreviewLink.value || isHttpUrl(normalizedManualUrl.value)))
const manualActionLabel = computed(() => {
  if (manualPreviewLink.value)
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
  displayStore.NavTitle = 'Scan update'
  displayStore.defaultBack = '/apps'

  const previewLink = Array.isArray(route.query.preview) ? route.query.preview[0] : route.query.preview
  if (previewLink) {
    await handleBarcodeScan(previewLink)
    return
  }

  if (!isNativePlatform)
    statusMessage.value = 'Live camera scanning is available in the iOS and Android app. Paste a preview link or bundle URL below.'
})

onUnmounted(async () => {
  await removeDownloadListener()
})

async function removeDownloadListener() {
  if (!downloadListener)
    return

  await downloadListener.remove()
  downloadListener = null
}

async function startScanner() {
  try {
    isScanning.value = true
    errorMessage.value = ''
    statusMessage.value = ''
    scannedUrl.value = ''
    manualUrl.value = ''

    const result = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
      scanInstructions: 'Scan the preview QR code',
      scanButton: false,
      scanText: '',
      cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
      scanOrientation: CapacitorBarcodeScannerScanOrientation.ADAPTIVE,
    })

    isScanning.value = false

    if (result.ScanResult) {
      await handleBarcodeScan(result.ScanResult)
      return
    }

    statusMessage.value = 'No QR code was detected. Tap scan when you are ready to try again.'
  }
  catch (error) {
    console.error('Failed to scan:', error)
    errorMessage.value = 'The camera could not start. Check camera permissions, then tap scan again or paste the link manually.'
    isScanning.value = false
  }
}

async function handleBarcodeScan(scannedValue: string) {
  const value = scannedValue.trim()
  const previewLink = parseChannelPreviewDeepLink(value)
  if (previewLink) {
    scannedUrl.value = value
    manualUrl.value = ''
    await startChannelPreview(previewLink)
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
  await CapacitorUpdater.startPreviewSession({ appId })
}

async function startChannelPreview(previewLink: ReturnType<typeof parseChannelPreviewDeepLink>) {
  if (!previewLink)
    return

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

    await startPreviewSession(previewLink.appId)

    const bundle = await CapacitorUpdater.download({
      checksum: latest.checksum,
      manifest: latest.manifest,
      sessionKey: latest.sessionKey,
      url: latest.url,
      version: latest.version,
    })

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
  const previewLink = parseChannelPreviewDeepLink(updateUrl)
  if (previewLink) {
    await startChannelPreview(previewLink)
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

  if (manualPreviewLink.value) {
    await startChannelPreview(manualPreviewLink.value)
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
  await startScanner()
}

async function goBack() {
  if (window.history.length > 1) {
    await router.back()
    return
  }

  await router.push('/apps')
}
</script>

<template>
  <main class="min-h-dvh overflow-y-auto bg-slate-950 text-white">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.2),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.18),_transparent_34%)]" />
    <div class="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-8 pt-6 sm:px-6">
      <header class="rounded-[28px] border border-white/10 bg-white/[0.06] p-3 shadow-[0_18px_60px_rgba(15,23,42,0.32)] backdrop-blur">
        <div class="flex items-start justify-between gap-3">
          <button
            class="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.08] text-white transition-colors duration-200 hover:border-sky-300/40 hover:bg-white/[0.12]"
            aria-label="Go back"
            @click="goBack"
          >
            <IconArrowLeft class="h-5 w-5" />
          </button>
          <div class="flex-1 pt-1 text-center">
            <p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200/70">
              Release delivery
            </p>
            <h1 class="mt-2 text-2xl font-semibold tracking-tight text-white">
              Test a preview
            </h1>
            <p class="mt-2 text-sm leading-6 text-slate-300">
              Scan a Capgo preview QR code, then the app will fetch and apply the matching bundle.
            </p>
          </div>
          <span class="rounded-full border border-sky-300/25 bg-sky-400/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-100">
            {{ scannerStatusLabel }}
          </span>
        </div>
      </header>

      <section class="relative mt-5 overflow-hidden rounded-[32px] border border-white/10 bg-slate-900/80 p-5 shadow-[0_26px_90px_rgba(2,6,23,0.58)] backdrop-blur">
        <div class="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/45 to-transparent" />
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              Scanner surface
            </p>
            <h2 class="mt-2 text-lg font-semibold text-white">
              {{ scannerTitle }}
            </h2>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/5 p-3 text-sky-200">
            <IconQrCode class="h-6 w-6" />
          </div>
        </div>

        <div class="relative mt-5 overflow-hidden rounded-[28px] border border-sky-300/[0.12] bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_rgba(15,23,42,0.92)_56%)] p-4">
          <div
            class="relative mx-auto aspect-square w-full max-w-[18rem] overflow-hidden rounded-[26px] border border-dashed border-sky-200/35 bg-slate-950/80"
            :class="isScanning ? 'shadow-[0_0_0_1px_rgba(125,211,252,0.16),0_24px_50px_rgba(8,47,73,0.5)]' : 'shadow-[0_24px_50px_rgba(2,6,23,0.32)]'"
          >
            <div class="absolute inset-5 rounded-[22px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(15,23,42,0.2),rgba(15,23,42,0.78))]" />
            <div
              v-if="isScanning"
              class="scanner-sweep absolute left-7 right-7 top-16 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_18px_rgba(103,232,249,0.95)]"
            />
            <div class="absolute left-4 top-4 h-12 w-12 rounded-tl-[18px] border-l-4 border-t-4 border-sky-300" />
            <div class="absolute right-4 top-4 h-12 w-12 rounded-tr-[18px] border-r-4 border-t-4 border-sky-300" />
            <div class="absolute bottom-4 left-4 h-12 w-12 rounded-bl-[18px] border-b-4 border-l-4 border-sky-300" />
            <div class="absolute bottom-4 right-4 h-12 w-12 rounded-br-[18px] border-b-4 border-r-4 border-sky-300" />
            <div class="absolute inset-x-9 bottom-9 rounded-2xl border border-white/[0.08] bg-slate-950/[0.76] px-4 py-3 text-center text-xs font-medium leading-5 text-slate-300 backdrop-blur">
              {{ isScanning ? 'Center the QR code and hold steady.' : 'Read the steps, then tap scan when you are ready.' }}
            </div>
          </div>

          <div v-if="!isLoading" class="mt-5">
            <button
              v-if="isNativePlatform"
              class="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-400 via-cyan-300 to-blue-500 px-4 py-3 text-sm font-semibold text-slate-950 transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="isScanning"
              @click="retryScanning"
            >
              <IconQrCode class="h-5 w-5" />
              {{ isScanning ? 'Camera open' : 'Scan QR code' }}
            </button>
            <p
              v-if="statusMessage"
              class="mt-3 rounded-2xl border border-sky-300/20 bg-sky-400/10 px-4 py-3 text-sm leading-6 text-sky-100"
              aria-live="polite"
            >
              {{ statusMessage }}
            </p>
          </div>

          <div v-if="isLoading" class="mt-5 rounded-[24px] border border-sky-300/20 bg-sky-400/[0.08] p-4" aria-live="polite">
            <div class="flex items-start gap-3">
              <div class="rounded-2xl bg-sky-400/[0.12] p-3 text-sky-200">
                <IconDownload class="h-6 w-6 animate-bounce" />
              </div>
              <div class="flex-1">
                <div class="flex items-center justify-between gap-3">
                  <h3 class="text-base font-semibold text-white">
                    Downloading and applying update
                  </h3>
                  <span class="text-sm font-semibold text-sky-100">
                    {{ progressPercentage }}%
                  </span>
                </div>
                <p class="mt-2 text-sm leading-6 text-slate-300">
                  The bundle is being downloaded now. Keep this screen open until the app reloads.
                </p>
                <div class="mt-4 h-2 overflow-hidden rounded-full bg-slate-800/90">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-blue-400 transition-all duration-300 ease-out"
                    :style="{ width: `${downloadProgress}%` }"
                  />
                </div>
                <p v-if="downloadHost" class="mt-3 text-xs font-medium uppercase tracking-[0.22em] text-sky-100/70">
                  Source: {{ downloadHost }}
                </p>
              </div>
            </div>
          </div>

          <div v-else class="mt-5 grid gap-3 sm:grid-cols-2">
            <div class="rounded-[24px] border border-white/[0.08] bg-white/5 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Scanner mode
              </p>
              <p class="mt-2 text-sm leading-6 text-slate-200">
                {{ isNativePlatform ? 'The camera opens only after you tap scan.' : 'This environment cannot open the device camera, so manual entry is enabled instead.' }}
              </p>
            </div>
            <div class="rounded-[24px] border border-white/[0.08] bg-white/5 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Install behavior
              </p>
              <p class="mt-2 text-sm leading-6 text-slate-200">
                {{ isNativePlatform
                  ? 'Preview QR codes resolve to a downloadable bundle before install.'
                  : 'Applying an update still requires the native app.' }}
              </p>
            </div>
          </div>
        </div>

        <div class="mt-5 rounded-[28px] border border-white/10 bg-white/5 p-4">
          <div class="flex items-center gap-3">
            <div class="rounded-2xl border border-white/10 bg-white/[0.08] p-3 text-sky-200">
              <IconLink class="h-5 w-5" />
            </div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Paste link
              </p>
              <h3 class="mt-1 text-base font-semibold text-white">
                Paste a preview link or bundle URL
              </h3>
            </div>
          </div>

          <p v-if="errorMessage" class="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100" aria-live="polite">
            {{ errorMessage }}
          </p>

          <label class="mt-4 block text-sm font-medium text-slate-200" for="manual-url">
            Update URL
          </label>
          <input
            id="manual-url"
            v-model="manualUrl"
            type="url"
            inputmode="url"
            placeholder="https://updates.example.com/channel/latest"
            class="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-hidden transition-colors duration-200 placeholder:text-slate-500 focus:border-sky-300/60"
          >

          <div class="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              class="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-400 via-cyan-300 to-blue-500 px-4 py-3 text-sm font-semibold text-slate-950 transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!canSubmitManualUrl"
              @click="submitManualUrl"
            >
              <IconDownload class="h-5 w-5" />
              {{ manualActionLabel }}
            </button>
            <button
              v-if="isNativePlatform"
              class="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:border-sky-300/40 hover:bg-white/10"
              :disabled="isLoading"
              @click="retryScanning"
            >
              <IconArrowPath class="h-5 w-5" />
              Scan QR code
            </button>
          </div>
        </div>
      </section>
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

<route lang="yaml">
meta:
  layout: naked
</route>
