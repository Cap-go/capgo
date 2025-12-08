import type { Database } from '~/types/supabase.types'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useSupabase } from '~/services/supabase'

export interface BreadcrumbItem {
  path: string
  name: string
  translate?: boolean
}

export const useDisplayStore = defineStore('display', () => {
  const NavTitle = ref<string>('')
  const pathTitle = ref<BreadcrumbItem[]>([])
  const lastPath = ref<string>('')
  const defaultBack = ref<string>('')
  const messageToast = ref<string[]>([])
  const durationToast = ref<number>(2000)
  const lastButtonRole = ref<string>('')
  const selectedOrganizations = ref<string[]>([])
  const selectedApps = ref<Database['public']['Tables']['apps']['Row'][]>([])
  const appNameResolver = ref<(appId: string) => string | undefined>(() => undefined)
  const resolverReady = ref(false)
  const appNameCache = ref(new Map<string, string>())
  const pendingFetches = new Map<string, Promise<void>>()

  function setAppNameResolver(resolver: (appId: string) => string | undefined) {
    appNameResolver.value = resolver
    resolverReady.value = true
  }

  function getPrettyName(segment: string, index: number, allSegments: string[]): string {
    const previousSegment = allSegments[index - 1]

    // If this segment comes after 'p', it's an appId - return as is
    if (previousSegment === 'p')
      return segment

    switch (segment) {
      case 'dashboard':
        return 'Dashboard'
      case 'app':
        return 'apps'
      case 'settings':
        return 'settings'
      case 'organization':
        return 'organization'
      case 'onboarding':
        return 'onboarding'
      case 'channel':
        return 'channels'
      case 'bundle':
        return 'bundles'
      case 'device':
        return 'devices'
      case 'changepassword':
        return 'password'
      case 'account':
        return 'account'
      case 'notifications':
        return 'notifications'
      default:
        return segment.charAt(0).toUpperCase() + segment.slice(1)
    }
  }

  function isValidClickableSegment(segment: string, index: number, totalLength: number, allSegments: string[]): boolean {
    // Don't make the last segment clickable (usually an ID or final page)
    if (index === totalLength - 1)
      return false

    // Skip 'app', 'p', and 'settings' segments - they're not clickable
    if (segment === 'p' || segment === 'settings')
      return false

    const previousSegment = allSegments.length ? allSegments[index - 1] : undefined
    const previousTwoSegments = allSegments.length > 1 ? allSegments[index - 2] : undefined

    // Include 'app' only if followed by 'p' and an appId
    if (segment === 'app' && previousSegment !== 'p')
      return true

    // Include appId (segment after 'p') only if there are more segments after it
    if (previousSegment === 'p' && previousTwoSegments === 'app' && index < totalLength - 1)
      return true

    // Include organization when it's under settings and has sub-paths
    if (segment === 'organization' && previousSegment === 'settings' && index < totalLength - 1)
      return true

    // Skip other route segments that shouldn't be clickable
    const nonClickableSegments = ['channel', 'bundle', 'device', 'onboarding']
    if (nonClickableSegments.includes(segment))
      return false

    return false
  }

  function updatePathTitle(path: string) {
    lastPath.value = path
    const splitPath = path.split('/').filter(Boolean)

    const breadcrumbs: BreadcrumbItem[] = []

    // App flow: Apps / <AppName> / <Section>
    if (splitPath[0] === 'app' && splitPath[1] === 'p' && splitPath[2]) {
      const appId = splitPath[2]
      breadcrumbs.push({ path: '/app', name: 'apps' })

      // App name entry
      const cachedName = appNameCache.value.get(appId)
      const resolvedName = appNameResolver.value(appId)
        ?? cachedName
        ?? appId
      breadcrumbs.push({
        path: `/app/p/${appId}`,
        name: resolvedName,
        translate: false,
      })

      // Kick off fetch if we still don't have a name
      if (!cachedName && !appNameResolver.value(appId) && !pendingFetches.has(appId)) {
        const supabase = useSupabase()
        const fetchPromise = supabase
          .from('apps')
          .select('name')
          .eq('app_id', appId)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.name)
              appNameCache.value.set(appId, data.name)
          })
          .catch(() => {})
          .finally(() => {
            pendingFetches.delete(appId)
            if (lastPath.value)
              updatePathTitle(lastPath.value)
          })
        pendingFetches.set(appId, fetchPromise)
      }

      // Additional segments after the app id (e.g., bundle, channel)
      for (let i = 3; i < splitPath.length; i++) {
        const segment = splitPath[i]
        const prev = splitPath[i - 1]

        // Skip numeric ids following known resource segments
        if (/^[0-9]+$/.test(segment) && ['bundle', 'channel', 'device', 'build'].includes(prev))
          continue

        const pathUpToHere = `/${splitPath.slice(0, i + 1).join('/')}`
        const prettyName = getPrettyName(segment, i, splitPath)

        breadcrumbs.push({
          path: pathUpToHere,
          name: prettyName,
        })
      }

      pathTitle.value = breadcrumbs
      return
    }

    // When viewing dashboard, show only "dashboard"
    if (splitPath[0] === 'dashboard') {
      pathTitle.value = [{
        path: '/dashboard',
        name: 'dashboard',
      }]
      return
    }

    // Handle special case for account-related settings
    if (splitPath.length === 2 && splitPath[0] === 'settings' && (splitPath[1] === 'changepassword' || splitPath[1] === 'notifications')) {
      pathTitle.value = [{
        path: '/settings/account',
        name: 'account',
      }]
      return
    }

    // Generic fallback
    for (let i = 0; i < splitPath.length; i++) {
      const segment = splitPath[i]
      const isValid = isValidClickableSegment(segment, i, splitPath.length, splitPath)
      if (!isValid)
        continue

      const pathUpToHere = `/${splitPath.slice(0, i + 1).join('/')}`
      let prettyName = getPrettyName(segment, i, splitPath)
      let translate = true

      if (splitPath[i - 1] === 'p') {
        translate = false
        prettyName = appNameResolver.value(segment) ?? segment
      }

      breadcrumbs.push({
        path: pathUpToHere,
        name: prettyName,
        translate,
      })
    }

    pathTitle.value = path === '/' ? [] : breadcrumbs
  }

  watch(NavTitle, () => {
    if (lastPath.value)
      updatePathTitle(lastPath.value)
  })

  watch(resolverReady, (ready) => {
    if (ready && lastPath.value)
      updatePathTitle(lastPath.value)
  })

  return {
    messageToast,
    durationToast,
    lastButtonRole,
    NavTitle,
    pathTitle,
    defaultBack,
    selectedApps,
    selectedOrganizations,
    setAppNameResolver,
    updatePathTitle,
    lastPath,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useDisplayStore, import.meta.hot))
