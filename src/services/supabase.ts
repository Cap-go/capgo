import type { SupabaseClientOptions } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import type { HttpOptions } from '@capacitor-community/http'
import { Http } from '@capacitor-community/http'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const useSupabase = () => {
  const options: SupabaseClientOptions = {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    /* Supabase expects a Response (https://developer.mozilla.org/en-US/docs/Web/API/Response)
      returned from the function. Else it will break.
    */
    fetch: (requestInfo, requestInit) => {
      const data = requestInit?.body
      delete requestInit?.body
      const obj: HttpOptions = {
        url: requestInfo,
        data,
        ...requestInit,
      } as HttpOptions
      console.log('supabase fetch', obj)
      return Http.request(obj)
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
