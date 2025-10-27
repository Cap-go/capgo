// index.js
// Super-simple Alibaba FC HTTP proxy to plugin.capgo.app
const https = require('node:https')
const querystring = require('node:querystring')

const TARGET_HOST = 'plugin.usecapgo.com'
const ALLOWED_HOST = TARGET_HOST // for quick safety check

exports.handler = function (event, context, callback) {
  try {
    // FC event: supports event.path, event.httpMethod, event.headers, event.body, event.isBase64Encoded
    const method = event.httpMethod || event.method || 'GET'
    const incomingPath = event.path || '/'
    // build querystring from either event.queryStringParameters or event.query (depends on trigger)
    const qsObj = event.queryStringParameters || event.query || {}
    const qs = Object.keys(qsObj).length ? `?${querystring.stringify(qsObj)}` : ''

    const path = incomingPath + qs

    // copy headers but replace/omit host
    const headers = Object.assign({}, event.headers || {})
    headers.host = TARGET_HOST

    // Basic security: avoid proxying to arbitrary hosts (we only allow TARGET_HOST)
    if (headers['x-forward-to'] && headers['x-forward-to'] !== ALLOWED_HOST) {
      callback(null, {
        statusCode: 400,
        headers: { 'content-type': 'text/plain' },
        body: 'forward-to not allowed',
      })
      return
    }

    const options = {
      hostname: TARGET_HOST,
      port: 443,
      path,
      method,
      headers,
      timeout: 15000, // ms
    }

    // prepare body
    let bodyBuffer = null
    if (event.body) {
      bodyBuffer = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body, 'utf8')
      // ensure Content-Length
      options.headers['content-length'] = bodyBuffer.length
    }

    const req = https.request(options, (res) => {
      const chunks = []
      res.on('data', d => chunks.push(d))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        // try to detect text vs binary (simple heuristic). If binary, return base64.
        const isBinary = !/^(text\/|application\/(json|javascript|xml|x-www-form-urlencoded))/i.test(res.headers['content-type'] || '')
        const outBody = isBinary ? buf.toString('base64') : buf.toString('utf8')

        // return response in FC expected shape
        callback(null, {
          statusCode: res.statusCode || 502,
          headers: Object.assign({}, res.headers, {
            // tweak: ensure CORS for browsers (optional)
            'access-control-allow-origin': headers.origin || '*',
          }),
          body: outBody,
          isBase64Encoded: !!isBinary,
        })
      })
    })

    req.on('error', (err) => {
      callback(null, {
        statusCode: 502,
        headers: { 'content-type': 'text/plain' },
        body: `upstream error: ${String(err.message || err)}`,
      })
    })

    if (bodyBuffer)
      req.write(bodyBuffer)
    req.end()
  }
  catch (err) {
    callback(null, {
      statusCode: 500,
      headers: { 'content-type': 'text/plain' },
      body: `internal error: ${String(err.message || err)}`,
    })
  }
}
