import type { SupabaseClientOptions } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { Http } from '@capacitor-community/http'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const useSupabase = () => {
  const options: SupabaseClientOptions = {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    fetch: (requestInfo, requestInit) => {
      const url = requestInfo.toString()
      if (requestInit?.method === 'POST' && (url.includes('/storage/') || url.includes('/rpc/'))) {
        return fetch(requestInfo, {
          method: requestInit?.method,
          signal: requestInit?.signal || undefined,
          headers: requestInit?.headers,
          body: requestInit?.body,
        })
      }
      return Http.request({
        url,
        method: requestInit?.method,
        headers: requestInit?.headers as any || {},
        data: requestInit?.body,
      })
        .then((data) => {
          const resp = new Response(JSON.stringify(data.data), {
            status: data.status,
            headers: data.headers,
          })
          return resp
        })
    },
  }
  return createClient(supabaseUrl, supabaseAnonKey, options)
}

export const autoAuth = async (route: RouteLocationNormalizedLoaded) => {
  const supabase = useSupabase()
  const session = supabase.auth.session()!
  if (session || !route.hash)
    return null
  const queryString = route.hash.replace('#', '')
  const urlParams = new URLSearchParams(queryString)
  const refresh_token = urlParams.get('refresh_token')
  if (!refresh_token)
    return null
  const logSession = await supabase.auth.signIn({
    refreshToken: refresh_token || '',
  })
  return logSession
}
