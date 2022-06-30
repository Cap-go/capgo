import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@^1.35.3'
import type { definitions } from './types_supabase.ts'
import type { JwtUser } from './types.ts'

export const jwtDecoder = (jwt: string): JwtUser =>
  JSON.parse(atob(jwt.split('.')[1]))

const basicHeaders = {
  'Access-Control-Expose-Headers': 'Content-Length, X-JSON',
  'Content-Type': 'application/json',
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const checkKey = async (authorization: string | undefined, supabase: SupabaseClient, allowed: definitions['apikeys']['mode'][]): Promise<definitions['apikeys'] | null> => {
  if (!authorization)
    return null
  try {
    const { data, error } = await supabase
      .from<definitions['apikeys']>('apikeys')
      .select()
      .eq('key', authorization)
      .in('mode', allowed)
      .single()
    if (!data || error)
      return null
    return data
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
    headers: { ...basicHeaders, ...corsHeaders },
  },
))

export const sendOptionsRes = () => (new Response(
  'ok',
  {
    headers: {
      ...corsHeaders,
    },
  },
))
