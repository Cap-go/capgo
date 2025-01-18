import type { Database } from '~/types/supabase.types'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref, watch } from 'vue'

export interface ActionSheetOptionButton {
  text: string
  id?: string
  selected?: boolean
  handler?: () => void
  role?: string
  preventClose?: boolean
}
export interface ActionSheetOption {
  header?: string
  message?: string
  image?: string
  headerStyle?: string
  textStyle?: string
  input?: boolean
  size?: string
  buttonCenter?: boolean
  buttonVertical?: boolean
  preventAccidentalClose?: boolean
  checkboxText?: string
  listOrganizations?: boolean
  buttons?: ActionSheetOptionButton[]
}

export interface AppPreviewOptions {
  appId: string
  version: Database['public']['Tables']['app_versions']['Row']
}

export const useDisplayStore = defineStore('display', () => {
  const dialogOption = ref<ActionSheetOption>()
  const toastOption = ref<ActionSheetOption>()
  const dialogCanceled = ref<boolean>(false)
  const showDialog = ref<boolean>(false)
  const showBundleLinkDialogChannel = ref<Database['public']['Tables']['channels']['Row'] | null>(null)
  const showBundleLinkDialogCallbacks = ref<{
    onUnlink: () => Promise<void>
    onRevert: () => Promise<void>
    onLink: (appVersion: Database['public']['Tables']['app_versions']['Row']) => Promise<void>
  }>({
        onUnlink: () => Promise.resolve(),
        onRevert: () => Promise.resolve(),
        onLink: () => Promise.resolve(),
      })
  const NavTitle = ref<string>('')
  const defaultBack = ref<string>('')
  const messageToast = ref<string[]>([])
  const durationToast = ref<number>(2000)
  const lastButtonRole = ref<string>('')
  const selectedOrganizations = ref<string[]>([])
  const dialogInputText = ref('')
  const dialogCheckbox = ref<boolean>(false)
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

  return {
    onDialogDismiss,
    dialogCanceled,
    dialogOption,
    toastOption,
    messageToast,
    durationToast,
    showDialog,
    lastButtonRole,
    NavTitle,
    defaultBack,
    dialogInputText,
    dialogCheckbox,
    selectedOrganizations,
    showBundleLinkDialogChannel,
    showBundleLinkDialogCallbacks,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useDisplayStore, import.meta.hot))
