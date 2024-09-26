import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl as getSignedUrlSDK } from '@aws-sdk/s3-request-presigner'
import { Hono } from 'hono/tiny'
import { z } from 'zod'
import type { Context } from '@hono/hono'
import { middlewareKey } from '../utils/hono.ts'
import { initS3 } from '../utils/s3.ts'
import { hasAppRight, supabaseAdmin } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'

const validFilePathRegex = /^(?!\/|.*(?:^|\/)\.\.|.*\0)(?:[^/\0]+(?:\/[^/\0]+)*)?$/

function isValidFilePath(path: string): boolean {
  return validFilePathRegex.test(path)
}

const hexRegex = /[0-9a-f]+/i

const bodySchema = z.object({
  name: z.string(),
  app_id: z.string(),
  manifest: z.object({
    file: z.string().refine(val => isValidFilePath(val), {
      message: 'Manifest file path containst directory traversal attempt or it starts with a "/"',
    }),
    hash: z.string().refine(val => hexRegex.test(val), {
      message: 'The manifest hash does not match the HEX regex (/[0-9a-fA-F]+/)',
    }),
  }).array().max(10),
})

export const app = new Hono()

app.post(middlewareKey(['all', 'write', 'upload']), async (c: Context) => {
  try {
    const rawBody = await c.req.json()
    const parsedBody = bodySchema.safeParse(rawBody)
    if (parsedBody.error) {
      console.error(c.get('requestId'), '[partial update] Cannot parse body', parsedBody.error)
      return c.json({ status: 'Cannot parse body', error: parsedBody.error }, 400)
    }

    const body = parsedBody.data
    console.log(c.get('requestId'), 'post partial upload body', body)

    const apikey = c.get('apikey')
    const capgkey = c.get('capgkey')
    console.log(c.get('requestId'), 'apikey', apikey)
    console.log(c.get('requestId'), 'capgkey', capgkey)

    const { data: userId, error: _errorUserId } = await supabaseAdmin(c)
      .rpc('get_user_id', { apikey: capgkey, app_id: body.app_id })
    if (_errorUserId) {
      console.log(c.get('requestId'), '_errorUserId', _errorUserId)
      return c.json({ status: 'Error User not found' }, 500)
    }

    if (!(await hasAppRight(c, body.app_id, userId, 'read'))) {
      console.log(c.get('requestId'), 'no read')
      return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
    }

    const { data: app, error: errorApp } = await supabaseAdmin(c)
      .from('apps')
      .select('app_id, owner_org')
      .eq('app_id', body.app_id)
      // .eq('user_id', userId)
      .single()
    if (errorApp) {
      console.log(c.get('requestId'), 'errorApp', errorApp)
      return c.json({ status: 'Error App not found' }, 500)
    }

    // console.log(c.get('requestId'), body.name ?? body.bucket_id?.split('.')[0] ?? '')
    const { data: version, error: errorVersion } = await supabaseAdmin(c)
      .from('app_versions')
      .select('id')
      .eq('name', body.name)
      .eq('app_id', body.app_id)
      .eq('storage_provider', 'r2-direct')
      .eq('user_id', apikey.user_id)
      .single()
    if (errorVersion) {
      console.log(c.get('requestId'), 'errorVersion', errorVersion)
      return c.json({ status: 'Error App or Version not found' }, 500)
    }

    const clientS3 = initS3(c, true, true)

    const res = await Promise.all(body.manifest.map(async (entry, id) => {
      const finalPath = `orgs/${app.owner_org}/apps/${app.app_id}/${version.id}/${entry.hash}`
      const command = new PutObjectCommand({
        Bucket: getEnv(c, 'S3_BUCKET'),
        Key: finalPath,
      })
      const url = await getSignedUrlSDK(clientS3, command, { expiresIn: 300 })

      return {
        finalPath,
        uploadLink: url,
        id,
      }
    }))

    return c.json(res)
  }
  catch (e) {
    console.log(c.get('requestId'), 'error', e)
    return c.json({ status: 'Cannot get upload link', error: JSON.stringify(e) }, 500)
  }
})
