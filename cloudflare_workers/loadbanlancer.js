const MAINHOST = 'xvwzpoazmxkqosrdewyv.functions.supabase.co'
const BACKUPHOST = 'netlifyedge.capgo.app'
const BACKUPHOSTNODE = 'netlify.capgo.app'

async function fetchWithTimeout(resource, options = {}) {
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

async function handleRequest(request) {
  const primaryUrl = new URL(request.url)
  primaryUrl.hostname = MAINHOST

  let res
  try {
    res = await fetchWithTimeout(primaryUrl, request.clone())
  }
  catch (err) {
    console.log('err', primaryUrl, err)
    // try second host
    const backupUrl = new URL(request.url)
    backupUrl.hostname = BACKUPHOST
    try {
      res = await fetch(backupUrl, request.clone())
    }
    catch (err) {
      console.log('err', backupUrl, err)
      // try third host
      const backup2Url = new URL(request.url)
      backup2Url.hostname = BACKUPHOSTNODE
      try {
        res = await fetch(backup2Url, request.clone())
      }
      catch (err) {
        console.log('err', backup2Url, err)
        return err
      }
    }
  }
  return res
}

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request))
})
