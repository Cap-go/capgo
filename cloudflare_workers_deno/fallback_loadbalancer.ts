const BACKUP_HOST: string = 'web.capgo.app'
const MAIN_HOST: string = 'xvwzpoazmxkqosrdewyv.supabase.co'

interface RequestOptions extends RequestInit {
  timeout?: number
}

async function fetchWithTimeout(resource: RequestInfo, options: RequestOptions = {}): Promise<Response> {
  console.log('fetch', resource)
  const { timeout = 5000 } = options
  const controller = new AbortController()
  const id = setTimeout(() => {
    console.log('timeout')
    controller.abort()
  }, timeout)
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal,
  })
  clearTimeout(id)
  return response
}

function getPrefixURL(request: Request, urlPrefix: string, host = MAIN_HOST) {
  const backupUrl = new URL(request.url)
  backupUrl.hostname = host
  const end = backupUrl.pathname.split('/').pop()
  backupUrl.pathname = `/${urlPrefix}/${end}`
  return backupUrl.toString()
}

export async function fallback(request: Request): Promise<Response> {
  let res: Response
  const forwardOptions: RequestOptions = {
    redirect: 'follow',
    body: request.body,
    method: request.method,
    headers: request.headers,
  }
  const primaryUrl = getPrefixURL(request, 'functions/v1')
  try {
    res = await fetchWithTimeout(primaryUrl.toString(), forwardOptions)
  }
  catch (err) {
    console.log(`Error fetching ${primaryUrl}`)
    console.log(err)
    // https://web.capgo.app/api-edge/ok
    const backupUrl = getPrefixURL(request, 'api-egde', BACKUP_HOST)
    try {
      res = await fetchWithTimeout(backupUrl, forwardOptions)
    }
    catch (err_2) {
      console.log(`Error fetching ${backupUrl}`)
      console.log(err_2)
      // https://web.capgo.app/api/ok
      const backup2Url = getPrefixURL(request, 'api', BACKUP_HOST)
      try {
        res = await fetchWithTimeout(backup2Url, forwardOptions)
      }
      catch (err_3) {
        console.log(`Error fetching ${backup2Url}`)
        console.log(err_3)
        return new Response('Error', { status: 500 })
      }
    }
  }
  return res
}
