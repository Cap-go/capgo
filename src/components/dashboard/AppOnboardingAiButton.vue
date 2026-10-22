<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import IconCopy from '~icons/ion/copy-outline'

const emit = defineEmits<{
  copy: []
}>()

const { t } = useI18n()
</script>

<template>
  <button type="button" class="d-btn d-btn-ghost h-auto min-h-11 gap-2 rounded-lg border-slate-200 bg-transparent px-3 py-2 text-sm font-medium text-slate-600 shadow-none hover:border-slate-300 hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-azure-500 focus-visible:ring-offset-2 dark:border-white/15 dark:text-slate-300 dark:hover:border-white/25 dark:hover:bg-white/5 dark:hover:text-white dark:focus-visible:ring-offset-slate-900 shrink-0" data-test="setup-checklist-copy-ai" @click="emit('copy')">
    <IconCopy class="h-4 w-4 shrink-0" aria-hidden="true" />
    {{ t('setup-checklist-ai-action') }}
  </button>
</template>
