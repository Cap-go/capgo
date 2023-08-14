// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from 'https://deno.land/std@0.188.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendOptionsRes, sendRes } from '../_utils/utils.ts'

const supabaseUrl: string = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseAnonKey: string = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

serve(async (req: Request) => {
  if (req.method === 'OPTIONS')
    return sendOptionsRes()
  try {
    // Create a Supabase client with the Auth context of the logged in user.
    const supabaseClient = createClient(
      // Supabase API URL - env var exported by default.
      supabaseUrl,
      // Supabase API ANON KEY - env var exported by default.
      supabaseAnonKey,
      // Create client with Auth context of the user that called the function.
      // This way your row-level-security (RLS) policies are applied.
      {
        global: { headers: { Authorization: req.headers.get('Authorization')! } },
        auth: { autoRefreshToken: true, persistSession: false, detectSessionInUrl: false },
      },
    )

    // Now we can get the session or user object
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (user === null)
      return sendRes({ error: 'Invalid auth data' }, 400)

    const apikey = (await req.json()).apikey

    if (typeof apikey !== 'string')
      return sendRes({ error: 'Did not provide valid API key to be regenerated' }, 400)

    const newApiKey = crypto.randomUUID()

    const { error } = await supabaseClient
      .from('apikeys')
      .update({ key: newApiKey })
      .eq('user_id', user.id)
      .eq('key', apikey)

    if (error)
      throw error

    return sendRes({ newKey: newApiKey }, 200)
  }
  catch (error: any) {
    return sendRes({ error: error.message }, 400)
  }
})

// To invoke:
// curl -i --location --request POST 'http://localhost:54321/functions/v1/' \
//   --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
//   --header 'Content-Type: application/json' \
//   --data '{"name":"Functions"}'
