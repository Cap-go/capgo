import { acceptHMRUpdate, defineStore } from 'pinia'

export interface DialogV2Button {
  text: string
  id?: string
  handler?: () => void
  role?: 'primary' | 'secondary' | 'danger' | 'cancel'
  preventClose?: boolean
}

export interface DialogV2Options {
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

  const openDialog = (options: DialogV2Options) => {
    dialogOptions.value = options
    showDialog.value = true
    dialogCanceled.value = false
  }

  const closeDialog = (button?: DialogV2Button) => {
    if (!button?.preventClose) {
      showDialog.value = false
    }

    if (button) {
      lastButtonRole.value = button.id ?? button.role ?? ''
      if (button.role === 'cancel') {
        dialogCanceled.value = true
      }
      else {
        dialogCanceled.value = false
      }

      if (button.handler) {
        button.handler()
      }
    }
  }

  const onDialogDismiss = (): Promise<boolean> => {
    return new Promise((resolve) => {
      const unwatch = watch(showDialog, (val) => {
        if (!val) {
          closeDialog()
          unwatch()
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
