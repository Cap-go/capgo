const baseNetlify = 'capgo.app'
const transform = {
  default: (url, request) => {
    const urlNew = new URL(url)
    const end = urlNew.pathname.split('/').pop()
    urlNew.hostname = baseNetlify
    urlNew.pathname = `/api/${end}`
    // console.log('url2', url, urlNew.toString(), await request.json())
    // request.json().then((res) => console.log('res', res))
    const headers = {
      ...Object.fromEntries(request.headers.entries()),
      host: urlNew.host,
      api_mode: request.method,
    }
    return fetch(urlNew.toString(), {
      ...request,
      headers,
    })
  },
  auto_update: (url, request) => {
    const urlNew = new URL(url)
    urlNew.pathname = '/updates'
    // console.log('url', urlNew.toString())
    return transform.default(urlNew.toString(), request)
  },
}

async function handleRequest(request) {
  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      statusText: 'ok',
    })
  }
  const url = new URL(request.url)
  let end = url.pathname.split('/').pop()
  if (!transform[end])
    end = 'default'

  return transform[end](url.toString(), request)
}

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request))
})
