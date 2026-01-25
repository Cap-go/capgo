<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import IconLoader from '~icons/lucide/loader-2'

const route = useRoute()
const isRedirecting = ref(true)
const error = ref('')

// Common multi-part TLD suffixes that require 3 labels for the registrable domain
// This prevents open redirect vulnerabilities for domains like 'example.co.uk'
const MULTI_PART_TLD_SUFFIXES = new Set([
  'co.uk',
  'gov.uk',
  'ac.uk',
  'org.uk',
  'net.uk',
  'me.uk',
  'ltd.uk',
  'plc.uk',
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'gov.au',
  'asn.au',
  'id.au',
  'co.nz',
  'net.nz',
  'org.nz',
  'govt.nz',
  'ac.nz',
  'school.nz',
  'com.br',
  'net.br',
  'org.br',
  'gov.br',
  'edu.br',
  'co.jp',
  'ne.jp',
  'or.jp',
  'ac.jp',
  'go.jp',
  'co.kr',
  'ne.kr',
  'or.kr',
  'go.kr',
  'ac.kr',
  'com.cn',
  'net.cn',
  'org.cn',
  'gov.cn',
  'edu.cn',
  'co.in',
  'net.in',
  'org.in',
  'gov.in',
  'ac.in',
  'com.mx',
  'net.mx',
  'org.mx',
  'gob.mx',
  'edu.mx',
  'co.za',
  'net.za',
  'org.za',
  'gov.za',
  'edu.za',
  'com.sg',
  'net.sg',
  'org.sg',
  'gov.sg',
  'edu.sg',
  'com.hk',
  'net.hk',
  'org.hk',
  'gov.hk',
  'edu.hk',
  'co.id',
  'or.id',
  'ac.id',
  'go.id',
  'web.id',
  'com.tw',
  'net.tw',
  'org.tw',
  'gov.tw',
  'edu.tw',
  'com.my',
  'net.my',
  'org.my',
  'gov.my',
  'edu.my',
  'co.th',
  'or.th',
  'ac.th',
  'go.th',
  'in.th',
  'com.ph',
  'net.ph',
  'org.ph',
  'gov.ph',
  'edu.ph',
  'com.vn',
  'net.vn',
  'org.vn',
  'gov.vn',
  'edu.vn',
  'co.il',
  'org.il',
  'ac.il',
  'gov.il',
  'net.il',
  'com.tr',
  'net.tr',
  'org.tr',
  'gov.tr',
  'edu.tr',
  'com.pl',
  'net.pl',
  'org.pl',
  'gov.pl',
  'edu.pl',
  'com.ar',
  'net.ar',
  'org.ar',
  'gov.ar',
  'edu.ar',
  'com.co',
  'net.co',
  'org.co',
  'gov.co',
  'edu.co',
])

function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

// Get the registrable domain (eTLD+1) from a hostname
// Handles multi-part TLDs like 'co.uk' correctly
function getBaseDomain(hostname: string): string {
  if (isLocalhost(hostname))
    return hostname

  const parts = hostname.split('.')
  if (parts.length < 2)
    return hostname

  const lastTwo = parts.slice(-2).join('.')

  // For multi-part TLDs (e.g., 'console.example.co.uk'), we need 3 labels
  if (parts.length >= 3 && MULTI_PART_TLD_SUFFIXES.has(lastTwo))
    return parts.slice(-3).join('.')

  // Standard TLDs: extract the last 2 parts (e.g., 'capgo.app')
  return lastTwo
}

function getAppBaseDomain(): string {
  try {
    const appUrl = new URL(import.meta.env.VITE_APP_URL || window.location.origin)
    return getBaseDomain(appUrl.hostname)
  }
  catch (err) {
    console.error('[confirm-signup] Failed to parse VITE_APP_URL, falling back to window.location.hostname:', err)
    return getBaseDomain(window.location.hostname)
  }
}

const baseDomain = getAppBaseDomain()

function isAllowedHost(hostname: string) {
  // Allow exact base domain match (e.g., 'capgo.app')
  if (hostname === baseDomain)
    return true
  // Allow any subdomain (e.g., '*.capgo.app')
  return hostname.endsWith(`.${baseDomain}`)
}

function isAllowedConfirmationUrl(urlValue: string) {
  const url = new URL(urlValue, window.location.origin)
  if (import.meta.env.DEV) {
    if (isLocalhost(url.hostname))
      return true
  }
  if (url.protocol !== 'https:')
    return false
  return isAllowedHost(url.hostname)
}
onMounted(() => {
  const confirmationUrl = route.query.confirmation_url as string

  if (!confirmationUrl) {
    isRedirecting.value = false
    error.value = 'Invalid confirmation URL. Please check your email link.'
    return
  }

  try {
    // Decode the URL if needed and redirect immediately
    const decodedUrl = decodeURIComponent(confirmationUrl)
    if (!isAllowedConfirmationUrl(decodedUrl)) {
      isRedirecting.value = false
      error.value = 'Invalid confirmation URL. Please check your email link.'
      return
    }
    window.location.href = decodedUrl
  }
  catch {
    isRedirecting.value = false
    error.value = 'Error redirecting to confirmation page. Please try again.'
  }
})
</script>

<template>
  <div class="flex flex-col justify-center items-center p-4 min-h-screen bg-gray-50">
    <div class="p-8 space-y-6 w-full max-w-md bg-white rounded-lg shadow-lg">
      <div class="text-center">
        <h1 class="text-2xl font-bold text-gray-900">
          Email Confirmation
        </h1>

        <div v-if="isRedirecting" class="mt-6 space-y-4">
          <div class="flex justify-center">
            <IconLoader class="w-10 h-10 text-blue-500 animate-spin" />
          </div>
          <p class="text-gray-700">
            Redirecting to confirmation page...
          </p>
          <p class="text-sm text-gray-500">
            Please wait while we redirect you to confirm your email address.
          </p>
        </div>

        <div v-else class="mt-6 space-y-4">
          <p class="font-medium text-red-600">
            {{ error }}
          </p>
          <p class="text-gray-700">
            If you continue to have trouble, please contact support.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
