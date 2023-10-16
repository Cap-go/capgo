import { basicHeaders, corsHeaders } from 'supabase/functions/_utils/utils'

// upper is ignored during netlify generation phase
// import from here
export function appendHeaders(res: any, key: string, value: string) {
  res.headers[key] = value
}

export function sendResText(data: string, statusCode = 200) {
  if (statusCode >= 400)
    console.error('sendRes error', JSON.stringify(data, null, 2))

  return {
    statusCode,
    headers: { ...basicHeaders, ...corsHeaders },
    body: data,
  }
}

export function sendOptionsRes() {
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: 'ok',
  }
}
