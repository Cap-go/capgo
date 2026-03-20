<script setup lang="ts">
import type { WatchStopHandle } from 'vue'
import type { DialogV2Button } from '~/stores/dialogv2'
import { onMounted, onUnmounted, watch } from 'vue'
import { useDialogV2Store } from '~/stores/dialogv2'

const dialogStore = useDialogV2Store()
const route = useRoute()

let escapeHandler: ((event: KeyboardEvent) => void) | null = null
let stopRouteWatch: WatchStopHandle | undefined

function normalizeRel(rel?: string, target?: string) {
  const tokens = rel ? rel.split(/[\s,]+/).filter(Boolean) : []
  const relSet = new Set(tokens)
  if (target === '_blank')
    relSet.add('noopener')
  if (relSet.size === 0)
    return undefined
  return Array.from(relSet).join(' ')
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
}

function close(button?: DialogV2Button) {
  dialogStore.closeDialog(button)
}

function handleButtonClick(button: DialogV2Button, event?: Event) {
  if (button.disabled) {
    event?.preventDefault()
    return
  }

  const safeButton: DialogV2Button = {
    ...button,
    rel: normalizeRel(button.rel, button.target),
  }

  const mouseEvent = event instanceof MouseEvent ? event : undefined
  const hasModifier = !!(mouseEvent && (mouseEvent.metaKey || mouseEvent.ctrlKey || mouseEvent.shiftKey || mouseEvent.altKey))
  const isModifiedLinkClick = !!(button.href && mouseEvent && (mouseEvent.button !== 0 || hasModifier))

  if (isModifiedLinkClick) {
    close({ ...safeButton, skipNavigation: true })
    return
  }

  const shouldPreventNavigation = button.href && (!mouseEvent || (mouseEvent.button === 0 && !hasModifier))
  if (shouldPreventNavigation)
    event?.preventDefault()

  close(safeButton)
}

onMounted(() => {
  // Close dialog on route change
  stopRouteWatch = watch(route, () => {
    if (dialogStore.showDialog) {
      dialogStore.closeDialog()
    }
  })

  // Close dialog on Escape key
  escapeHandler = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && dialogStore.showDialog && !dialogStore.dialogOptions?.preventAccidentalClose) {
      dialogStore.closeDialog()
    }
  }
  addEventListener('keydown', escapeHandler)
})

onUnmounted(() => {
  stopRouteWatch?.()
  stopRouteWatch = undefined

  if (escapeHandler) {
    removeEventListener('keydown', escapeHandler)
    escapeHandler = null
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="dialogStore.showDialog" class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- Backdrop -->
      <div
        class="fixed inset-0 bg-black/50"
        :class="{ 'cursor-pointer': !dialogStore.dialogOptions?.preventAccidentalClose }"
        @click="!dialogStore.dialogOptions?.preventAccidentalClose && close()"
      />

      <!-- Dialog -->
      <div
        data-theme="light"
        class="overflow-y-auto relative mx-4 w-full bg-white rounded-lg shadow-xl max-h-[90vh]"
        :class="[
          sizeClasses[dialogStore.dialogOptions?.size || 'md'],
        ]"
      >
        <!-- Close button -->
        <button
          v-if="!dialogStore.dialogOptions?.preventAccidentalClose"
          class="absolute z-10 text-2xl text-black top-4 right-4 hover:text-white hover:bg-gray-500 d-btn d-btn-sm d-btn-circle d-btn-ghost"
          @click="close()"
        >
          ✕
        </button>

        <!-- Header -->
        <div v-if="dialogStore.dialogOptions?.title" class="px-6 pt-6 pb-2">
          <h3 class="text-lg font-bold text-gray-900">
            {{ dialogStore.dialogOptions.title }}
          </h3>
        </div>

        <!-- Content -->
        <div class="px-6" :class="{ 'pt-6': !dialogStore.dialogOptions?.title }">
          <!-- Default description -->
          <div v-if="dialogStore.dialogOptions?.description" class="pb-4">
            <p class="text-base text-gray-500 whitespace-pre-wrap break-all">
              {{ dialogStore.dialogOptions.description }}
            </p>
          </div>

          <!-- Teleport target for custom content -->
          <div id="dialog-v2-content" class="pb-4 text-gray-500" />
        </div>

        <!-- Buttons -->
        <div v-if="dialogStore.dialogOptions?.buttons?.length" class="px-6 pb-6">
          <div class="flex justify-end space-x-2">
            <template v-for="(button, i) in dialogStore.dialogOptions.buttons" :key="i">
              <button
                v-if="!button.href"
                type="button"
                :class="{
                  'd-btn d-btn-primary': button.role === 'primary',
                  'd-btn d-btn-secondary': button.role === 'secondary',
                  'd-btn d-btn-warning': button.role === 'danger',
                  'd-btn d-btn-outline': button.role === 'cancel',
                  'd-btn': !button.role,
                  'cursor-pointer!': !button.disabled,
                  'opacity-70 cursor-not-allowed': button.disabled,
                }"
                :disabled="button.disabled"
                @click="handleButtonClick(button, $event)"
              >
                {{ button.text }}
              </button>

              <a
                v-else
                :href="button.href"
                :target="button.target"
                :rel="normalizeRel(button.rel, button.target)"
                :class="{
                  'd-btn d-btn-primary': button.role === 'primary',
                  'd-btn d-btn-secondary': button.role === 'secondary',
                  'd-btn d-btn-warning': button.role === 'danger',
                  'd-btn d-btn-outline': button.role === 'cancel',
                  'd-btn': !button.role,
                  'cursor-pointer!': !button.disabled,
                  'opacity-70 cursor-not-allowed': button.disabled,
                  'pointer-events-none': button.disabled,
                }"
                :aria-disabled="button.disabled || undefined"
                :tabindex="button.disabled ? -1 : undefined"
                @click="handleButtonClick(button, $event)"
              >
                {{ button.text }}
              </a>
            </template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
