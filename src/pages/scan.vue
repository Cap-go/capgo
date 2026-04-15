<script setup lang="ts">
import type { DownloadEvent } from '@capgo/capacitor-updater'
import { CapacitorBarcodeScanner } from '@capacitor/barcode-scanner'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconDownload from '~icons/heroicons/arrow-down-tray-20-solid'
import IconArrowLeft from '~icons/heroicons/arrow-left-20-solid'
import IconArrowPath from '~icons/heroicons/arrow-path-20-solid'
import IconLink from '~icons/heroicons/link-20-solid'
import IconQrCode from '~icons/heroicons/qr-code-20-solid'
import IconShieldCheck from '~icons/heroicons/shield-check-20-solid'
import { useDisplayStore } from '~/stores/display'

const router = useRouter()
const displayStore = useDisplayStore()

const isNativePlatform = Capacitor.isNativePlatform()
const isScanning = ref(false)
const isLoading = ref(false)
const downloadProgress = ref(0)
const scannedUrl = ref('')
const errorMessage = ref('')
const manualUrl = ref('')

let downloadListener: Awaited<ReturnType<typeof CapacitorUpdater.addListener>> | null = null

const isFallbackMode = computed(() => !isNativePlatform || !!errorMessage.value)
const progressPercentage = computed(() => Math.round(downloadProgress.value))
const normalizedManualUrl = computed(() => {
  const value = manualUrl.value.trim()
  if (!value)
    return ''

  return /^https?:\/\//i.test(value) ? value : `https://${value}`
})
const canSubmitManualUrl = computed(() => !isLoading.value && URL.canParse(normalizedManualUrl.value))
const manualActionLabel = computed(() => (isNativePlatform ? 'Download update' : 'Open update URL'))
const scannerStatusLabel = computed(() => {
  if (isLoading.value)
    return 'Applying update'
  if (isScanning.value)
    return 'Camera active'
  if (isFallbackMode.value)
    return 'Manual fallback'
  return 'Ready'
})
const downloadHost = computed(() => {
  if (!scannedUrl.value || !URL.canParse(scannedUrl.value))
    return ''

  return new URL(scannedUrl.value).host
})

onMounted(async () => {
  displayStore.NavTitle = 'Scan update'
  displayStore.defaultBack = '/apps'

  if (isNativePlatform) {
    await startScanner()
    return
  }

  errorMessage.value = 'Live camera scanning is available in the iOS and Android app. Paste an update URL below to open it from this environment.'
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
    scannedUrl.value = ''
    manualUrl.value = ''

    const result = await CapacitorBarcodeScanner.scanBarcode({
      hint: 0,
    })

    isScanning.value = false

    if (result.ScanResult) {
      await handleBarcodeScan(result.ScanResult)
      return
    }

    errorMessage.value = 'No QR code was detected. Try again or paste the update URL manually.'
  }
  catch (error) {
    console.error('Failed to scan:', error)
    errorMessage.value = 'The camera could not start. Check camera permissions, then try again or paste the update URL manually.'
    isScanning.value = false
  }
}

async function handleBarcodeScan(scannedValue: string) {
  if (!URL.canParse(scannedValue)) {
    errorMessage.value = 'The scanned QR code does not contain a valid update URL.'
    toast.error('Scanned QR code is not a valid URL')
    return
  }

  scannedUrl.value = scannedValue
  manualUrl.value = scannedValue
  await downloadUpdate(scannedValue)
}

async function downloadUpdate(updateUrl: string) {
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
    toast.error('Enter a valid update URL')
    return
  }

  errorMessage.value = ''
  scannedUrl.value = normalizedManualUrl.value

  if (!isNativePlatform) {
    toast.success(`Opening ${new URL(normalizedManualUrl.value).host}`)
    window.location.assign(normalizedManualUrl.value)
    return
  }

  await downloadUpdate(normalizedManualUrl.value)
}

async function retryScanning() {
  errorMessage.value = ''
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
  <main class="min-h-screen overflow-hidden bg-slate-950 text-white">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.2),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.18),_transparent_34%)]" />
    <div class="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-8 pt-6 sm:px-6">
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
              Scan an update QR code
            </h1>
            <p class="mt-2 text-sm leading-6 text-slate-300">
              Load a live update bundle without leaving the app, then follow the install progress in one place.
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
              {{ isFallbackMode ? 'Paste the update link instead' : 'Align the QR code inside the frame' }}
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
              {{ isScanning ? 'Center the QR code and hold steady for a moment.' : 'Use the camera in the mobile app, or paste a full update URL below.' }}
            </div>
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
                {{ isNativePlatform ? 'Use the camera to capture a signed update URL from another screen or device.' : 'This environment cannot open the device camera, so manual entry is enabled instead.' }}
              </p>
            </div>
            <div class="rounded-[24px] border border-white/[0.08] bg-white/5 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Install behavior
              </p>
              <p class="mt-2 text-sm leading-6 text-slate-200">
                {{ isNativePlatform
                  ? 'The app downloads the bundle, switches to the new version, and reloads automatically when the update is ready.'
                  : 'This page can open the bundle URL in the browser, but applying the update still requires the native app.' }}
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
                Manual fallback
              </p>
              <h3 class="mt-1 text-base font-semibold text-white">
                Paste a full bundle URL
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
              Retry camera scan
            </button>
          </div>
        </div>
      </section>

      <section class="mt-5 grid gap-3 sm:grid-cols-2">
        <article class="rounded-[24px] border border-white/[0.08] bg-white/5 p-4">
          <div class="flex items-center gap-3">
            <div class="rounded-2xl border border-white/10 bg-white/[0.08] p-3 text-sky-200">
              <IconQrCode class="h-5 w-5" />
            </div>
            <div>
              <p class="text-sm font-semibold text-white">
                Best scan results
              </p>
              <p class="mt-1 text-sm leading-6 text-slate-300">
                Use a bright screen, avoid motion blur, and keep the full QR code inside the frame.
              </p>
            </div>
          </div>
        </article>

        <article class="rounded-[24px] border border-white/[0.08] bg-white/5 p-4">
          <div class="flex items-center gap-3">
            <div class="rounded-2xl border border-white/10 bg-white/[0.08] p-3 text-emerald-200">
              <IconShieldCheck class="h-5 w-5" />
            </div>
            <div>
              <p class="text-sm font-semibold text-white">
                Safer rollout check
              </p>
              <p class="mt-1 text-sm leading-6 text-slate-300">
                Verify the source before installing. Only use bundle URLs from your trusted release workflow.
              </p>
            </div>
          </div>
        </article>
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
