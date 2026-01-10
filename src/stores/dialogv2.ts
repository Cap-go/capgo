import type { WatchStopHandle } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'

export interface DialogV2Button {
  text: string
  id?: string
  handler?: () => void | boolean | Promise<void | boolean>
  role?: 'primary' | 'secondary' | 'danger' | 'cancel'
  preventClose?: boolean
  disabled?: boolean
}

export interface DialogV2Options {
  id?: string
  title?: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  buttons?: DialogV2Button[]
  preventAccidentalClose?: boolean
}

export const useDialogV2Store = defineStore('dialogv2', () => {
  const showDialog = ref(false)
  const dialogOptions = ref<DialogV2Options>({})
  const dialogCanceled = ref(false)
  const lastButtonRole = ref('')

  // Store the dismiss watcher cleanup function
  let _unwatchDismiss: WatchStopHandle | null = null

  const openDialog = (options: DialogV2Options) => {
    dialogOptions.value = options
    showDialog.value = true
    dialogCanceled.value = false
  }

  const closeDialog = async (button?: DialogV2Button) => {
    if (button) {
      lastButtonRole.value = button.id ?? button.role ?? ''
      if (button.role === 'cancel') {
        dialogCanceled.value = true
      }
      else {
        dialogCanceled.value = false
      }

      if (button.handler) {
        const result = await button.handler()
        // If handler returns false, don't close the dialog
        if (result === false) {
          return
        }
      }
    }
    else {
      // Dialog was dismissed without a button (ESC, backdrop, X button)
      dialogCanceled.value = true
    }

    if (!button?.preventClose) {
      showDialog.value = false
    }
  }

  const onDialogDismiss = (): Promise<boolean> => {
    return new Promise((resolve) => {
      // Clean up any existing dismiss watcher
      _unwatchDismiss?.()

      // If dialog is already closed, resolve immediately
      if (!showDialog.value) {
        _unwatchDismiss = null
        resolve(dialogCanceled.value)
        return
      }

      _unwatchDismiss = watch(showDialog, (val) => {
        if (!val) {
          _unwatchDismiss?.()
          _unwatchDismiss = null
          resolve(dialogCanceled.value)
        }
      })
    })
  }

  return {
    showDialog,
    dialogOptions,
    dialogCanceled,
    lastButtonRole,
    openDialog,
    closeDialog,
    onDialogDismiss,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useDialogV2Store, import.meta.hot))
