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
}

export interface AppStats extends AppInfos {
  action: string
  old_version_name?: string
  version?: number
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
  version_id?: string
  start_date?: string
  end_date?: string
  deviceIds?: string[]
  search?: string
  order?: Order[]
  limit?: number
}

export interface ReadDevicesParams {
  app_id: string
  version_id?: string
  rangeStart?: number
  rangeEnd?: number
  deviceIds?: string[]
  search?: string
  order?: Order[]
  limit?: number
}

export type DeviceWithoutCreatedAt = Omit<Database['public']['Tables']['devices']['Insert'], 'created_at'>
export interface StatsActions {
  action: Database['public']['Enums']['stats_action']
  versionId?: number
}

export const DEFAULT_LIMIT = 1000
