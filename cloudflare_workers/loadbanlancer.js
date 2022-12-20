const HOSTS = [
  'supabase.capgo.app',
  'netlify.capgo.app',
]

const getRandomInt = (max) => {
  return Math.floor(Math.random() * max)
}

const fetchWithTimeout = async (resource, options = {}) => {
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

const handleRequest = async (request) => {
  // Randomly pick the next host
  const primary = getRandomInt(HOSTS.length)
  const primaryUrl = new URL(request.url)
  primaryUrl.hostname = HOSTS[primary]

  // Fallback if there is no response within timeout
  let backup
  do {
    // Naive solution to pick a backup host
    backup = getRandomInt(HOSTS.length)
  } while (backup === primary)

  const backupUrl = new URL(request.url)
  backupUrl.hostname = HOSTS[backup]

  // console.log("yoyo2", primary, primaryUrl.toString(), backupUrl.toString())
  let res
  try {
    res = await fetchWithTimeout(primaryUrl, request.clone())
  }
  catch (err) {
    console.log('err', primaryUrl, err)
    res = await fetch(backupUrl, request.clone())
  }
  // console.log("yoyo3", res)
  return res
}

addEventListener('fetch', (event) => {
  // console.log("yoyo")
  event.respondWith(handleRequest(event.request))
})
