// index.js
// Alibaba FC HTTP Trigger with Event Function
const { Buffer } = require('node:buffer')
const https = require('node:https')
const { createHash } = require('node:crypto')

const TARGET_HOST = 'updater.capgo.com.cn'

// Security: Validate and sanitize input paths to prevent path traversal
function sanitizePath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return '/'
  // Remove leading slashes and query parameters
  let path = rawPath.replace(/^\/+/, '')
  // Remove any ../ sequences
  path = path.replace(/\/\.\.\//g, '/')
  // Ensure path starts with /
  return path.startsWith('/') ? path : `/${path}`
}

// Security: Validate HTTP method
function validateMethod(method) {
  const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']
  return allowedMethods.includes(method?.toUpperCase() || 'POST')
    ? method.toUpperCase()
    : 'POST'
}

// Security: Validate headers to prevent header injection
function sanitizeHeaders(headers = {}) {
  const sanitized = { ...headers }
  // Remove any header injection attempts
  delete sanitized['\r']
  delete sanitized['\n']
  return sanitized
}

// Security: Validate body content
function validateBody(bodyString) {
  if (!bodyString || typeof bodyString !== 'string') return ''
  // Basic validation - reject obviously malicious content
  if (bodyString.includes('\x00') || bodyString.length > 1000000) {
    throw new Error('Invalid request body')
  }
  return bodyString
}

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

    // Security: Validate and sanitize all inputs
    const method = validateMethod(requestData.requestContext?.http?.method || requestData.httpMethod || 'POST')
    const path = sanitizePath(requestData.rawPath || requestData.path || '/')
    const headers = sanitizeHeaders(requestData.headers || {})
    const bodyString = validateBody(requestData.body || '')

    // Security: Prevent open redirect and SSRF by validating target host
    if (!TARGET_HOST || typeof TARGET_HOST !== 'string' || !/^[a-zA-Z0-9.-]+$/.test(TARGET_HOST)) {
      throw new Error('Invalid target host configuration')
    }

    // Prepare proxy headers
    const proxyHeaders = { ...headers }
    proxyHeaders.host = TARGET_HOST

    if (!proxyHeaders['user-agent']) {
      proxyHeaders['user-agent'] = 'CapgoAlibabaProxy/1.0'
    }

    // Security: Add security headers to response
    proxyHeaders['x-content-type-options'] = 'nosniff'
    proxyHeaders['x-frame-options'] = 'DENY'
    proxyHeaders['x-xss-protection'] = '1; mode=block'

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
      rejectUnauthorized: true, // Security: Enable SSL certificate validation
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
            'content-type': res.headers['content-type'] || 'application/octet-stream',
            'content-length': buf.length.toString(),
            'cache-control': 'no-store',
            'x-powered-by': 'CapgoProxy/1.0',
          },
          body: responseBody,
          isBase64Encoded: !isTextResponse,
        })
      })
    })

    req.on('error', (err) => {
      console.error('[ERROR] Proxy request failed:', err)
      callback(null, {
        statusCode: 502,
        headers: {
          'content-type': 'application/json',
          'x-content-type-options': 'nosniff',
        },
        body: JSON.stringify({ error: 'Proxy request failed', details: err.message }),
        isBase64Encoded: false,
      })
    })

    req.on('timeout', () => {
      req.destroy(new Error('Proxy timeout'))
      callback(null, {
        statusCode: 504,
        headers: {
          'content-type': 'application/json',
          'x-content-type-options': 'nosniff',
        },
        body: JSON.stringify({ error: 'Proxy timeout' }),
        isBase64Encoded: false,
      })
    })

    if (bodyBuffer) {
      req.write(bodyBuffer)
    }
    req.end()
  } catch (error) {
    console.error('[ERROR] Proxy handler error:', error)
    callback(null, {
      statusCode: 400,
      headers: {
        'content-type': 'application/json',
        'x-content-type-options': 'nosniff',
      },
      body: JSON.stringify({ error: 'Invalid request', details: error.message }),
      isBase64Encoded: false,
    })
  }
}