import type { User } from '@supabase/supabase-js'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'
import type { appUsage } from './../services/supabase'
import {
  getAllDashboard,
  getTotalStorage,
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
  const dashboard = ref<appUsage[]>([])
  const totalDevices = ref<number>(0)
  const totalStorage = ref<number>(0)

  const totalDownload = ref<number>(0)

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
  const updateDashboard = async (rangeStart?: string, rangeEnd?: string) => {
    dashboard.value = await getAllDashboard(auth.value?.id || '', rangeStart, rangeEnd)
    totalDevices.value = dashboard.value.reduce((acc: number, cur: any) => acc + cur.mau, 0)
    totalDownload.value = dashboard.value.reduce((acc: number, cur: any) => acc + cur.get, 0)
    totalStorage.value = await getTotalStorage()
  }

  const getTotalStats = () => {
    return dashboard.value.reduce((acc: any, cur: any) => {
      acc.mau += cur.mau
      acc.bandwidth += cur.bandwidth
      acc.storage += cur.storage_added - cur.storage_deleted
      return acc
    }
    , {
      mau: 0,
      bandwidth: 0,
      storage: 0,
    })
  }

  const filterDashboard = async (appId: string, rangeStart?: string, rangeEnd?: string, refetch = false) => {
    if (refetch)
      await updateDashboard(rangeStart, rangeEnd)

    return dashboard.value.filter(d => d.app_id === appId)
  }

  return {
    auth,
    trialDaysLeft,
    goodPlan,
    totalStorage,
    totalDevices,
    totalDownload,
    updateDashboard,
    getTotalStats,
    filterDashboard,
    dashboard,
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
