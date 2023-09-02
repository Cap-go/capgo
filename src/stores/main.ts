import type { User } from '@supabase/supabase-js'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'
import {
  // deleteSupabaseToken,
  unspoofUser,
} from './../services/supabase'
import { useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'
import { reset } from '~/services/chatwoot'

export const useMainStore = defineStore('main', () => {
  const auth = ref<User | undefined>()
  const path = ref('')
  const user = ref<Database['public']['Tables']['users']['Row']>()
  const cycleInfo = ref<{
    subscription_anchor_start: string
    subscription_anchor_end: string
  }>()
  const trialDaysLeft = ref<number>(0)
  const paying = ref<boolean>(false)
  const canceled = ref<boolean>(false)
  const goodPlan = ref<boolean>(false)
  const canUseMore = ref<boolean>(false)

  const logout = () => {
    return new Promise<void>((resolve) => {
      const supabase = useSupabase()
      supabase.auth.onAuthStateChange((event: any) => {
        if (event === 'SIGNED_OUT') {
          auth.value = undefined
          user.value = undefined
          reset()
          unspoofUser()
          resolve()
        }
      })
      // deleteSupabaseToken()
      setTimeout(() => {
        supabase.auth.signOut()
      }, 300)
    })
  }
  return {
    auth,
    trialDaysLeft,
    goodPlan,
    canceled,
    canUseMore,
    paying,
    user,
    cycleInfo,
    path,
    logout,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useMainStore, import.meta.hot))
