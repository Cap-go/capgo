import type { User } from '@supabase/supabase-js'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'
import type { appUsageByApp, appUsageGlobal } from './../services/supabase'
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
  const plans = ref<Database['public']['Tables']['plans']['Row'][]>([])
  const isAdmin = ref<boolean>(false)
  const dashboard = ref<appUsageGlobal[]>([])
  const dashboardByapp = ref<appUsageByApp[]>([])
  const totalDevices = ref<number>(0)
  const totalStorage = ref<number>(0)
  const dashboardFetched = ref<boolean>(false)

  const totalDownload = ref<number>(0)

  const logout = () => {
    return new Promise<void>((resolve) => {
      const supabase = useSupabase()
      const listner = supabase.auth.onAuthStateChange((event: any) => {
        if (event === 'SIGNED_OUT') {
          listner.data.subscription.unsubscribe()
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
  const updateDashboard = async (currentOrgId: string, rangeStart?: string, rangeEnd?: string) => {
    const dashboardRes = await getAllDashboard(currentOrgId, rangeStart, rangeEnd)
    dashboard.value = dashboardRes.global
    dashboardByapp.value = dashboardRes.byApp
    totalDevices.value = dashboard.value.reduce((acc: number, cur: any) => acc + cur.mau, 0)
    totalDownload.value = dashboard.value.reduce((acc: number, cur: any) => acc + cur.get, 0)
    totalStorage.value = await getTotalStorage()
    dashboardFetched.value = true
  }

  const getTotalStats = () => {
    return dashboard.value.reduce((acc: any, cur: any) => {
      acc.mau += cur.mau
      acc.bandwidth += cur.bandwidth
      acc.storage += cur.storage_added - cur.storage_deleted
      return acc
    }, {
      mau: 0,
      bandwidth: 0,
      storage: 0,
    })
  }

  const filterDashboard = (appId: string) => {
    return dashboardByapp.value.filter(d => d.app_id === appId)
  }

  const getTotalMauByApp = (appId: string) => {
    // dashboardByapp add up all the mau for the appId and return it
    return dashboardByapp.value.filter(d => d.app_id === appId).reduce((acc: number, cur) => acc + cur.mau, 0)
  }

  return {
    auth,
    plans,
    isAdmin,
    totalStorage,
    totalDevices,
    totalDownload,
    dashboardFetched,
    updateDashboard,
    getTotalStats,
    filterDashboard,
    dashboard,
    dashboardByapp,
    getTotalMauByApp,
    user,
    path,
    logout,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useMainStore, import.meta.hot))
