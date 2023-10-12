import { basicHeaders, corsHeaders } from '../../../supabase/functions/_utils/utils.ts'

// upper is ignored during netlify generation phase
// import from here
export function appendHeaders(res: Response, key: string, value: string) {
  res.headers.append(key, value)
}

export function sendResText(data: string, statusCode = 200) {
  if (statusCode >= 400)
    console.error('sendRes error', JSON.stringify(data, null, 2))

  return new Response(
    data,
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
