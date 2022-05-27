import { serve } from 'https://deno.land/std@0.139.0/http/server.ts'
import { supabaseAdmin  } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { checkKey, sendRes } from '../_utils/utils.ts'
import { create, getNumericDate, Header, Payload } from "https://deno.land/x/djwt@v2.2/mod.ts";


serve(async(event: Request) => {
  const apikey_string = event.headers.get('apikey')
  if (!apikey_string)
    return sendRes({ status: 'Cannot find authorization' }, 400)
  const apikey: definitions['apikeys'] | null = await checkKey(apikey_string, supabaseAdmin, ['upload', 'all', 'write', 'read'])
  // get user from apikey.user_id
  console.log('apikey', apikey_string, apikey)
  if (!apikey)
    return sendRes({ status: 'Cannot verify key' }, 400)
  try {
    const { data } = await supabaseAdmin
    .from<definitions['users']>('users')
    .select()
    .eq('id', apikey.user_id)
    if (!data || !data.length)
      return sendRes({ status: 'Cannot verify User' }, 400)
    const user = data[0]
    const key = Deno.env.get('JWT_SIGN') || ''
    const payload: Payload = {
      "aud": "authenticated",
      "exp": getNumericDate(new Date().getTime() + 3600),
      "sub": apikey.user_id,
      "email": user.email,
      "phone": "",
      "app_metadata": {
        "provider": "email",
        "providers": [
          "email"
        ]
      },
      "user_metadata": {},
      "role": "authenticated"
    }
    const header: Header = {
      alg: "HS256",
      typ: "JWT",
    };
    return sendRes({apikey, jtw: await create(header, payload, key)})
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
