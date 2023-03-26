const supaId = 'xvwzpoazmxkqosrdewyv'
const supaHost = `${supaId}.functions.supabase.co`
const transform = (request) => {
  const urlNew = new URL(request.url)
  const end = urlNew.pathname.split('/').pop()
  urlNew.hostname = supaHost
  urlNew.pathname = `/${end}`
  const headers = {
    ...Object.fromEntries(request.headers.entries()),
    host: urlNew.host,
  }
  return fetch(urlNew.toString(), {
    ...request,
    headers,
  })
}

async function handleRequest(request) {
  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      statusText: 'ok',
    })
  }
  return transform(request)
}

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request))
})
