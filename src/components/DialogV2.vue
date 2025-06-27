<script setup lang="ts">
import { onMounted, watch } from 'vue'
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

onMounted(() => {
  // Close dialog on route change
  watch(route, () => {
    if (dialogStore.showDialog) {
      dialogStore.closeDialog()
    }
  })

  // Close dialog on Escape key
  addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape' && dialogStore.showDialog && !dialogStore.dialogOptions?.preventAccidentalClose) {
      dialogStore.closeDialog()
    }
  })
})
</script>

<template>
  <Teleport to="body">
    <div v-if="dialogStore.showDialog" class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- Backdrop -->
      <div
        class="fixed inset-0 bg-black/50"
        @click="!dialogStore.dialogOptions?.preventAccidentalClose && close()"
      />

      <!-- Dialog -->
      <div
        class="relative bg-white dark:bg-base-200 rounded-lg shadow-xl max-h-[90vh] overflow-y-auto w-full mx-4"
        :class="[
          sizeClasses[dialogStore.dialogOptions?.size || 'md'],
        ]"
      >
        <!-- Close button -->
        <button
          v-if="!dialogStore.dialogOptions?.preventAccidentalClose"
          class="absolute top-4 right-4 btn btn-sm btn-circle btn-ghost z-10 text-black dark:text-white hover:text-white hover:bg-gray-500 dark:hover:bg-gray-500"
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
            <p class="text-base text-gray-500 dark:text-gray-400">
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
                'btn btn-primary': button.role === 'primary',
                'btn btn-secondary': button.role === 'secondary',
                'btn btn-error': button.role === 'danger',
                'btn btn-outline text-black dark:text-white hover:text-white': button.role === 'cancel',
                'btn': !button.role,
              }"
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
