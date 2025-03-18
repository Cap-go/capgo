import type { Database } from '../../utils/supabase.types.ts'
import type { CreateApp } from './post.ts'
import { getBody, honoFactory, middlewareKey } from '../../utils/hono.ts'
import { deleteApp } from './delete.ts'
import { get } from './get.ts'
import { post } from './post.ts'
import { put } from './put.ts'

export const app = honoFactory.createApp()

app.get('/:id', middlewareKey(['all', 'read']), async (c) => {
  try {
    const id = c.req.param('id')
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    return get(c as any, id, apikey)
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
    // Check if this is a permission error (403) or other error
    if (e instanceof Error && e.message && e.message.includes('access')) {
      return c.json({ status: 'You can\'t access this organization', error: e.message }, 403)
    }
    return c.json({ status: 'Cannot create app', error: JSON.stringify(e) }, 500)
  }
})

app.put('/:id', middlewareKey(['all', 'write']), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await getBody<{ name?: string, icon?: string, retention?: number }>(c as any)
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    return put(c as any, id, body, apikey)
  }
  catch (e) {
    return c.json({ status: 'Cannot update app', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/:id', middlewareKey(['all', 'write']), async (c) => {
  try {
    const id = c.req.param('id')
    const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
    return deleteApp(c as any, id, apikey)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete app', error: JSON.stringify(e) }, 500)
  }
})
