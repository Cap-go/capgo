const cacheMap = new Map()

self.addEventListener("install", event => {
  self.console.log("Service worker installed");
});
self.addEventListener("activate", async event => {
  self.console.log("Service worker activated ;_");
});

const handleFetch = async (event) => {

  // Get all clients and make sure request is comming from iframe
  const clients = await self.clients.matchAll()
  const iframeClient = clients.find(client => client.id === event.clientId)
  if (!iframeClient || iframeClient.frameType !== 'nested') {
    // Not comming from iframe
    return await fetch(event.request)
  }

  // Comming from iframe, check cache

  const url = new URL(event.request.url)
  const cached = cacheMap.get(url.pathname)

  if (cached !== undefined) {
    // Cache exist - return cached
    const response = new Response(cached.data, { status: 200, headers: { 'Content-Type': cached.mime } })
    return response
  } else {
    // cache does not exist - return with no cache
    return await fetch(event.request)
  }
}

self.addEventListener("fetch", (event) => {
  event.respondWith(handleFetch(event));
})

self.addEventListener('message', async (event) => {
  if (event.data.name === 'cache-new') {
    cacheMap.set(event.data.filename, { mime: event.data.mime, data: event.data.data })
  } else if (event.data.name === 'clear-cache') {
    self.console.log('Clear cache!')
    cacheMap.clear()
  }
});