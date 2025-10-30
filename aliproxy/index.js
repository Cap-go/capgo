// index.js
// Alibaba FC HTTP Trigger with Event Function
const { Buffer } = require('node:buffer')
const https = require('node:https')

const TARGET_HOST = 'plugin.preprod.capgo.app'

exports.handler = function (event, _context, callback) {
  try {
    // Alibaba FC passes the HTTP request as a Buffer containing JSON
    let requestData

    if (Buffer.isBuffer(event)) {
      const eventString = event.toString('utf8')
      requestData = JSON.parse(eventString)
    }
    else if (typeof event === 'string') {
      requestData = JSON.parse(event)
    }
    else {
      requestData = event
    }

    console.log('[DEBUG] Parsed request data:', {
      version: requestData.version,
      rawPath: requestData.rawPath,
      hasHeaders: !!requestData.headers,
      hasBody: !!requestData.body,
      method: requestData.requestContext?.http?.method,
    })

    // Extract request information
    const method = requestData.requestContext?.http?.method || requestData.httpMethod || 'POST'
    const path = requestData.rawPath || requestData.path || '/'
    const headers = requestData.headers || {}
    const bodyString = requestData.body || ''

    // Prepare proxy headers
    const proxyHeaders = { ...headers }
    proxyHeaders.host = TARGET_HOST

    if (!proxyHeaders['user-agent']) {
      proxyHeaders['user-agent'] = 'CapgoAlibabaProxy/1.0'
    }

    // Prepare body buffer
    let bodyBuffer = null
    if (bodyString) {
      bodyBuffer = requestData.isBase64Encoded
        ? Buffer.from(bodyString, 'base64')
        : Buffer.from(bodyString, 'utf8')
      proxyHeaders['content-length'] = bodyBuffer.length
    }

    const options = {
      hostname: TARGET_HOST,
      port: 443,
      path,
      method,
      headers: proxyHeaders,
      timeout: 15000,
    }

    console.log('[DEBUG] Proxying request:', {
      url: `https://${TARGET_HOST}${path}`,
      method,
      hasBody: !!bodyBuffer,
      bodySize: bodyBuffer ? bodyBuffer.length : 0,
    })

    const req = https.request(options, (res) => {
      const chunks = []
      res.on('data', d => chunks.push(d))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)

        // Always return as base64 if compressed or binary
        const encoding = res.headers['content-encoding']
        const isCompressed = encoding === 'gzip' || encoding === 'deflate' || encoding === 'br' || encoding === 'zstd'
        const isTextResponse = !isCompressed && /^(?:text\/|application\/(?:json|javascript|xml))/.test(
          res.headers['content-type'] || '',
        )

        const responseBody = isTextResponse ? buf.toString('utf8') : buf.toString('base64')

        console.log('[DEBUG] Response:', {
          statusCode: res.statusCode,
          contentType: res.headers['content-type'],
          contentEncoding: encoding,
          isCompressed,
          bodySize: buf.length,
        })

        callback(null, {
          statusCode: res.statusCode || 502,
          headers: {
            ...res.headers,
            'access-control-allow-origin': '*',
          },
          body: responseBody,
          isBase64Encoded: !isTextResponse,
        })
      })
    })

    req.on('error', (err) => {
      console.error('[ERROR] Request failed:', err)
      callback(null, {
        statusCode: 502,
        headers: { 'content-type': 'text/plain' },
        body: `upstream error: ${err.message}`,
      })
    })

    if (bodyBuffer) {
      req.write(bodyBuffer)
    }
    req.end()
  }
  catch (err) {
    console.error('[ERROR] Handler exception:', err)
    callback(null, {
      statusCode: 500,
      headers: { 'content-type': 'text/plain' },
      body: `internal error: ${err.message}`,
    })
  }
}
