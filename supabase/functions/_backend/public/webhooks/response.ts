import { type } from 'arktype'

export const webhookPublicSelect = 'id, org_id, name, url, enabled, events, delivery_version, created_at, updated_at, created_by'
export const webhookCreatedSelect = `${webhookPublicSelect}, secret`

export const webhookPublicSchema = type({
  id: 'string',
  org_id: 'string',
  name: 'string',
  url: 'string',
  enabled: 'boolean',
  events: 'string[]',
  delivery_version: 'string',
  created_at: 'string',
  updated_at: 'string',
  created_by: 'string',
})

export const webhooksPublicSchema = webhookPublicSchema.array()
