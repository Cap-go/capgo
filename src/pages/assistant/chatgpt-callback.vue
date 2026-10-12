<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ASSISTANT_OPEN_AFTER_CONNECT_KEY, completeChatGptConnect } from '~/services/assistant'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const failed = ref(false)

function queryValue(name: string): string {
  const value = route.query[name]
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' ? raw : ''
}

onMounted(async () => {
  const code = queryValue('code')
  const state = queryValue('state')
  if (queryValue('error') || !code || !state) {
    // access_denied or a broken redirect: never exchange anything, just go back.
    failed.value = !!queryValue('error') && queryValue('error') !== 'access_denied'
    if (!failed.value)
      router.replace('/dashboard')
    return
  }
  try {
    const result = await completeChatGptConnect(code, state)
    sessionStorage.setItem(ASSISTANT_OPEN_AFTER_CONNECT_KEY, '1')
    router.replace(result.returnTo)
  }
  catch (error) {
    console.error('Cannot complete ChatGPT sign-in', error)
    failed.value = true
  }
})
</script>

<template>
  <main class="flex min-h-full items-center justify-center bg-slate-100 px-4 py-10 dark:bg-slate-900">
    <section class="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <template v-if="failed">
        <p class="text-base font-semibold text-slate-900 dark:text-white">
          {{ t('assistant-chatgpt-callback-failed') }}
        </p>
        <RouterLink to="/dashboard" class="d-btn d-btn-primary mt-4">
          {{ t('assistant-chatgpt-callback-back') }}
        </RouterLink>
      </template>
      <div v-else role="status" class="flex items-center justify-center gap-3 text-slate-600 dark:text-slate-300">
        <span class="d-loading d-loading-spinner d-loading-md" aria-hidden="true" />
        <span>{{ t('assistant-chatgpt-callback-loading') }}</span>
      </div>
    </section>
  </main>
</template>

<route lang="yaml">
meta:
  layout: naked
</route>
