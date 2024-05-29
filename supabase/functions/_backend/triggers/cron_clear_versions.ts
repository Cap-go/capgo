import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { s3 } from '../utils/s3.ts'

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    // Let's start with the metadata
    const supabase = supabaseAdmin(c)

    const { data: noMetadataVersions, error: noMetadataVersionsError } = await supabase.rpc('get_versions_with_no_metadata')
    if (noMetadataVersionsError)
      return c.json({ status: 'Cannot call get_versions_with_no_metadata', error: JSON.stringify(noMetadataVersionsError) }, 500)

    for (const version of noMetadataVersions) {
      const v2Path = version.bucket_id ? `apps/${version.user_id}/${version.app_id}/versions/${version.bucket_id}` : version.r2_path
      const existV2 = v2Path ? await s3.checkIfExist(c, v2Path) : false

      if (!existV2) {
        // TODO
      }
      else {
        const { size, checksum } = await s3.getSizeChecksum(c, v2Path ?? '')
        console.log(size, checksum)
      }
    }

    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot cleanup versions', error: JSON.stringify(e) }, 500)
  }
})
