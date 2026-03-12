import { acceptHMRUpdate, defineStore } from 'pinia'

export interface DialogV2Button {
  text: string
  id?: string
  href?: string
  target?: '_self' | '_blank' | '_parent' | '_top'
  rel?: string
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

  const openDialog = (options: DialogV2Options) => {
    dialogOptions.value = options
    showDialog.value = true
    dialogCanceled.value = false
  }

  const openButtonHref = (button: DialogV2Button) => {
    if (!button.href)
      return

    if (typeof window === 'undefined')
      return

    if (button.target === '_blank') {
      const relTokens = button.rel ? button.rel.split(/[\s,]+/).filter(Boolean) : []
      const features = [
        'noopener',
        ...(relTokens.includes('noreferrer') ? ['noreferrer'] : []),
      ]
      window.open(button.href, button.target, features.join(','))
      return
    }

    if (button.target && button.target !== '_self')
      window.open(button.href, button.target)
    else
      window.location.assign(button.href)
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

      if (!button.preventClose) {
        showDialog.value = false
      }

      if (!button.preventClose && button.href)
        openButtonHref(button)
      return
    }

    // Modal dismissed without a button action (overlay, escape, close icon)
    showDialog.value = false
  }

  const onDialogDismiss = (): Promise<boolean> => {
    return new Promise((resolve) => {
      const unwatch = watch(showDialog, (val) => {
        if (!val) {
          resolve(dialogCanceled.value)
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
