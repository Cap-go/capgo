import { Hono } from 'hono/tiny'
import { z } from 'zod'
import type { Context } from '@hono/hono'
import { compleateMultipartUpload, createMultipartUpload, multipartUploadPart } from '../utils/s3.ts'

export const app = new Hono()

const actionZod = z.enum(['mpu-complete'])
const baseZodObj = z.object({
  action: actionZod,
  key: z.string(),
})

const uploadObjZod = z.object({
  uploadId: z.string(),
})

const partsBodyZod = z.object({
  parts: z.array(
    z.object({
      ETag: z.string(),
      PartNumber: z.number(),
    }),
  ),
})

const putDataZod = z.object({
  uploadId: z.string(),
  partNumber: z.number(),
  key: z.string(),
})

app.post('/', async (c: Context) => {
  const bodyString = c.req.query('body') ?? 'e30=' // e30= = {}
  let body
  try {
    body = JSON.parse(atob(bodyString))
  }
  catch (err) {
    return c.json({ error: 'Body (header) is not a valid BASE64 encoded json', json_err: JSON.stringify(err) }, 400)
  }

  const parsedAction = baseZodObj.safeParse(body)
  if (!parsedAction.success) {
    console.error({ requestId: c.get('requestId'), context: 'Invalid body', error: parsedAction.error })
    return c.json({ error: 'Invalid body', zod_error: parsedAction.error }, 400)
  }

  if (parsedAction.data.action === 'mpu-complete') {
    const parsedUploadId = uploadObjZod.safeParse(body)
    if (!parsedUploadId.success) {
      console.error({ requestId: c.get('requestId'), context: 'Invalid upload ID', error: parsedUploadId.error })
      return c.json({ error: 'Invalid upload ID', zod_error: parsedUploadId.error }, 400)
    }

    let actualBody
    try {
      actualBody = await c.req.json()
    }
    catch (err) {
      console.error(err)
      return c.json({ error: 'Body is not a valid JSON', json_err: JSON.stringify(err) }, 400)
    }

    const parsedParts = partsBodyZod.safeParse(actualBody)
    if (!parsedParts.success) {
      console.error({ requestId: c.get('requestId'), context: 'Invalid parts body', error: parsedParts.error })
      return c.json({ error: 'Invalid parts body', zod_error: parsedParts.error }, 400)
    }

    try {
      await compleateMultipartUpload(c, parsedAction.data.key, parsedUploadId.data.uploadId, parsedParts.data.parts)
      return c.json({ ok: true }, 200)
    }
    catch (err) {
      console.error({ requestId: c.get('requestId'), context: 'Cannot compleate multipart upload', error: err })
      return c.json({ error: 'Cannot compleate multipart upload' }, 500)
    }
  }
})

app.put('/', async (c: Context) => {
  const bodyString = c.req.query('body') ?? 'e30=' // e30= = {}
  let body
  try {
    body = JSON.parse(atob(bodyString))
  }
  catch (err) {
    return c.json({ error: 'Body (header) is not a valid BASE64 encoded json', json_err: JSON.stringify(err) }, 400)
  }

  const parsedBody = putDataZod.safeParse(body)
  if (!parsedBody.success) {
    console.error({ requestId: c.get('requestId'), context: 'Invalid PUT body', error: parsedBody.error })
    return c.json({ error: 'invalid body', zod_error: parsedBody.error })
  }

  const uploadBody = await c.req.raw.arrayBuffer()
  if (!uploadBody) {
    return c.json({ error: 'No upload body (file body)' }, 400)
  }

  const contentLength = c.req.header('Content-Length')
  if (!contentLength) {
    return c.json({ error: 'No "Content-Length" header' }, 400)
  }

  const contentLengthNum = Number.parseInt(contentLength)
  if (Number.isNaN(contentLengthNum)) {
    return c.json({ error: 'Header "Content-Length" is not a number' }, 400)
  }

  console.log({ requestId: c.get('requestId'), context: 'len', contentLengthNum })

  try {
    const res = await multipartUploadPart(c, parsedBody.data.key, parsedBody.data.uploadId, parsedBody.data.partNumber, contentLengthNum, new Uint8Array(uploadBody))
    return c.json({
      ETag: res.ETag,
      PartNumber: parsedBody.data.partNumber,
    })
  }
  catch (err) {
    console.error({ requestId: c.get('requestId'), context: 'Cannot upload multipart part', error: err })
    return c.json({ error: 'Cannot upload multipart part' }, 500)
  }
})

export async function initMultipartUpload(c: Context, key: string) {
  try {
    const res = await createMultipartUpload(c, key)
    return {
      uploadId: res.UploadId,
    }
  }
  catch (err) {
    console.log({ requestId: c.get('requestId'), context: 'Cannot create multipart upload', error: err })
    return { error: 'Cannot create multipart upload' }
  }
}
