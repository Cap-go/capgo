export interface Customer {
  id: string
  stripe_customer_id: string
}

export interface JwtUser {
  sub: string
  email?: string
  role: 'anon' | 'authenticated'
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
}
export interface AppStats extends AppInfos {
  action: string
  version?: number
}

export interface BaseHeaders {
  [k: string]: string | undefined
}

export interface Details {
  timestamp: number
  signatures: string[]
}
