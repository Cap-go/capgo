const BACKUP_HOST: string = 'web.capgo.app'
const MAIN_HOST: string = 'xvwzpoazmxkqosrdewyv.functions.supabase.co'

interface RequestOptions extends RequestInit {
  timeout?: number
}

async function fetchWithTimeout(resource: RequestInfo, options: RequestOptions = {}): Promise<Response> {
  const { timeout = 5000 } = options
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal,
  })
  clearTimeout(id)
  return response
}

async function handleRequest(request: Request): Promise<Response> {
  const primaryUrl = new URL(request.url)
  primaryUrl.hostname = MAIN_HOST
  let res: Response
  try {
    res = await fetchWithTimeout(primaryUrl.toString(), request.clone())
  }
  catch (err) {
    console.log('err', primaryUrl, err)
    // try the second host
    const backupUrl = new URL(request.url)
    backupUrl.hostname = BACKUP_HOST
    const end = backupUrl.pathname.split('/').pop()
    // https://web.capgo.app/api-egde/ok
    backupUrl.pathname = `/api-egde/${end}`
    try {
      // Use fetchWithTimeout for the backup requests as well
      res = await fetchWithTimeout(backupUrl.toString(), request.clone())
    }
    catch (err) {
      console.log('err', backupUrl, err)
      // try the third host
      // https://web.capgo.app/api/ok
      const backup2Url = new URL(request.url)
      backup2Url.hostname = BACKUP_HOST
      const end = backup2Url.pathname.split('/').pop()
      backup2Url.pathname = `/api/${end}`
      try {
        res = await fetchWithTimeout(backup2Url.toString(), request.clone())
      }
      catch (err) {
        console.log('err', backup2Url, err)
        return new Response('Error', { status: 500 })
      }
    }
  }
  return res
}

addEventListener('fetch', (event: FetchEvent) => {
  event.respondWith(handleRequest(event.request))
})
