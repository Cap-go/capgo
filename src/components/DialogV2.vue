<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useDialogV2Store } from '~/stores/dialogv2'

const dialogStore = useDialogV2Store()
const route = useRoute()

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
}

function close(button?: any) {
  dialogStore.closeDialog(button)
}

// Named handler for cleanup
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && dialogStore.showDialog && !dialogStore.dialogOptions?.preventAccidentalClose) {
    dialogStore.closeDialog()
  }
}

let unwatchRoute: (() => void) | undefined

onMounted(() => {
  // Close dialog on route change
  unwatchRoute = watch(route, () => {
    if (dialogStore.showDialog) {
      dialogStore.closeDialog()
    }
  })

  // Close dialog on Escape key
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  unwatchRoute?.()
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
        class="overflow-y-auto relative mx-4 w-full bg-white rounded-lg shadow-xl max-h-[90vh] dark:bg-base-200"
        :class="[
          sizeClasses[dialogStore.dialogOptions?.size || 'md'],
        ]"
      >
        <!-- Close button -->
        <button
          v-if="!dialogStore.dialogOptions?.preventAccidentalClose"
          class="absolute z-10 text-2xl text-black top-4 right-4 dark:text-white hover:text-white hover:bg-gray-500 d-btn d-btn-sm d-btn-circle d-btn-ghost dark:hover:bg-gray-500"
          @click="close()"
        >
          ✕
        </button>

        <!-- Header -->
        <div v-if="dialogStore.dialogOptions?.title" class="px-6 pt-6 pb-2">
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">
            {{ dialogStore.dialogOptions.title }}
          </h3>
        </div>

        <!-- Content -->
        <div class="px-6" :class="{ 'pt-6': !dialogStore.dialogOptions?.title }">
          <!-- Default description -->
          <div v-if="dialogStore.dialogOptions?.description" class="pb-4">
            <p class="text-base text-gray-500 whitespace-pre-wrap break-all dark:text-gray-400">
              {{ dialogStore.dialogOptions.description }}
            </p>
          </div>

          <!-- Teleport target for custom content -->
          <div id="dialog-v2-content" class="pb-4 text-gray-500 dark:text-gray-400" />
        </div>

        <!-- Buttons -->
        <div v-if="dialogStore.dialogOptions?.buttons?.length" class="px-6 pb-6">
          <div class="flex justify-end space-x-2">
            <button
              v-for="(button, i) in dialogStore.dialogOptions.buttons"
              :key="i"
              :class="{
                'd-btn d-btn-primary': button.role === 'primary',
                'd-btn d-btn-secondary': button.role === 'secondary',
                'd-btn d-btn-warning': button.role === 'danger',
                'd-btn d-btn-outline': button.role === 'cancel',
                'd-btn': !button.role,
                'opacity-70 cursor-not-allowed': button.disabled,
              }"
              :disabled="button.disabled"
              @click="close(button)"
            >
              {{ button.text }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
