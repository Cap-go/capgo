<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="h-screen">
    <div class="h-full w-full flex items-center justify-center overflow-y-auto px-4 py-5 sm:p-6">
      <div class="max-w-sm w-full rounded-xl bg-white shadow-lg">
        <div class="px-4 py-5 sm:p-6">
          <div class="text-center">
            <svg class="mx-auto h-16 w-16 text-gray-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <p class="mt-5 text-xl font-bold text-gray-900">
              {{ t('confirm-email') }}
            </p>
            <p class="mt-3 text-sm font-medium text-gray-500">
              {{ t('check-email') }}
            </p>
            <div class="mt-8">
              <span
                class="inline-flex items-center justify-center rounded-md px-6 py-3 text-sm font-semibold leading-5 text-blue-600 transition-all duration-200"
              >
                {{ t('thank-you-for-choosi') }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
