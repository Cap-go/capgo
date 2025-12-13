import type { Database } from './supabase.types.ts'

export interface Customer {
  id: string
  stripe_customer_id: string
}

export interface AppInfos {
  version_name: string
  version_build: string
  version_os: string
  custom_id?: string
  is_prod?: boolean
  is_emulator?: boolean
  plugin_version: string
  platform: string
  app_id: string
  device_id: string
  defaultChannel: string
  key_id?: string
}

export interface AppStats extends AppInfos {
  action: string
  old_version_name?: string
}

export interface BaseHeaders {
  [k: string]: string | undefined
}

export interface Order {
  key: string
  sortable?: 'asc' | 'desc'
}

export interface ReadStatsParams {
  app_id: string
  version_name?: string
  start_date?: string
  end_date?: string
  deviceIds?: string[]
  search?: string
  order?: Order[]
  limit?: number
  actions?: string[]
}

export interface ReadDevicesParams {
  app_id: string
  version_name?: string | undefined
  deviceIds?: string[]
  search?: string
  order?: Order[]
  limit?: number
  /** Cursor for pagination - use the last updated_at from previous page */
  cursor?: string
}
export type DeviceRes = {
  id?: Database['public']['Tables']['devices']['Row']['id']
} & Omit<Database['public']['Tables']['devices']['Row'], 'id'>

export interface ReadDevicesResponse {
  data: DeviceRes[]
  /** Cursor for next page - pass this as cursor param to get next page */
  nextCursor?: string
  /** Whether there are more results */
  hasMore: boolean
}

export type DeviceWithoutCreatedAt = Omit<Database['public']['Tables']['devices']['Insert'], 'created_at'>
export interface StatsActions {
  action: Database['public']['Enums']['stats_action']
  versionName?: string
}

export const DEFAULT_LIMIT = 1000
