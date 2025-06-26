import { getBody, honoFactory, middlewareKey } from '../../utils/hono.ts'
import { cloudlogErr } from '../../utils/loggin.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'

export const app = honoFactory.createApp()

interface UpdateMetadataBody {
  app_id: string
  version_id: number
  link?: string
  comment?: string
}

app.post('/', middlewareKey(['all', 'write']), async (c) => {
  try {
    const body = await getBody<UpdateMetadataBody>(c as any)
    // We don't need apikey for this endpoint as middleware handles permission checks

    if (!body.app_id || !body.version_id) {
      return c.json({ status: 'Missing required fields', error: 'app_id and version_id are required' }, 400)
    }

    const { data: version, error: versionError } = await supabaseAdmin(c as any)
      .from('app_versions')
      .select('*')
      .eq('app_id', body.app_id)
      .eq('id', body.version_id)
      .single()

    if (versionError || !version) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version', error: versionError })
      return c.json({ status: 'Cannot find version', error: versionError }, 400)
    }

    const updateData: any = {}

    if (body.link !== undefined) {
      updateData.link = body.link
    }

    if (body.comment !== undefined) {
      updateData.comment = body.comment
    }

    if (Object.keys(updateData).length === 0) {
      return c.json({ status: 'No fields to update' }, 400)
    }

    const { error: updateError } = await supabaseAdmin(c as any)
      .from('app_versions')
      .update(updateData)
      .eq('app_id', body.app_id)
      .eq('id', body.version_id)

    if (updateError) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot update version metadata', error: updateError })
      return c.json({ status: 'Cannot update version metadata', error: updateError }, 400)
    }

    return c.json({ status: 'success' })
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error updating version metadata', error })
    return c.json({ status: 'Error updating version metadata', error }, 500)
  }
})
