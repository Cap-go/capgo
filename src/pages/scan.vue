<script setup lang="ts">
import type { DownloadEvent } from '@capgo/capacitor-updater'
// @ts-expect-error - barcode scanner module may not be available in all environments
import { CapacitorBarcodeScanner } from '@capacitor/barcode-scanner'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
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
  if (downloadListener) {
    downloadListener.remove()
  }
})

async function startScanner() {
  try {
    isScanning.value = true
    errorMessage.value = ''

    const result = await CapacitorBarcodeScanner.scanBarcode({
      hint: 0, // QR_CODE
    })

    isScanning.value = false

    if (result.ScanResult) {
      await handleBarcodeScan(result.ScanResult)
    }
    else {
      errorMessage.value = 'No barcode detected'
    }
  }
  catch (error) {
    console.error('Failed to scan:', error)
    errorMessage.value = 'Failed to start scanner. Please check permissions.'
    isScanning.value = false
  }
}

async function handleBarcodeScan(scannedValue: string) {
  // Check if the scanned value is a valid URL
  if (!URL.canParse(scannedValue)) {
    toast.error('Scanned value is not a valid URL')
    return
  }

  scannedUrl.value = scannedValue
  await downloadUpdate(scannedValue)
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
  router.back()
}
</script>

<template>
  <div class="min-h-screen text-white bg-gray-900 camera-modal">
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
      <div v-if="isScanning" class="relative w-full bg-black rounded-lg h-96">
        <!-- Scanning instructions -->
        <div class="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
          <div class="w-64 h-64 border-2 border-white border-dashed rounded-lg opacity-50" />
          <p class="px-4 mt-4 text-center text-white">
            Point your camera at a QR code containing an update URL
          </p>
        </div>

        <!-- Corner decorators -->
        <div class="absolute z-10 w-64 h-64 transform -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2">
          <div class="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
          <div class="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
          <div class="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
          <div class="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
        </div>
      </div>

      <!-- Error State -->
      <div v-if="errorMessage && !isScanning" class="flex flex-col items-center justify-center p-8 h-96">
        <IconQrCode class="w-16 h-16 mb-4 text-gray-500" />
        <p class="mb-4 text-center text-gray-400">
          {{ errorMessage }}
        </p>
        <button
          class="px-6 py-3 text-white transition-colors bg-blue-600 rounded-lg hover:bg-blue-700"
          @click="retryScanning"
        >
          Retry Scanning
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black bg-opacity-75">
        <IconDownload class="w-16 h-16 mb-4 text-blue-500 animate-bounce" />
        <h3 class="mb-2 text-xl font-semibold">
          Downloading Update
        </h3>
        <p class="mb-4 text-gray-400">
          {{ Math.round(downloadProgress) }}%
        </p>

        <!-- Progress Bar -->
        <div class="w-64 h-3 overflow-hidden bg-gray-700 rounded-full">
          <div
            class="h-full transition-all duration-300 ease-out bg-blue-500"
            :style="{ width: `${downloadProgress}%` }"
          />
        </div>

        <p v-if="scannedUrl" class="px-4 mt-4 text-sm text-center text-gray-400">
          From: {{ scannedUrl }}
        </p>
      </div>
    </div>

    <!-- Instructions -->
    <div class="p-6 bg-gray-800">
      <div class="flex items-center mb-3">
        <IconQrCode class="w-5 h-5 mr-2 text-blue-500" />
        <h3 class="font-semibold">
          How to use
        </h3>
      </div>
      <ul class="space-y-1 text-sm text-gray-400">
        <li>• Point the camera at a QR code containing an update URL</li>
        <li>• The app will automatically scan and download the update</li>
        <li>• Wait for the download to complete</li>
        <li>• The app will reload with the new version</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
</style>

<route lang="yaml">
meta:
  layout: naked
</route>
