<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import IconAlertTriangle from '~icons/lucide/alert-triangle'
import IconLoader from '~icons/lucide/loader-2'

const props = defineProps<{
  skipping: boolean
  testId: string
  /** False for steps that must be done, e.g. creating a channel. */
  skippable: boolean
}>()

const emit = defineEmits<{
  skip: [reason: string]
}>()

const { t } = useI18n()
const fieldId = useId()
const asking = ref(false)
const reason = ref('')
const input = ref<HTMLTextAreaElement>()
// Matches the backend minimum so the request cannot be rejected for length.
const canSkip = computed(() => reason.value.trim().length >= 3)

async function ask() {
  asking.value = true
  await nextTick()
  input.value?.focus()
}

function cancel() {
  if (props.skipping)
    return
  asking.value = false
  reason.value = ''
}

function submit() {
  if (canSkip.value)
    emit('skip', reason.value.trim())
}
</script>

<template>
  <!-- Required steps: short note only. Skippable: a Skip button until the user opens the reason form. -->
  <div v-if="!skippable" class="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-400/30 dark:bg-amber-500/10" :data-test="`${testId}-missed-step`">
    <p class="flex items-start gap-3 text-sm leading-6 text-slate-700 dark:text-slate-300">
      <IconAlertTriangle class="mt-1 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      {{ t('setup-checklist-missed-step-required-note') }}
    </p>
  </div>

  <div v-else-if="!asking" class="mt-5" :data-test="`${testId}-missed-step`">
    <button type="button" class="d-btn h-auto min-h-11 border-slate-300 bg-white px-4 text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-white/20 dark:bg-slate-900 dark:text-slate-200" :data-test="`${testId}-skip-step`" @click="ask">
      {{ t('setup-checklist-skip-step') }}
    </button>
  </div>

  <form v-else class="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-400/30 dark:bg-amber-500/10" :data-test="`${testId}-missed-step`" @submit.prevent="submit">
    <label :for="fieldId" class="block text-sm font-medium text-slate-800 dark:text-slate-200">
      {{ t('setup-checklist-skip-reason-label') }}
    </label>
    <textarea
      :id="fieldId"
      ref="input"
      v-model="reason"
      rows="2"
      minlength="3"
      maxlength="500"
      required
      class="d-textarea mt-2 w-full border-slate-300 bg-white text-base text-slate-900 dark:border-white/20 dark:bg-slate-900 dark:text-white"
      :placeholder="t('setup-checklist-skip-reason-placeholder')"
      :aria-describedby="`${fieldId}-help`"
      :data-test="`${testId}-skip-reason`"
      @keydown.esc="cancel"
    />
    <p :id="`${fieldId}-help`" class="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
      {{ t('setup-checklist-skip-reason-help') }}
    </p>
    <div class="mt-3 flex flex-wrap gap-3">
      <button type="submit" class="d-btn h-auto min-h-11 border-slate-800 bg-slate-800 px-4 text-white hover:border-slate-900 hover:bg-slate-900 disabled:opacity-50 dark:border-white/20 dark:bg-white dark:text-slate-900" :disabled="skipping || !canSkip" :data-test="`${testId}-skip-confirm`">
        <IconLoader v-if="skipping" class="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
        {{ t('setup-checklist-skip-confirm') }}
      </button>
      <button type="button" class="d-btn d-btn-ghost min-h-11 px-4 text-slate-700 dark:text-slate-200" :disabled="skipping" @click="cancel">
        {{ t('setup-checklist-skip-cancel') }}
      </button>
    </div>
  </form>
</template>
