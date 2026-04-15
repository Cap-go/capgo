<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import IconBookOpen from '~icons/lucide/book-open'
import IconRocket from '~icons/lucide/rocket'
import IconAndroid from '~icons/mdi/android'
import IconApple from '~icons/mdi/apple'

const emit = defineEmits<{
  (e: 'startIosOnboarding'): void
}>()

const { t } = useI18n()

const IOS_DOCS_URL = 'https://capgo.app/docs/cli/cloud-build/ios/'
const ANDROID_DOCS_URL = 'https://capgo.app/docs/cli/cloud-build/android/'

function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <section class="py-12 sm:py-16 lg:py-20 bg-slate-100 dark:bg-slate-900">
    <div class="px-4 mx-auto max-w-5xl sm:px-6 lg:px-8">
      <div class="text-center">
        <h2 class="text-3xl font-bold text-gray-900 sm:text-4xl dark:text-gray-50 font-pj">
          {{ t('build-setup-invite-title') }}
        </h2>
        <p class="mx-auto mt-4 max-w-2xl text-lg font-normal text-gray-600 dark:text-gray-200 font-pj">
          {{ t('build-setup-invite-subtitle') }}
        </p>
      </div>

      <div class="grid gap-6 mt-12 md:grid-cols-2">
        <!-- iOS card -->
        <div class="flex flex-col p-6 bg-white rounded-2xl border shadow-sm dark:bg-slate-800 dark:border-slate-700">
          <div class="flex gap-4 items-center">
            <div class="inline-flex justify-center items-center w-12 h-12 text-white rounded-xl bg-muted-blue-800">
              <IconApple class="w-7 h-7" />
            </div>
            <h3 class="text-2xl font-semibold text-gray-900 dark:text-gray-50 font-pj">
              {{ t('build-setup-invite-ios-title') }}
            </h3>
          </div>
          <p class="mt-4 text-gray-600 dark:text-gray-300">
            {{ t('build-setup-invite-ios-description') }}
          </p>
          <div class="flex flex-col gap-3 mt-6 sm:flex-row">
            <button
              class="flex-1 d-btn d-btn-outline"
              @click="openExternal(IOS_DOCS_URL)"
            >
              <IconBookOpen class="mr-2 w-5 h-5" />
              {{ t('read-the-documentation') }}
            </button>
            <button
              class="flex-1 text-white d-btn d-btn-primary"
              @click="emit('startIosOnboarding')"
            >
              <IconRocket class="mr-2 w-5 h-5" />
              {{ t('start-onboarding') }}
            </button>
          </div>
        </div>

        <!-- Android card -->
        <div class="flex flex-col p-6 bg-white rounded-2xl border shadow-sm dark:bg-slate-800 dark:border-slate-700">
          <div class="flex gap-4 items-center">
            <div class="inline-flex justify-center items-center w-12 h-12 text-white rounded-xl bg-muted-blue-800">
              <IconAndroid class="w-7 h-7" />
            </div>
            <h3 class="text-2xl font-semibold text-gray-900 dark:text-gray-50 font-pj">
              {{ t('build-setup-invite-android-title') }}
            </h3>
          </div>
          <p class="mt-4 text-gray-600 dark:text-gray-300">
            {{ t('build-setup-invite-android-description') }}
          </p>
          <div class="flex mt-6">
            <button
              class="flex-1 d-btn d-btn-outline"
              @click="openExternal(ANDROID_DOCS_URL)"
            >
              <IconBookOpen class="mr-2 w-5 h-5" />
              {{ t('read-the-documentation') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
