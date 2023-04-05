import { hmac } from 'https://deno.land/x/hmac@v2.0.1/mod.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@^2.2.3'
import type { Database } from './supabase.types.ts'
import type { Details, JwtUser } from './types.ts'

export function jwtDecoder(jwt: string): JwtUser {
  return JSON.parse(atob(jwt.split('.')[1]))
}

export const fetchLimit = 50

export const methodJson = ['POST', 'PUT', 'PATCH']

export const basicHeaders = {
  'Access-Control-Expose-Headers': 'Content-Length, X-JSON',
  'Content-Type': 'application/json',
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export async function checkKey(authorization: string | undefined,
  supabase: SupabaseClient<Database>, allowed: Database['public']['Enums']['key_mode'][]): Promise<Database['public']['Tables']['apikeys']['Row'] | null> {
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

export function sendResBg(data: any = { status: 'ok' }, statusCode = 200) {
  if (statusCode >= 400)
    console.error('sendResBg error', JSON.stringify(data, null, 2))
}

export function sendRes(data: any = { status: 'ok' }, statusCode = 200) {
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

export function sendOptionsRes() {
  return new Response(
    'ok',
    {
      headers: {
        ...corsHeaders,
      },
    },
  )
}

export function getEnv(key: string): string {
  const val = Deno.env.get(key)
  return val || ''
}

export function makeHMACContent(payload: string, details: Details) {
  return `${details.timestamp}.${payload}`
}

export function createHmac(data: string, details: Details) {
  return hmac('sha256', getEnv('STRIPE_WEBHOOK_SECRET') || '', makeHMACContent(data, details), 'utf8', 'hex')
}
