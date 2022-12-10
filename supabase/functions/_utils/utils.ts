import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@^2.1.2'

import type { Database } from './supabase.types.ts'
import type { JwtUser } from './types.ts'

export const jwtDecoder = (jwt: string): JwtUser =>
  JSON.parse(atob(jwt.split('.')[1]))

export const fetchLimit = 50

const basicHeaders = {
  'Access-Control-Expose-Headers': 'Content-Length, X-JSON',
  'Content-Type': 'application/json',
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const checkKey = async (authorization: string | undefined,
  supabase: SupabaseClient<Database>, allowed: Database['public']['Enums']['key_mode'][]): Promise<Database['public']['Tables']['apikeys']['Row'] | null> => {
  if (!authorization)
    return null
  try {
    const { data, error } = await supabase
      .from('apikeys')
      .select()
      .eq('key', authorization)
      .in('mode', allowed)
      .single()
    if (!data || error)
      return null
    return data
  }
  catch (error) {
    console.log(error)
    return null
  }
}

export const sendRes = (data: any = { status: 'ok' }, statusCode = 200) => {
  if (statusCode >= 400)
    console.error('sendRes error', JSON.stringify(data, null, 2))

  return new Response(
    JSON.stringify(data),
    {
      status: statusCode,
      headers: { ...basicHeaders, ...corsHeaders },
    },
  )
}

export const sendOptionsRes = () => (new Response(
  'ok',
  {
    headers: {
      ...corsHeaders,
    },
  },
))
