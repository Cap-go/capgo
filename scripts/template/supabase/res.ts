import { basicHeaders, corsHeaders } from '../../../supabase/functions/_utils/utils.ts'

// upper is ignored during netlify generation phase
// import from here
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
