/**
 * Cloudflare Snippet to filter requests by app_id
 *
 * This snippet blocks requests to plugin endpoints if the app_id
 * is NOT in the allowed list (i.e., apps not using Capgo).
 *
 * Filtered endpoints:
 * - /updates (POST)
 * - /stats (POST)
 * - /channel_self (POST, PUT, DELETE, GET)
 *
 * Note: app_id is in the request body for POST/PUT, and in query params for GET/DELETE
 *
 * Deploy this as a Cloudflare Snippet and attach it to your zone.
 * Reference: https://developers.cloudflare.com/rules/snippets/when-to-use/
 */

export default {
  async fetch(request) {
    const url = new URL(request.url)

    // Define which endpoints to filter
    const FILTERED_ENDPOINTS = ['/updates', '/stats', '/channel_self']

    // Check if the request is for one of the filtered endpoints
    const isFilteredEndpoint = FILTERED_ENDPOINTS.some(endpoint => url.pathname.includes(endpoint))

    if (!isFilteredEndpoint) {
      return fetch(request)
    }

    // Only filter specific HTTP methods for each endpoint
    const method = request.method

    // /updates only accepts POST
    // /stats only accepts POST
    // /channel_self accepts POST, PUT, DELETE, GET (all need filtering)
    const shouldFilter
      = (url.pathname.includes('/updates') && method === 'POST')
        || (url.pathname.includes('/stats') && method === 'POST')
        || (url.pathname.includes('/channel_self') && ['POST', 'PUT', 'DELETE', 'GET'].includes(method))

    if (!shouldFilter) {
      return fetch(request)
    }

    // List of app_ids that are NOT using Capgo (blocked apps)
    // Update this array with the app IDs you want to block
    const BLOCKED_APP_IDS = [
      'com.example.notcapgo',
      'com.another.blocked',
      // Add more app IDs here
    ]

    try {
      let appId

      // For GET and DELETE on /channel_self, app_id is in query params
      if ((method === 'DELETE' || method === 'GET') && url.pathname.includes('/channel_self')) {
        appId = url.searchParams.get('app_id')
      }
      else {
        // For POST and PUT methods, app_id is in the body
        const clonedRequest = request.clone()
        const body = await clonedRequest.json()
        appId = body.app_id
      }

      if (!appId) {
        // If no app_id in body, block the request
        return new Response(JSON.stringify({
          message: 'Missing app_id in request',
          error: 'missing_app_id',
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      }

      // BLOCKLIST APPROACH: Block if app_id is in the blocked list
      if (BLOCKED_APP_IDS.includes(appId)) {
        return new Response(JSON.stringify({
          message: 'This app is not authorized to use this service',
          error: 'unauthorized_app',
        }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      }

      // App is allowed, forward the request
      return fetch(request)
    }
    catch {
      // If there's an error parsing the body, forward the request
      // (let the backend handle invalid requests)
      return fetch(request)
    }
  },
}
