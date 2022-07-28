// fetch()
interface transformRes { url: URL; request: RequestInit }
const transform = {
  auto_update: {
    target: 'updates',
    transform: (url: URL, request: Request): transformRes => {
      const {
        cap_version_name,
        cap_version_build,
        cap_plugin_version,
        cap_platform,
        cap_app_id,
        cap_device_id, ...headers
      } = request.headers as any
      return {
        url,
        request: {
          ...request,
          body: JSON.stringify({
            version_name: cap_version_name,
            version_build: cap_version_build,
            plugin_version: cap_plugin_version,
            platform: cap_platform,
            app_id: cap_app_id,
            device_id: cap_device_id,
          }),
          headers,
          method: 'POST',
        },
      }
    },
  },
  channel: {
    target: 'channel',
    transform: (url: URL, request: Request): transformRes => {
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
