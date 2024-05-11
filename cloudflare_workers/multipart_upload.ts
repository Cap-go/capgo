interface Env {
  MY_BUCKET: R2Bucket
  MAGIC_MULTIPART_SECRET: string
}

export default {
  async fetch(
    request,
    env,
    ctx,
  ): Promise<Response> {
    const bucket = env.MY_BUCKET

    const url = new URL(request.url)

    const body = JSON.parse(atob(url.searchParams.get('body') ?? 'e30=')) // e30= = {}

    const key = body.key as string
    const action = body.action as string

    if (action === null)
      return new Response('Missing action type', { status: 400 })

    // Route the request based on the HTTP method and action type
    switch (request.method) {
      case 'POST':
        switch (action) {
          case 'mpu-create': {
            const secretHeader = request.headers.get('MAGIC_MULTIPART_SECRET') ?? ''
            const encoder = new TextEncoder()
            const encodedSecretHeader = encoder.encode(secretHeader)
            const encodedSecret = encoder.encode(env.MAGIC_MULTIPART_SECRET)

            if (
              encodedSecret.byteLength != encodedSecretHeader.byteLength
              || !crypto.subtle.timingSafeEqual(encodedSecretHeader, encodedSecret)
            ) {
              return new Response(
                JSON.stringify({
                  // key: multipartUpload.key,
                  error: 'Invalid secret',
                }),
              )
            }

            const multipartUpload = await bucket.createMultipartUpload(key)
            return new Response(
              JSON.stringify({
                // key: multipartUpload.key,
                uploadId: multipartUpload.uploadId,
              }),
            )
          }
          case 'mpu-complete': {
            const uploadId = body.uploadId
            if (uploadId === null)
              return new Response('Missing uploadId', { status: 400 })

            const multipartUpload = env.MY_BUCKET.resumeMultipartUpload(
              key,
              uploadId,
            )

            interface completeBody {
              parts: R2UploadedPart[]
            }
            const completeBody: completeBody = await request.json()
            if (completeBody === null) {
              return new Response('Missing or incomplete body', {
                status: 400,
              })
            }

            // Error handling in case the multipart upload does not exist anymore
            try {
              const object = await multipartUpload.complete(completeBody.parts)
              return new Response(null, {
                headers: {
                  etag: object.httpEtag,
                },
              })
            }
            catch (error: any) {
              return new Response(error.message, { status: 400 })
            }
          }
          default:
            return new Response(`Unknown action ${action} for POST`, {
              status: 400,
            })
        }
      case 'PUT':
        switch (action) {
          case 'mpu-uploadpart': {
            const uploadId = body.uploadId
            const partNumberString = body.partNumber
            if (partNumberString === null || uploadId === null) {
              return new Response('Missing partNumber or uploadId', {
                status: 400,
              })
            }
            if (request.body === null)
              return new Response('Missing request body', { status: 400 })

            const partNumber = Number.parseInt(partNumberString)
            const multipartUpload = env.MY_BUCKET.resumeMultipartUpload(
              key,
              uploadId,
            )
            try {
              const uploadedPart: R2UploadedPart
          = await multipartUpload.uploadPart(partNumber, request.body)
              return new Response(JSON.stringify(uploadedPart))
            }
            catch (error: any) {
              return new Response(error.message, { status: 400 })
            }
          }
          default:
            return new Response(`Unknown action ${action} for PUT`, {
              status: 400,
            })
        }
      case 'GET':
        if (action !== 'get') {
          return new Response(`Unknown action ${action} for GET`, {
            status: 400,
          })
        }
        const object = await env.MY_BUCKET.get(key)
        if (object === null)
          return new Response('Object Not Found', { status: 404 })

        const headers = new Headers()
        object.writeHttpMetadata(headers)
        headers.set('etag', object.httpEtag)
        return new Response(object.body, { headers })
      case 'DELETE':
        switch (action) {
          case 'mpu-abort': {
            const uploadId = url.searchParams.get('uploadId')
            if (uploadId === null)
              return new Response('Missing uploadId', { status: 400 })

            const multipartUpload = env.MY_BUCKET.resumeMultipartUpload(
              key,
              uploadId,
            )

            try {
              multipartUpload.abort()
            }
            catch (error: any) {
              return new Response(error.message, { status: 400 })
            }
            return new Response(null, { status: 204 })
          }
          case 'delete': {
            await env.MY_BUCKET.delete(key)
            return new Response(null, { status: 204 })
          }
          default:
            return new Response(`Unknown action ${action} for DELETE`, {
              status: 400,
            })
        }
      default:
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { Allow: 'PUT, POST, GET, DELETE' },
        })
    }
  },
} satisfies ExportedHandler<Env>
