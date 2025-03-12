import { getBody, honoFactory, middlewareKey } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'

export const app = honoFactory.createApp()

interface UpdateMetadataBody {
  app_id: string
  version_id: number
  link?: string
  comment?: string
}

// Helper function to validate URL
function isValidUrl(url: string): boolean {
  try {
    // Fix linting error by assigning the URL to a variable
    const _ = new URL(url)
    return true
  }
  catch {
    return false
  }
}

app.post('/', middlewareKey(['all', 'write']), async (c) => {
  try {
    const body = await getBody<UpdateMetadataBody>(c as any)
    // We don't need apikey for this endpoint as middleware handles permission checks

    if (!body.app_id || !body.version_id) {
      return c.json({ status: 'Missing required fields', error: 'app_id and version_id are required' }, 400)
    }

    // Validate that at least one field to update is provided
    if (body.link === undefined && body.comment === undefined) {
      return c.json({ status: 'No fields to update' }, 400)
    }

    // Validate link URL if provided
    if (body.link !== undefined && body.link !== null && body.link !== '' && !isValidUrl(body.link)) {
      return c.json({ status: 'Invalid link URL', error: 'The provided link is not a valid URL' }, 400)
    }

    const { data: version, error: versionError } = await supabaseAdmin(c as any)
      .from('app_versions')
      .select('id') // Only select the id field to reduce data transfer
      .eq('app_id', body.app_id)
      .eq('id', body.version_id)
      .single()

    if (versionError || !version) {
      console.error('Cannot find version', versionError)
      return c.json({ status: 'Cannot find version', error: versionError }, 400)
    }

    const updateData: Record<string, string | null> = {}

    if (body.link !== undefined) {
      updateData.link = body.link
    }

    if (body.comment !== undefined) {
      updateData.comment = body.comment
    }

    // Update version metadata
    const { error: updateError } = await supabaseAdmin(c as any)
      .from('app_versions')
      .update(updateData)
      .eq('app_id', body.app_id)
      .eq('id', body.version_id)

    if (updateError) {
      console.error('Cannot update version metadata', updateError)
      return c.json({ status: 'Cannot update version metadata', error: updateError }, 400)
    }

    // Also update any deploy_history records for this version
    // This ensures consistency between app_versions and deploy_history
    await supabaseAdmin(c as any)
      .from('deploy_history')
      .update(updateData)
      .eq('app_id', body.app_id)
      .eq('version_id', body.version_id)
      .then(({ error }) => {
        if (error) {
          console.error('Warning: Could not update deploy_history records', error)
          // Don't fail the request if this update fails
        }
      })

    return c.json({ status: 'success' })
  }
  catch (error) {
    console.error('Error updating version metadata', error)
    return c.json({ status: 'Error updating version metadata', error }, 500)
  }
})
