import type { Context } from '@hono/hono'
import { Hono } from 'hono/tiny'
import { getBody, middlewareKey } from '../../utils/hono.ts'
import { get } from './get.ts'
import { deleteMember } from './members/delete.ts'
import { get as getMembers } from './members/get.ts'
import { post as inviteUser } from './members/post.ts'

export const app = new Hono()

app.get('/', middlewareKey(['all', 'write', 'read', 'upload']), async (c: Context) => {
  try {
    const body = await getBody<any>(c)
    const apikey = c.get('apikey')
    return get(c, body, apikey)
  }
  catch (e) {
    return c.json({ status: 'Cannot get organization', error: JSON.stringify(e) }, 500)
  }
})

app.get('/members', middlewareKey(['all', 'write', 'read', 'upload']), async (c: Context) => {
  try {
    const body = await getBody<any>(c)
    const apikey = c.get('apikey')
    return getMembers(c, body, apikey)
  }
  catch (e) {
    return c.json({ status: 'Cannot get organization', error: JSON.stringify(e) }, 500)
  }
})

app.post('/members', middlewareKey(['all', 'write', 'read', 'upload']), async (c: Context) => {
  try {
    const body = await getBody<any>(c)
    const apikey = c.get('apikey')
    return inviteUser(c, body, apikey)
  }
  catch (e) {
    return c.json({ status: 'Cannot invite user to organization', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/members', middlewareKey(['all', 'write', 'read', 'upload']), async (c: Context) => {
  try {
    const body = await getBody<any>(c)
    const apikey = c.get('apikey')
    return deleteMember(c, body, apikey)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete user from organization', error: JSON.stringify(e) }, 500)
  }
})
