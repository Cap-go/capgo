import type { Database } from '../../utils/supabase.types.ts'
import type { CreateApp } from './post.ts'
import { getBodyOrQuery, honoFactory, middlewareKey } from '../../utils/hono.ts'
import { deleteApp } from './delete.ts'
import { get, getAll } from './get.ts'
import { post } from './post.ts'
import { put } from './put.ts'

export const app = honoFactory.createApp()

app.get('/', middlewareKey(['all', 'read']), async (c) => {
  const pageQuery = c.req.query('page')
  const limitQuery = c.req.query('limit')
  const orgId = c.req.query('org_id')

  const page = pageQuery ? Number.parseInt(pageQuery) : undefined
  const limit = limitQuery ? Number.parseInt(limitQuery) : undefined

  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  const subkey = c.get('subkey') as Database['public']['Tables']['apikeys']['Row'] | undefined
  const keyToUse = subkey || apikey

  return getAll(c, keyToUse, page, limit, orgId)
})

app.get('/:id', middlewareKey(['all', 'read']), async (c) => {
  const id = c.req.param('id')
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  const subkey = c.get('subkey') as Database['public']['Tables']['apikeys']['Row'] | undefined
  const keyToUse = subkey || apikey
  return get(c, id, keyToUse)
})

app.post('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<CreateApp>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return post(c, body, apikey)
})

app.put('/:id', middlewareKey(['all', 'write']), async (c) => {
  const id = c.req.param('id')
  const body = await getBodyOrQuery<{ name?: string, icon?: string, retention?: number }>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  const subkey = c.get('subkey') as Database['public']['Tables']['apikeys']['Row'] | undefined
  const keyToUse = subkey || apikey
  return put(c, id, body, keyToUse)
})

app.delete('/:id', middlewareKey(['all', 'write']), async (c) => {
  const id = c.req.param('id')
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  const subkey = c.get('subkey') as Database['public']['Tables']['apikeys']['Row'] | undefined
  const keyToUse = subkey || apikey
  return deleteApp(c, id, keyToUse)
})
