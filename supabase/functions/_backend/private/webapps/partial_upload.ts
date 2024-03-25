import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import { middlewareKey } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { hasAppRight, supabaseAdmin } from '../../utils/supabase.ts'
import { s3 } from '../../utils/s3.ts'

const hexRegex = /[0-9a-fA-F]+/

export const app = new Hono()

const manifestEntrySchema = z.object({
  file: z.string().refine(val => isValidFilePath(val), {
    message: 'Manifest file path containst directory traversal attempt or it starts with a "/"',
  }),
  hash: z.string().refine(val => hexRegex.test(val), {
    message: 'The manifest hash does not match the HEX regex (/[0-9a-fA-F]+/)',
  }),
})
const manifestSchema = manifestEntrySchema.array()

const uploadSchema = z.object({
  app_id: z.string(),
  version: z.string(),
  manifest: manifestSchema,
})

interface UploadManifestEntryType { file: string, uploadUrl: string }
type ManifestEntry = z.infer<typeof manifestEntrySchema>
type SupabaseManifestEntry = Database['public']['CompositeTypes']['manifest_entry']

function isValidFilePath(path: string) {
  return !path.includes('..') && !path.startsWith('/')
}

function manifestEntryToS3Path(entry: ManifestEntry, basePath: string) {
  const extensionSplit = entry.file.split('.')
  const extension = extensionSplit.length > 1 ? extensionSplit.at(-1) : null
  return `${basePath}/${entry.hash}${extension ? `.${extension}` : ''}.gz`
}

app.post('/upload', middlewareKey(['all', 'write', 'upload']), async (c: Context) => {
  const body = await c.req.json()
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']

  if (!(await hasAppRight(c, body.app_id, apikey.user_id, 'read'))) {
    console.log('right')
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
  }

  const parsedBodyRes = uploadSchema.safeParse(body)
  if (!parsedBodyRes.success) {
    console.log('body', parsedBodyRes.error)
    return c.json({ status: 'Invalid body', error: parsedBodyRes.error }, 400)
  }

  const parsedBody = parsedBodyRes.data

  const { data: appVersion, error: appVersionError } = await supabaseAdmin(c).from('app_versions')
    .select('*')
    .eq('app_id', parsedBody.app_id)
    .eq('name', parsedBody.version)
    .eq('storage_provider', 'r2-direct-partial')
    .single()

  if (appVersionError) {
    console.error(appVersionError)
    return c.json({ error: 'Internal server error' }, 500)
  }

  const baseFilePath = `orgs/${appVersion.owner_org}/apps/${btoa(appVersion.app_id)}/${appVersion.id}`

  const exist = await s3.checkIfExist(c, baseFilePath)
  if (exist) {
    console.log('exist', exist)
    return c.json({ status: 'Error already exist' }, 500)
  }

  const uploadManifestPreCheck: ({ ok: true, manifest: UploadManifestEntryType } | { ok: false, error: any })[] = await Promise.all(
    parsedBody.manifest.map(async (manifestEntry) => {
      const uploadPath = manifestEntryToS3Path(manifestEntry, baseFilePath)
      try {
        const uploadUrl = await s3.getUploadUrl(c, uploadPath)
        return { ok: true, manifest: { file: manifestEntry.file, uploadUrl } }
      }
      catch (e: any) {
        console.error(`Error generating upload url for file ${uploadPath}. Error: ${e}`)
        return { ok: false, error: e }
      }
    }),
  )

  if (uploadManifestPreCheck.find(val => !val.ok))
    return c.json({ error: 'internal error' }, 500)

  const uploadManifest = uploadManifestPreCheck.map((val) => {
    if (val.ok)
      return val.manifest
    else
      throw new Error('Unreachable')
  })

  const supabaseBundleManifest: SupabaseManifestEntry[] = parsedBody.manifest.map((entry) => {
    return {
      file_name: entry.file,
      file_hash: entry.hash,
      s3_path: manifestEntryToS3Path(entry, baseFilePath),
    }
  })

  const { error: appVersionUpdateError } = await supabaseAdmin(c).from('app_versions')
    .update({ manifest: supabaseBundleManifest })
    .eq('app_id', parsedBody.app_id)
    .eq('name', parsedBody.version)
    .eq('storage_provider', 'r2-direct-partial')
    .single()

  if (appVersionUpdateError) {
    console.error(`Error chaning the supabase manifest. Error: ${appVersionUpdateError}`)
    return c.json({ error: 'internal error' }, 500)
  }

  console.log('Manifest!!', parsedBody.manifest)
  return c.json(uploadManifest)
})
