<script setup lang="ts">
import { CapacitorUpdater, type DownloadEvent } from '@capgo/capacitor-updater'
import { CameraView } from 'capacitor-camera-view'
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconDownload from '~icons/heroicons/arrow-down-tray-20-solid'
import IconQrCode from '~icons/heroicons/qr-code-20-solid'
import IconClose from '~icons/heroicons/x-mark-20-solid'
import { useDisplayStore } from '~/stores/display'

const router = useRouter()
const displayStore = useDisplayStore()

const isScanning = ref(false)
const isLoading = ref(false)
const downloadProgress = ref(0)
const scannedUrl = ref('')
const errorMessage = ref('')

let downloadListener: any = null

onMounted(async () => {
  displayStore.NavTitle = 'QR Scanner'
  displayStore.defaultBack = '/app'
  await startScanner()
})

onUnmounted(async () => {
  await stopScanner()
  if (downloadListener) {
    downloadListener.remove()
  }
  // Ensure camera class is removed
  document.body.classList.remove('camera-running')
})

async function startScanner() {
  try {
    isScanning.value = true
    errorMessage.value = ''

    // Make WebView transparent for camera
    document.body.classList.add('camera-running')

    await CameraView.start({
      enableBarcodeDetection: true,
    })

    CameraView.addListener('barcodeDetected', handleBarcodeScan)
  }
  catch (error) {
    console.error('Failed to start camera:', error)
    errorMessage.value = 'Failed to start camera. Please check permissions.'
    isScanning.value = false
    document.body.classList.remove('camera-running')
  }
}

async function stopScanner() {
  try {
    if (isScanning.value) {
      await CameraView.stop()
      CameraView.removeAllListeners()
      isScanning.value = false

      // Restore WebView visibility
      document.body.classList.remove('camera-running')
    }
  }
  catch (error) {
    console.error('Failed to stop camera:', error)
  }
}

async function handleBarcodeScan(data: any) {
  const scannedValue = data.displayValue || data.value || data.barcode?.displayValue || ''

  // Check if the scanned value is a valid URL
  if (!isValidUrl(scannedValue)) {
    toast.error('Scanned value is not a valid URL')
    return
  }

  scannedUrl.value = scannedValue
  await stopScanner()
  await downloadUpdate(scannedValue)
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  }
  catch {
    return false
  }
}

async function downloadUpdate(updateUrl: string) {
  try {
    isLoading.value = true
    downloadProgress.value = 0

    // Add download progress listener
    downloadListener = await CapacitorUpdater.addListener('download', (state: DownloadEvent) => {
      downloadProgress.value = state.percent || 0
    })

    toast.success(`Starting download from: ${updateUrl}`)

    // Download the update
    const bundle = await CapacitorUpdater.download({
      url: updateUrl,
      version: `scan-${Date.now()}`,
    })

    toast.success('Download completed! Applying update...')

    // Apply the update
    await CapacitorUpdater.set(bundle)

    toast.success('Update applied! App will reload...')

    // App will automatically reload after setting the bundle
  }
  catch (error) {
    console.error('Failed to download/apply update:', error)
    toast.error(`Failed to apply update: ${error}`)
  }
  finally {
    isLoading.value = false
    if (downloadListener) {
      downloadListener.remove()
      downloadListener = null
    }
  }
}

async function retryScanning() {
  errorMessage.value = ''
  scannedUrl.value = ''
  downloadProgress.value = 0
  await startScanner()
}

async function goBack() {
  await stopScanner()
  // Ensure camera class is removed
  document.body.classList.remove('camera-running')
  router.back()
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white camera-modal">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 bg-gray-800">
      <button class="p-2 rounded-lg hover:bg-gray-700" @click="goBack">
        <IconClose class="w-6 h-6" />
      </button>
      <h1 class="text-lg font-semibold">
        QR Code Scanner
      </h1>
      <div class="w-10" />
    </div>

    <!-- Camera Preview -->
    <div class="relative flex-1">
      <div v-if="isScanning" class="relative w-full h-96 bg-black rounded-lg">
        <!-- Scanning instructions -->
        <div class="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
          <div class="w-64 h-64 border-2 border-white border-dashed rounded-lg opacity-50" />
          <p class="text-white text-center mt-4 px-4">
            Point your camera at a QR code containing an update URL
          </p>
        </div>

        <!-- Corner decorators -->
        <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 z-10">
          <div class="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
          <div class="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
          <div class="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
          <div class="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
        </div>
      </div>

      <!-- Error State -->
      <div v-if="errorMessage && !isScanning" class="flex flex-col items-center justify-center h-96 p-8">
        <IconQrCode class="w-16 h-16 text-gray-500 mb-4" />
        <p class="text-gray-400 text-center mb-4">
          {{ errorMessage }}
        </p>
        <button
          class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          @click="retryScanning"
        >
          Retry Scanning
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="absolute inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-10">
        <IconDownload class="w-16 h-16 text-blue-500 mb-4 animate-bounce" />
        <h3 class="text-xl font-semibold mb-2">
          Downloading Update
        </h3>
        <p class="text-gray-400 mb-4">
          {{ Math.round(downloadProgress) }}%
        </p>

        <!-- Progress Bar -->
        <div class="w-64 h-3 bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full bg-blue-500 transition-all duration-300 ease-out"
            :style="{ width: `${downloadProgress}%` }"
          />
        </div>

        <p v-if="scannedUrl" class="text-sm text-gray-400 mt-4 text-center px-4">
          From: {{ scannedUrl }}
        </p>
      </div>
    </div>

    <!-- Instructions -->
    <div class="p-6 bg-gray-800">
      <div class="flex items-center mb-3">
        <IconQrCode class="w-5 h-5 text-blue-500 mr-2" />
        <h3 class="font-semibold">
          How to use
        </h3>
      </div>
      <ul class="text-sm text-gray-400 space-y-1">
        <li>• Point the camera at a QR code containing an update URL</li>
        <li>• The app will automatically scan and download the update</li>
        <li>• Wait for the download to complete</li>
        <li>• The app will reload with the new version</li>
      </ul>
    </div>
  </div>
</template>

<style>
/* Make WebView transparent when camera is running */
body.camera-running {
  visibility: hidden;
  --background: transparent;
  --ion-background-color: transparent;
}

/* Show only the camera modal */
body.camera-running .camera-modal {
  visibility: visible;
}

/* Ensure camera modal has transparent background */
.camera-modal {
  --background: transparent;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  body.camera-running {
    --background: transparent;
    --ion-background-color: transparent;
  }

  .camera-modal {
    --background: transparent;
    --ion-background-color: transparent;
  }
}
</style>

<route lang="yaml">
meta:
  layout: naked
</route>
