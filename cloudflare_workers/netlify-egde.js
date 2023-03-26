const baseNetlify = 'web.capgo.app'
const transform = (url, request) => {
  const urlNew = new URL(url)
  const end = urlNew.pathname.split('/').pop()
  urlNew.hostname = baseNetlify
  urlNew.pathname = `/api-egde/${end}`
  // console.log('url2', url, urlNew.toString(), await request.json())
  // request.json().then((res) => console.log('res', res))
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
  return transform(request.url, request)
}

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request))
})
