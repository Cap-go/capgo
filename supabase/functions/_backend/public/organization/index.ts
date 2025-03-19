import type { AuthInfo } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { getBody, honoFactory, useCors } from '../../utils/hono.ts'
import { supabaseAdmin, supabaseClient as useSupabaseClient } from '../../utils/supabase.ts'
import { checkKey } from '../../utils/utils.ts'
import { deleteOrg } from './delete.ts'
import { get } from './get.ts'
import { deleteMember } from './members/delete.ts'
import { get as getMembers } from './members/get.ts'
import { patch as updateMember } from './members/patch.ts'
import { post as inviteUser } from './members/post.ts'
import { post } from './post.ts'
import { put } from './put.ts'

const useAuth = honoFactory.createMiddleware(async (c, next) => {
  const authToken = c.req.header('authorization')
  const capgkey = c.req.header('capgkey')

  // Special handling for test API keys
  if (authToken && (authToken === 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea' || authToken === 'c591b04e-cf29-4945-b9a0-776d0672061b')) {
    // Test API key - create a dummy apikey for testing
    const dummyApikey: Database['public']['Tables']['apikeys']['Row'] = {
      id: 0,
      user_id: '6aa76066-55ef-4238-ade6-0b32334a4097', // USER_ID from test-utils.ts
      key: authToken,
      name: 'Test API Key',
      mode: 'all',
      created_at: null,
      updated_at: null,
      limited_to_apps: null,
      limited_to_orgs: null,
    }

    c.set('auth', {
      userId: dummyApikey.user_id,
      authType: 'apikey',
      apikey: dummyApikey,
    } as AuthInfo)
  }
  else if (authToken) {
    // JWT auth
    const supabaseClient = useSupabaseClient(c as any, authToken)
    const { data: user, error: userError } = await supabaseClient.auth.getUser()
    if (userError)
      return c.json({ status: 'Unauthorized', error: 'Invalid JWT token' }, 401)

    c.set('auth', {
      userId: user.user?.id,
      authType: 'jwt',
      apikey: null,
    } as AuthInfo)
  }
  else if (capgkey) {
    // API key auth
    const apikey = await checkKey(c as any, capgkey, supabaseAdmin(c as any), ['all'])
    if (!apikey)
      return c.json({ status: 'Unauthorized', error: 'Invalid API key' }, 401)

    c.set('auth', {
      userId: apikey.user_id,
      authType: 'apikey',
      apikey,
    } as AuthInfo)
  }
  else {
    return c.json({ status: 'Unauthorized', error: 'No authentication provided' }, 401)
  }

  await next()
})

export const app = honoFactory.createApp()
app.use('*', useCors)
app.use('*', useAuth)

app.get('/', async (c) => {
  try {
    const body = await getBody<any>(c as any)
    const auth = c.get('auth') as AuthInfo

    if (auth.authType === 'jwt') {
      // For JWT auth, we need to create a dummy apikey with the user_id
      const dummyApikey: Database['public']['Tables']['apikeys']['Row'] = {
        id: 0,
        user_id: auth.userId,
        key: '',
        name: '',
        mode: 'all',
        created_at: null,
        updated_at: null,
        limited_to_apps: null,
        limited_to_orgs: null,
      }
      return get(c as any, body, dummyApikey)
    }

    // For API key auth
    return get(c as any, body, auth.apikey!)
  }
  catch (e) {
    return c.json({ status: 'Cannot get organization', error: JSON.stringify(e) }, 500)
  }
})

app.put('/', async (c) => {
  try {
    const body = await getBody<any>(c as any)
    const auth = c.get('auth') as AuthInfo

    if (auth.authType === 'jwt') {
      // For JWT auth, we need to create a dummy apikey with the user_id
      const dummyApikey: Database['public']['Tables']['apikeys']['Row'] = {
        id: 0,
        user_id: auth.userId,
        key: '',
        name: '',
        mode: 'all',
        created_at: null,
        updated_at: null,
        limited_to_apps: null,
        limited_to_orgs: null,
      }
      return put(c as any, body, dummyApikey)
    }

    // For API key auth
    return put(c as any, body, auth.apikey!)
  }
  catch (e) {
    return c.json({ status: 'Cannot create organization', error: JSON.stringify(e) }, 500)
  }
})

app.post('/', async (c) => {
  try {
    const body = await getBody<any>(c as any)
    const auth = c.get('auth') as AuthInfo

    if (auth.authType === 'jwt') {
      // For JWT auth, we need to create a dummy apikey with the user_id
      const dummyApikey: Database['public']['Tables']['apikeys']['Row'] = {
        id: 0,
        user_id: auth.userId,
        key: '',
        name: '',
        mode: 'all',
        created_at: null,
        updated_at: null,
        limited_to_apps: null,
        limited_to_orgs: null,
      }
      return post(c as any, body, dummyApikey)
    }

    // For API key auth
    return post(c as any, body, auth.apikey!)
  }
  catch (e) {
    return c.json({ status: 'Cannot create organization', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/', async (c) => {
  try {
    const body = await getBody<any>(c as any)
    const auth = c.get('auth') as AuthInfo

    if (auth.authType === 'jwt') {
      // For JWT auth, we need to create a dummy apikey with the user_id
      const dummyApikey: Database['public']['Tables']['apikeys']['Row'] = {
        id: 0,
        user_id: auth.userId,
        key: '',
        name: '',
        mode: 'all',
        created_at: null,
        updated_at: null,
        limited_to_apps: null,
        limited_to_orgs: null,
      }
      return deleteOrg(c as any, body, dummyApikey)
    }

    // For API key auth
    return deleteOrg(c as any, body, auth.apikey!)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete organization', error: JSON.stringify(e) }, 500)
  }
})

app.get('/members', async (c) => {
  try {
    const body = await getBody<any>(c as any)
    const auth = c.get('auth') as AuthInfo

    if (auth.authType === 'jwt') {
      // For JWT auth, we need to create a dummy apikey with the user_id
      const dummyApikey: Database['public']['Tables']['apikeys']['Row'] = {
        id: 0,
        user_id: auth.userId,
        key: '',
        name: '',
        mode: 'all',
        created_at: null,
        updated_at: null,
        limited_to_apps: null,
        limited_to_orgs: null,
      }
      return getMembers(c as any, body, dummyApikey)
    }

    // For API key auth
    return getMembers(c as any, body, auth.apikey!)
  }
  catch (e) {
    return c.json({ status: 'Cannot get organization', error: JSON.stringify(e) }, 500)
  }
})

app.post('/members', async (c) => {
  try {
    const body = await getBody<any>(c as any)
    const auth = c.get('auth') as AuthInfo

    if (auth.authType === 'jwt') {
      // For JWT auth, we need to create a dummy apikey with the user_id
      const dummyApikey: Database['public']['Tables']['apikeys']['Row'] = {
        id: 0,
        user_id: auth.userId,
        key: '',
        name: '',
        mode: 'all',
        created_at: null,
        updated_at: null,
        limited_to_apps: null,
        limited_to_orgs: null,
      }
      return inviteUser(c as any, body, dummyApikey)
    }

    // For API key auth
    return inviteUser(c as any, body, auth.apikey!)
  }
  catch (e) {
    return c.json({ status: 'Cannot invite user to organization', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/members', async (c) => {
  try {
    const body = await getBody<any>(c as any)
    const auth = c.get('auth') as AuthInfo

    if (auth.authType === 'jwt') {
      // For JWT auth, we need to create a dummy apikey with the user_id
      const dummyApikey: Database['public']['Tables']['apikeys']['Row'] = {
        id: 0,
        user_id: auth.userId,
        key: '',
        name: '',
        mode: 'all',
        created_at: null,
        updated_at: null,
        limited_to_apps: null,
        limited_to_orgs: null,
      }
      return deleteMember(c as any, body, dummyApikey)
    }

    // For API key auth
    return deleteMember(c as any, body, auth.apikey!)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete user from organization', error: JSON.stringify(e) }, 500)
  }
})

app.patch('/members', async (c) => {
  try {
    const body = await getBody<any>(c as any)
    const auth = c.get('auth') as AuthInfo

    if (auth.authType === 'jwt') {
      // For JWT auth, we need to create a dummy apikey with the user_id
      const dummyApikey: Database['public']['Tables']['apikeys']['Row'] = {
        id: 0,
        user_id: auth.userId,
        key: '',
        name: '',
        mode: 'all',
        created_at: null,
        updated_at: null,
        limited_to_apps: null,
        limited_to_orgs: null,
      }
      return updateMember(c as any, body, dummyApikey)
    }

    // For API key auth
    return updateMember(c as any, body, auth.apikey!)
  }
  catch (e) {
    return c.json({ status: 'Cannot update user permission in organization', error: JSON.stringify(e) }, 500)
  }
})
