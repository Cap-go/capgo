import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref, watch } from 'vue'

export interface ActionSheetOptionButton {
  text: string
  id?: string
  selected?: boolean
  handler?: () => void
  role?: string
}
export interface ActionSheetOption {
  header?: string
  message?: string
  buttons?: ActionSheetOptionButton[]
}

export const useDisplayStore = defineStore('display', () => {
  const actionSheetOption = ref<ActionSheetOption>()
  const dialogOption = ref<ActionSheetOption>()
  const toastOption = ref<ActionSheetOption>()
  const dialogCanceled = ref<boolean>(false)
  const actionSheetCanceled = ref<boolean>(false)
  const showActionSheet = ref<boolean>(false)
  const showDialog = ref<boolean>(false)
  const NavTitle = ref<string>('')
  const defaultBack = ref<string>('')
  const messageToast = ref<string[]>([])
  const messageLoader = ref<string>('')
  const durationToast = ref<number>(2000)
  const showLoader = ref<boolean>(false)
  const onDialogDismiss = (): Promise<boolean> => {
    // watch showDialog for changes and if false then resolve
    return new Promise((resolve) => {
      const unwatch = watch(showDialog, (val) => {
        if (!val) {
          resolve(dialogCanceled.value)
          dialogCanceled.value = false
          unwatch()
        }
      })
    })
  }
  const onActionSheetDismiss = (): Promise<boolean> => {
    // watch showDialog for changes and if false then resolve
    return new Promise((resolve) => {
      const unwatch = watch(showActionSheet, (val) => {
        if (!val) {
          resolve(actionSheetCanceled.value)
          actionSheetCanceled.value = false
          unwatch()
        }
      })
    })
  }

  return {
    actionSheetOption,
    actionSheetCanceled,
    onActionSheetDismiss,
    onDialogDismiss,
    dialogCanceled,
    dialogOption,
    toastOption,
    messageLoader,
    messageToast,
    durationToast,
    showDialog,
    showActionSheet,
    showLoader,
    NavTitle,
    defaultBack,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useDisplayStore, import.meta.hot))
