<script setup lang="ts">
// @ts-expect-error qrcode package doesn't have TypeScript definitions
import QRCode from 'qrcode'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import IconExternalLink from '~icons/lucide/external-link'
import IconSmartphone from '~icons/lucide/smartphone'

const props = defineProps<{
  appId: string
  versionId: number
}>()

const { t } = useI18n()

// Device configurations
const devices = {
  iphone: {
    name: 'iPhone',
    width: 375,
    height: 812,
    frameClass: 'rounded-[40px]',
  },
  pixel: {
    name: 'Google Pixel',
    width: 412,
    height: 915,
    frameClass: 'rounded-[30px]',
  },
}

type DeviceType = keyof typeof devices
const selectedDevice = ref<DeviceType>('iphone')
const qrCodeDataUrl = ref('')
const isMobile = ref(false)

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  generateQRCode()
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

function checkMobile() {
  isMobile.value = window.innerWidth < 768
}

const currentDevice = computed(() => devices[selectedDevice.value])

// Build the preview URL using subdomain format (no auth - relies on obscure subdomain)
const previewUrl = computed(() => {
  // Encode app_id: lowercase for DNS, replace . with __ (underscores work in practice)
  const encodedAppId = props.appId.toLowerCase().replace(/\./g, '__')
  const subdomain = `${encodedAppId}-${props.versionId}`
  // Extract base domain from current host, default to capgo.app for localhost
  // Preserve environment segments (e.g., 'dev' in console.dev.capgo.app)
  const hostname = window.location.hostname
  let baseDomain = 'capgo.app'
  if (hostname.includes('.') && hostname !== '127.0.0.1') {
    const hostParts = hostname.split('.')
    // Check if hostname contains an env segment (dev, preprod, staging, etc.)
    const envSegments = ['dev', 'preprod', 'staging']
    const hasEnvSegment = hostParts.length > 2 && envSegments.some(env => hostParts.includes(env))
    baseDomain = hasEnvSegment ? hostParts.slice(-3).join('.') : hostParts.slice(-2).join('.')
  }
  return `https://${subdomain}.preview.${baseDomain}/`
})

// Generate QR code linking to the preview URL
async function generateQRCode() {
  try {
    qrCodeDataUrl.value = await QRCode.toDataURL(previewUrl.value, {
      width: 150,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
  }
  catch (error) {
    console.error('Failed to generate QR code:', error)
  }
}

// Watch for URL changes to regenerate QR
watch(previewUrl, generateQRCode)

function openExternal() {
  window.open(previewUrl.value, '_blank')
}
</script>

<template>
  <div class="relative w-full h-full p-4 md:p-8">
    <!-- Open in external button -->
    <button
      class="absolute top-4 right-4 z-10 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      :title="t('open-in-external')"
      @click="openExternal"
    >
      <IconExternalLink class="w-5 h-5" />
    </button>

    <!-- Main content container -->
    <div class="flex items-center justify-center gap-8 h-full">
      <!-- Device frame -->
      <div class="flex flex-col items-center">
        <!-- Device selector -->
        <div class="mb-4 flex items-center gap-2">
          <button
            class="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors"
            :class="selectedDevice === 'iphone'
              ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'"
            @click="selectedDevice = 'iphone'"
          >
            <IconSmartphone class="w-4 h-4" />
            {{ t('device-iphone') }}
          </button>
          <button
            class="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors"
            :class="selectedDevice === 'pixel'
              ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'"
            @click="selectedDevice = 'pixel'"
          >
            <IconSmartphone class="w-4 h-4" />
            {{ t('device-pixel') }}
          </button>
        </div>

        <!-- Phone frame -->
        <div
          class="relative bg-gray-900 p-3 shadow-2xl"
          :class="currentDevice.frameClass"
          :style="{
            width: `${currentDevice.width + 24}px`,
            height: `${Math.min(currentDevice.height + 24, 700)}px`,
          }"
        >
          <!-- Notch (for iPhone) -->
          <div
            v-if="selectedDevice === 'iphone'"
            class="absolute top-3 left-1/2 transform -translate-x-1/2 w-32 h-7 bg-gray-900 rounded-b-2xl z-10"
          />

          <!-- Screen -->
          <div
            class="w-full h-full bg-white overflow-hidden"
            :class="currentDevice.frameClass.replace('40', '35').replace('30', '25')"
          >
            <iframe
              :src="previewUrl"
              class="w-full h-full border-0"
              :style="{
                width: `${currentDevice.width}px`,
                height: '100%',
              }"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone"
            />
          </div>
        </div>
      </div>

      <!-- QR Code section (desktop only) -->
      <div
        v-if="!isMobile && qrCodeDataUrl"
        class="flex flex-col items-center p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg"
      >
        <img
          :src="qrCodeDataUrl"
          alt="QR Code to preview on phone"
          class="w-36 h-36 mb-3"
        >
        <p class="text-sm text-gray-600 dark:text-gray-400 text-center max-w-40">
          {{ t('scan-qr-to-preview') }}
        </p>
      </div>
    </div>
  </div>
</template>
