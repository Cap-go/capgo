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
        // Ensure that the version is not linked anywhere
        const { count, error, data } = await supabase.from('channels')
          .select('id', { count: 'exact' })
          .or(`version.eq.${version.id},secondVersion.eq.${version.id}`)

        if (error) {
          console.error(`Cannot check channel count for ${version.id} because of error: ${error}`)
          continue
        }

        if ((count ?? 0) > 0) {
          console.log(`cannot delete failed version ${version.id}, linked in some channels (${data.map(d => d.id).join(', ')})`)
          continue
        }

        const { error: error1 } = await supabase.from('app_versions')
          .delete()
          .eq('id', version.id)

        if (error1)
          console.error(`Cannot delete version ${version.id} because of the error: ${error1}`)
      }
      else {
        const { size, checksum } = await s3.getSizeChecksum(c, v2Path ?? '')
        if (!size || !checksum) {
          console.log(`No checksum or size for ${v2Path}, ${size}, ${checksum}`)
          return c.json({ error: 'no_checksum_or_size', status: `No checksum or size for ${v2Path}, ${size}, ${checksum}` }, 500)
        }

        console.log(`Upsert app_versions_meta (version id: ${version.id}) to: ${size}, ${checksum}`)

        await supabase.from('app_versions_meta')
          .upsert({
            id: version.id,
            app_id: version.app_id,
            checksum,
            size,
            owner_org: version.owner_org,
          })
      }
    }

    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot cleanup versions', error: JSON.stringify(e) }, 500)
  }
})
