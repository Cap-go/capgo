import type { User } from '@supabase/supabase-js'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'
import type { definitions } from '~/types/supabase'
import { useSupabase } from '~/services/supabase'
import type { PlanRes } from '~/services/plans'
import { reset } from '~/services/crips'

export const useMainStore = defineStore('main', () => {
  const auth = ref<User | null>()
  const path = ref('')
  const user = ref<definitions['users']>()
  const myPlan = ref<PlanRes>()

  const logout = async () => {
    return new Promise<void>((resolve) => {
      const supabase = useSupabase()
      supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          auth.value = undefined
          user.value = undefined
          myPlan.value = undefined
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
    myPlan,
    user,
    path,
    logout,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useMainStore, import.meta.hot))
