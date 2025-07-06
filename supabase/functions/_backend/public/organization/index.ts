import type { Database } from '../../utils/supabase.types.ts'
import { getBodyOrQuery, honoFactory, middlewareKey } from '../../utils/hono.ts'
import { deleteOrg } from './delete.ts'
import { get } from './get.ts'
import { deleteMember } from './members/delete.ts'
import { get as getMembers } from './members/get.ts'
import { post as inviteUser } from './members/post.ts'
import { post } from './post.ts'
import { put } from './put.ts'

export const app = honoFactory.createApp()

app.get('/', middlewareKey(['all', 'write', 'read', 'upload']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return get(c, body, apikey)
})

app.put('/', middlewareKey(['all', 'write', 'read', 'upload']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return put(c, body, apikey)
})

app.post('/', middlewareKey(['all', 'write', 'read', 'upload']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return post(c, body, apikey)
})

app.delete('/', middlewareKey(['all', 'write', 'read', 'upload']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return deleteOrg(c, body, apikey)
})

app.get('/members', middlewareKey(['all', 'write', 'read', 'upload']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return getMembers(c, body, apikey)
})

app.post('/members', middlewareKey(['all', 'write', 'read', 'upload']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return inviteUser(c, body, apikey)
})

app.delete('/members', middlewareKey(['all', 'write', 'read', 'upload']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return deleteMember(c, body, apikey)
})
