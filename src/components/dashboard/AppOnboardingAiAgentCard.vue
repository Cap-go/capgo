<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import IconCopy from '~icons/ion/copy-outline'
import IconSparkles from '~icons/lucide/sparkles'

const emit = defineEmits<{
  copy: []
}>()

const { t } = useI18n()
</script>

<template>
  <section class="flex flex-col gap-4 rounded-2xl border border-azure-500/40 bg-azure-500/5 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-azure-500/30 dark:bg-azure-500/10" data-test="setup-checklist-ai-agent">
    <div class="flex items-start gap-3">
      <IconSparkles class="mt-0.5 h-5 w-5 shrink-0 text-sky-700 dark:text-azure-300" aria-hidden="true" />
      <div>
        <h2 class="font-semibold text-slate-950 dark:text-white">
          {{ t('setup-checklist-ai-agent-title') }}
        </h2>
        <p class="mt-1 max-w-prose text-sm leading-6 text-slate-600 dark:text-slate-300">
          {{ t('setup-checklist-ai-agent-description') }}
        </p>
      </div>
    </div>
    <button type="button" class="d-btn h-auto min-h-12 shrink-0 border-azure-500 bg-white px-4 text-sky-700 hover:border-azure-600 hover:bg-azure-500/5 focus-visible:ring-2 focus-visible:ring-azure-500 focus-visible:ring-offset-2 dark:bg-slate-900 dark:text-azure-300 dark:hover:bg-azure-500/10" data-test="setup-checklist-ai-agent-copy" @click="emit('copy')">
      <IconCopy class="h-4 w-4 shrink-0" aria-hidden="true" />
      {{ t('setup-checklist-ai-action') }}
    </button>
  </section>
</template>
