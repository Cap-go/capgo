import type { SupabaseClient } from '@supabase/supabase-js'
import type { definitions } from '~/types/supabase'

export const basicHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

export const sendRes = (data: any = { status: 'ok' }, statusCode = 200) => ({
  statusCode,
  headers: basicHeaders,
  body: JSON.stringify(data),
})

export const checkKey = async(authorization: string | undefined, supabase: SupabaseClient, unAllowed: definitions['apikeys']['mode'][]): Promise<definitions['apikeys'] | null> => {
  if (!authorization)
    return null
  try {
    const { data, error } = await supabase
      .from<definitions['apikeys']>('apikeys')
      .select()
      .eq('key', authorization)
    if (!data || !data.length || error || unAllowed.includes(data[0].mode))
      return null
    return data[0]
  }
  catch (error) {
    console.error(error)
    return null
  }
}
