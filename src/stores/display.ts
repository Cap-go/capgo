import type { Database } from '~/types/supabase.types'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'

export const useDisplayStore = defineStore('display', () => {
  const toastOption = ref<ActionSheetOption>()
  const NavTitle = ref<string>('')
  const defaultBack = ref<string>('')
  const messageToast = ref<string[]>([])
  const durationToast = ref<number>(2000)
  const lastButtonRole = ref<string>('')
  const selectedOrganizations = ref<string[]>([])
  const selectedApps = ref<Database['public']['Tables']['apps']['Row'][]>([])

  return {
    toastOption,
    messageToast,
    durationToast,
    lastButtonRole,
    NavTitle,
    defaultBack,
    selectedApps,
    selectedOrganizations,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useDisplayStore, import.meta.hot))
