export default {
  async fetch(request: Request, env: any) {
    try {
      const requestUrl = new URL(request.url)
      const functionName = requestUrl.pathname.split('/').pop()
      if (!functionName || functionName.length === 0)
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })

      return new Response(functionName)
    }
    catch (e) {
      console.error(e)
      return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 })
    }
  },
}
