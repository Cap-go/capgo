// Type definition for deploy history records
export interface DeployHistory {
  id: number
  version_id: number
  app_id: string
  channel_id: number
  deployed_at: string
  link?: string
  comment?: string
  is_current: boolean
  owner_org: string
  created_at: string
  updated_at: string
  version: {
    id: number
    name: string
    app_id: string
    created_at: string
    link?: string
    comment?: string
  }
}
