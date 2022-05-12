import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@^1.35.3'
import type { definitions } from '../_utils/types_supabase.ts'
import type { JwtUser } from './types.ts'

export const jwtDecoder = (jwt: string): JwtUser =>
  JSON.parse(atob(jwt.split('.')[1]))

const basicHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

export const checkKey = async(authorization: string | undefined, supabase: SupabaseClient, allowed: definitions['apikeys']['mode'][]): Promise<definitions['apikeys'] | null> => {
  if (!authorization)
    return null
  try {
    const { data, error } = await supabase
      .from<definitions['apikeys']>('apikeys')
      .select()
      .eq('key', authorization)
    if (!data || !data.length || error || !allowed.includes(data[0].mode))
      return null
    return data[0]
  }
  catch (error) {
    console.error(error)
    return null
  }
}

export const sendRes = (data: any = { status: 'ok' }, statusCode = 200) => (new Response(
  JSON.stringify(data),
  {
    status: statusCode,
    headers: { ...basicHeaders, 'Content-Type': 'application/json' },
  },
))
