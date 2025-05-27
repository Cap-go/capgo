import type { Database } from '../../utils/supabase.types.ts'
import type { CreateApp } from './post.ts'
import { getBody, honoFactory, middlewareKey } from '../../utils/hono.ts'
import { deleteApp } from './delete.ts'
import { get, getAll } from './get.ts'
import { post } from './post.ts'
import { put } from './put.ts'

export const app = honoFactory.createApp()

app.get('/', middlewareKey(['all', 'read']), async (c) => {
  try {
    const pageQuery = c.req.query('page')
    const limitQuery = c.req.query('limit')
    const orgId = c.req.query('org_id')

    const page = pageQuery ? Number.parseInt(pageQuery) : undefined
    const limit = limitQuery ? Number.parseInt(limitQuery) : undefined

    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    const subkey = c.get('subkey') as Database['public']['Tables']['apikeys']['Row'] | undefined
    const keyToUse = subkey || apikey

    return getAll(c as any, keyToUse, page, limit, orgId)
  }
  catch (e) {
    return c.json({ status: 'Cannot get apps', error: JSON.stringify(e) }, 500)
  }
})

app.get('/:id', middlewareKey(['all', 'read']), async (c) => {
  try {
    const id = c.req.param('id')
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    const subkey = c.get('subkey') as Database['public']['Tables']['apikeys']['Row'] | undefined
    const keyToUse = subkey || apikey
    return get(c as any, id, keyToUse)
  }
  catch (e) {
    return c.json({ status: 'Cannot get app', error: JSON.stringify(e) }, 500)
  }
})

app.post('/', middlewareKey(['all', 'write']), async (c) => {
  try {
    const body = await getBody<CreateApp>(c as any)
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    return post(c as any, body, apikey)
  }
  catch (e) {
    return c.json({ status: 'Cannot create app', error: JSON.stringify(e) }, 500)
  }
})

app.put('/:id', middlewareKey(['all', 'write']), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await getBody<{ name?: string, icon?: string, retention?: number }>(c as any)
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    const subkey = c.get('subkey') as Database['public']['Tables']['apikeys']['Row'] | undefined
    const keyToUse = subkey || apikey
    return put(c as any, id, body, keyToUse)
  }
  catch (e) {
    return c.json({ status: 'Cannot update app', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/:id', middlewareKey(['all', 'write']), async (c) => {
  try {
    const id = c.req.param('id')
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    const subkey = c.get('subkey') as Database['public']['Tables']['apikeys']['Row'] | undefined
    const keyToUse = subkey || apikey
    return deleteApp(c as any, id, keyToUse)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete app', error: JSON.stringify(e) }, 500)
  }
})
