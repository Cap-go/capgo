import type { CompatibilitySummary, PackageComparison } from './bundleCompatibility'
import { useSupabase } from './supabase'

export interface BundleCompatibilitySource {
  kind: 'bundle' | 'native_packages'
  id?: number
  name?: string
  nativePackageCount: number
}

export interface DefaultChannelCompatibilityResponse {
  appId: string
  channel: {
    id: number
    name: string
    version: number | null
  } | null
  alert: boolean
  reason: string
  deployments?: {
    currentId?: number
    previousId?: number
    currentDeployedAt?: string | null
  }
  candidate: BundleCompatibilitySource | null
  baseline: BundleCompatibilitySource | null
  comparisons: PackageComparison[]
  summary: CompatibilitySummary
}

export async function getDefaultChannelCompatibility(appId: string): Promise<DefaultChannelCompatibilityResponse | null> {
  if (!appId || !appId.trim()) {
    console.error('getDefaultChannelCompatibility called with empty appId')
    return null
  }

  const normalizedAppId = appId.trim()
  const { data, error } = await useSupabase().functions.invoke<DefaultChannelCompatibilityResponse>('private/bundle_compatibility/default-channel/latest', {
    body: { appId: normalizedAppId },
  })

  if (error) {
    console.error('Failed to load default channel compatibility', error)
    return null
  }

  return data
}
