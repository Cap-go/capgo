<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import IconX from '~icons/heroicons/x-mark'

const props = withDefaults(defineProps<{
  title: string
  description?: string
  size?: 'md' | 'lg' | 'xl'
  // Block Escape/backdrop while a payment is being confirmed.
  busy?: boolean
}>(), {
  size: 'md',
  busy: false,
})

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const sizeClass = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

function requestClose() {
  if (!props.busy)
    emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape')
    requestClose()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      class="d-modal d-modal-open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="billing-modal-title"
      @click.self="requestClose"
    >
      <div
        class="d-modal-box w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        :class="sizeClass[props.size]"
      >
        <div class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
          <div class="min-w-0">
            <h2 id="billing-modal-title" class="text-lg font-semibold leading-7 text-slate-950 dark:text-white">
              {{ props.title }}
            </h2>
            <p v-if="props.description" class="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {{ props.description }}
            </p>
          </div>
          <button
            type="button"
            class="d-btn d-btn-ghost d-btn-sm d-btn-square shrink-0"
            :aria-label="t('button-cancel')"
            :disabled="props.busy"
            data-test="billing-modal-close"
            @click="requestClose"
          >
            <IconX class="h-5 w-5" />
          </button>
        </div>
        <div class="px-5 py-5 sm:px-6">
          <slot />
        </div>
        <div v-if="$slots.footer" class="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
