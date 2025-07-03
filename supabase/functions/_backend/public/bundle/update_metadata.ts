import { getBody, honoFactory, middlewareKey, simpleError } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'

export const app = honoFactory.createApp()

interface UpdateMetadataBody {
  app_id: string
  version_id: number
  link?: string
  comment?: string
}

app.post('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBody<UpdateMetadataBody>(c)
  // We don't need apikey for this endpoint as middleware handles permission checks

  if (!body.app_id || !body.version_id) {
    throw simpleError('missing_required_fields', 'Missing required fields', { app_id: body.app_id, version_id: body.version_id })
  }

  const { data: version, error: versionError } = await supabaseAdmin(c)
    .from('app_versions')
    .select('*')
    .eq('app_id', body.app_id)
    .eq('id', body.version_id)
    .single()

  if (versionError || !version) {
    throw simpleError('cannot_find_version', 'Cannot find version', { supabaseError: versionError })
  }

  const updateData: any = {}

  if (body.link !== undefined) {
    updateData.link = body.link
  }

  if (body.comment !== undefined) {
    updateData.comment = body.comment
  }

  if (Object.keys(updateData).length === 0) {
    throw simpleError('no_fields_to_update', 'No fields to update')
  }

  const { error: updateError } = await supabaseAdmin(c)
    .from('app_versions')
    .update(updateData)
    .eq('app_id', body.app_id)
    .eq('id', body.version_id)

  if (updateError) {
    throw simpleError('cannot_update_version_metadata', 'Cannot update version metadata', { supabaseError: updateError })
  }

  return c.json({ status: 'success' })
})
