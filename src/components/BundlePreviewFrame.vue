<script setup lang="ts">
import QRCode from 'qrcode'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import IconExpand from '~icons/lucide/expand'
import IconMinimize from '~icons/lucide/minimize-2'
import IconSmartphone from '~icons/lucide/smartphone'
import { useSupabase } from '~/services/supabase'

const props = defineProps<{
  appId: string
  versionId: number
}>()

const { t } = useI18n()
const route = useRoute()
const supabase = useSupabase()

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
const isFullscreen = ref(false)
const qrCodeDataUrl = ref('')
const isMobile = ref(false)
const accessToken = ref('')

// Check if we're on mobile and detect fullscreen query param
onMounted(async () => {
  checkMobile()
  window.addEventListener('resize', checkMobile)

  // Check for fullscreen query param
  if (route.query.fullscreen === 'true') {
    isFullscreen.value = true
  }

  // Get access token for iframe auth
  const { data: session } = await supabase.auth.getSession()
  if (session?.session?.access_token) {
    accessToken.value = session.session.access_token
  }

  generateQRCode()
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

function checkMobile() {
  isMobile.value = window.innerWidth < 768
  // On mobile, default to fullscreen
  if (isMobile.value && !isFullscreen.value && route.query.fullscreen !== 'false') {
    isFullscreen.value = true
  }
}

const currentDevice = computed(() => devices[selectedDevice.value])

// Build the preview URL with auth token
const previewUrl = computed(() => {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL || ''
  // The preview endpoint is at /functions/v1/private/preview/:app_id/:version_id/
  // Pass token as query param since iframes can't send headers
  const tokenParam = accessToken.value ? `?token=${accessToken.value}` : ''
  return `${baseUrl}/functions/v1/private/preview/${props.appId}/${props.versionId}/${tokenParam}`
})

// Build URL for QR code (includes fullscreen param)
const fullscreenPreviewUrl = computed(() => {
  // Build the current page URL with fullscreen param
  const currentUrl = new URL(window.location.href)
  currentUrl.searchParams.set('fullscreen', 'true')
  return currentUrl.toString()
})

// Generate QR code
async function generateQRCode() {
  try {
    qrCodeDataUrl.value = await QRCode.toDataURL(fullscreenPreviewUrl.value, {
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
watch(fullscreenPreviewUrl, generateQRCode)

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
}
</script>

<template>
  <div
    class="relative w-full h-full"
    :class="isFullscreen ? 'fixed inset-0 z-50 bg-black' : 'p-4 md:p-8'"
  >
    <!-- Fullscreen toggle button -->
    <button
      class="absolute top-4 right-4 z-10 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      :title="isFullscreen ? t('exit-fullscreen') : t('fullscreen')"
      @click="toggleFullscreen"
    >
      <IconMinimize v-if="isFullscreen" class="w-5 h-5" />
      <IconExpand v-else class="w-5 h-5" />
    </button>

    <!-- Main content container -->
    <div
      class="flex items-center justify-center gap-8 h-full"
      :class="isFullscreen ? 'p-4' : ''"
    >
      <!-- Device frame (hidden in mobile fullscreen) -->
      <div
        v-if="!isFullscreen || !isMobile"
        class="flex flex-col items-center"
      >
        <!-- Device selector -->
        <div v-if="!isFullscreen" class="mb-4 flex items-center gap-2">
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
            height: isFullscreen ? '90vh' : `${Math.min(currentDevice.height + 24, 700)}px`,
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

      <!-- Fullscreen iframe (mobile) -->
      <iframe
        v-if="isFullscreen && isMobile"
        :src="previewUrl"
        class="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone"
      />

      <!-- QR Code section (desktop only, not in fullscreen) -->
      <div
        v-if="!isFullscreen && !isMobile && qrCodeDataUrl"
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
