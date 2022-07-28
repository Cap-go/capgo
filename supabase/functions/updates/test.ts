// fetch()
const supaId = 'xvwzpoazmxkqosrdewyv'
const baseSupa = `https://${supaId}.functions.supabase.co`
const transform = {
  auto_update: {
    target: 'updates',
    transform: (request: Request): RequestInit & { url: string } => {
      const {
        cap_version_name,
        cap_version_build,
        cap_plugin_version,
        cap_platform,
        cap_app_id,
        cap_device_id, ...headers
      } = request.headers as any
      const end = request.url.split('/').pop()
      const newUrl = `${baseSupa}/${end}`
      const body = JSON.stringify({
        version_name: cap_version_name,
        version_build: cap_version_build,
        plugin_version: cap_plugin_version,
        platform: cap_platform,
        app_id: cap_app_id,
        device_id: cap_device_id,
      })
      return {
        ...request,
        body,
        headers,
        method: 'POST',
        url: newUrl,
      }
    },
  },
  channel: {
    target: 'channel',
    transform: (url: URL, request: Request): RequestInit & { url: URL } => {
      const headers = { ...request.headers, api_mode: request.method }
      let body = request.body as any
      if (headers.api_mode === 'GET')
        body = Object.fromEntries(url.searchParams)

      return {
        url,
        request: {
          ...request,
          body,
          headers,
          method: 'POST',
        },
      }
    },
  },
  device: {
    target: 'device',
    transform: (url: URL, request: Request): RequestInit & { url: URL } => {
      const headers = { ...request.headers, api_mode: request.method }
      let body = request.body as any
      if (headers.api_mode === 'GET')
        body = Object.fromEntries(url.searchParams)

      return {
        url,
        request: {
          ...request,
          body,
          headers,
          method: 'POST',
        },
      }
    },
  },
}
