import type { User } from '@supabase/supabase-js'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { definitions } from '~/types/supabase'
import { useSupabase } from '~/services/supabase'
import { reset } from '~/services/crips'

export const useMainStore = defineStore('main', () => {
  const auth = ref<User | null>()
  const path = ref('')
  const user = ref<definitions['users']>()
  const trialDaysLeft = ref<number>(0)
  const paying = ref<boolean>(false)
  const canceled = ref<boolean>(false)
  const goodPlan = ref<boolean>(false)
  const canUseMore = computed(() => {
    if (trialDaysLeft.value)
      return true
    return paying.value && auth.value ? goodPlan.value : false
  })

  const logout = async () => {
    return new Promise<void>((resolve) => {
      const supabase = useSupabase()
      supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          auth.value = undefined
          user.value = undefined
          reset()
          resolve()
        }
      })
      localStorage.removeItem('supabase.auth.token')
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
    path,
    logout,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useMainStore, import.meta.hot))
