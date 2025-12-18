import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { defaultApiHost, useSupabase } from '~/services/supabase'

export type MetricCategory = 'uploads' | 'distribution' | 'failures' | 'success_rate' | 'platform_overview' | 'org_metrics' | 'mau_trend' | 'success_rate_trend' | 'apps_trend' | 'bundles_trend' | 'deployments_trend' | 'storage_trend' | 'bandwidth_trend' | 'global_stats_trend'
export type DateRangeMode = '30day' | '90day' | 'quarter' | '6month' | '12month' | 'custom'

interface DateRange {
  start: Date
  end: Date
}

interface CachedData {
  data: any
  timestamp: number
}

interface AdminStatsResponse {
  success: boolean
  metric_category: MetricCategory
  data: any
  period: {
    start: string
    end: string
  }
}

export const useAdminDashboardStore = defineStore('adminDashboard', () => {
  // Filter state
  const selectedOrgId = ref<string | null>(null)
  const selectedAppId = ref<string | null>(null)
  const dateRangeMode = ref<DateRangeMode>('30day')
  const customDateRange = ref<DateRange>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    end: new Date(),
  })

  // Cache state (5-minute TTL)
  const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
  const cache = ref<Map<string, CachedData>>(new Map())

  // Loading state
  const isLoading = ref(false)
  const loadingCategory = ref<MetricCategory | null>(null)

  // Refresh trigger - increment this to force all watchers to refetch
  const refreshTrigger = ref(0)

  // Computed date range based on mode
  const activeDateRange = computed<DateRange>(() => {
    const now = new Date()
    switch (dateRangeMode.value) {
      case '30day':
        return {
          start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          end: now,
        }
      case '90day':
        return {
          start: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          end: now,
        }
      case 'quarter':
        return {
          start: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          end: now,
        }
      case '6month':
        return {
          start: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
          end: now,
        }
      case '12month':
        return {
          start: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
          end: now,
        }
      case 'custom':
        return customDateRange.value
      default:
        return {
          start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          end: now,
        }
    }
  })

  // Actions
  function setOrgFilter(orgId: string | null) {
    selectedOrgId.value = orgId
    // Clear app filter when org changes
    if (orgId === null)
      selectedAppId.value = null
  }

  function setAppFilter(appId: string | null) {
    selectedAppId.value = appId
  }

  function setDateRangeMode(mode: DateRangeMode) {
    dateRangeMode.value = mode
  }

  function setCustomDateRange(start: Date, end: Date) {
    customDateRange.value = { start, end }
    dateRangeMode.value = 'custom'
  }

  function clearFilters() {
    selectedOrgId.value = null
    selectedAppId.value = null
    dateRangeMode.value = '30day'
  }

  function getCacheKey(category: MetricCategory): string {
    const { start, end } = activeDateRange.value
    const orgPart = selectedOrgId.value || 'global'
    const appPart = selectedAppId.value || 'all'
    return `${category}-${orgPart}-${appPart}-${start.toISOString()}-${end.toISOString()}`
  }

  function isCacheValid(cacheKey: string): boolean {
    const cached = cache.value.get(cacheKey)
    if (!cached)
      return false
    return Date.now() - cached.timestamp < CACHE_TTL
  }

  async function fetchStats(category: MetricCategory, forceRefresh = false): Promise<any> {
    const cacheKey = getCacheKey(category)

    // Check cache
    if (!forceRefresh && isCacheValid(cacheKey)) {
      const cached = cache.value.get(cacheKey)
      return cached?.data
    }

    isLoading.value = true
    loadingCategory.value = category

    try {
      const { start, end } = activeDateRange.value
      const supabase = useSupabase()

      const body: any = {
        metric_category: category,
        start_date: start.toISOString(),
        end_date: end.toISOString(),
      }

      if (selectedAppId.value)
        body.app_id = selectedAppId.value

      if (selectedOrgId.value)
        body.org_id = selectedOrgId.value

      if (category === 'org_metrics')
        body.limit = 100

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session)
        throw new Error('Not authenticated')

      // Call Cloudflare Worker API directly
      const response = await fetch(`${defaultApiHost}/private/admin_stats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`API error: ${response.status} - ${JSON.stringify(errorData)}`)
      }

      const data: AdminStatsResponse = await response.json()

      if (!data?.success)
        throw new Error('Failed to fetch admin stats')

      // Update cache
      cache.value.set(cacheKey, {
        data: data.data,
        timestamp: Date.now(),
      })

      return data.data
    }
    catch (error) {
      console.error(`Error fetching ${category}:`, error)
      throw error
    }
    finally {
      isLoading.value = false
      loadingCategory.value = null
    }
  }

  function invalidateCache() {
    cache.value.clear()
    refreshTrigger.value++
  }

  // Invalidate cache when filters change
  function $reset() {
    clearFilters()
    invalidateCache()
    isLoading.value = false
    loadingCategory.value = null
  }

  return {
    // State
    selectedOrgId,
    refreshTrigger,
    selectedAppId,
    dateRangeMode,
    customDateRange,
    isLoading,
    loadingCategory,

    // Computed
    activeDateRange,

    // Actions
    setOrgFilter,
    setAppFilter,
    setDateRangeMode,
    setCustomDateRange,
    clearFilters,
    fetchStats,
    invalidateCache,
    $reset,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useAdminDashboardStore, import.meta.hot))
