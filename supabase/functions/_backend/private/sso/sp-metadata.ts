import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import { createHono, middlewareAuth, quickError, useCors } from '../../utils/hono.ts'
import { cloudlog } from '../../utils/logging.ts'
import { getEnv } from '../../utils/utils.ts'
import { version } from '../../utils/version.ts'

export const app = createHono('', version)

app.use('*', useCors)
app.use('*', middlewareAuth)

app.get('/', (c: Context<MiddlewareKeyVariables>) => {
  const auth = c.get('auth')
  const requestId = c.get('requestId')
  if (!auth) {
    cloudlog({ requestId, message: 'Unauthorized request to sp-metadata — no auth context', auth })
    return quickError(401, 'not_authorized', 'Not authorized')
  }

  const supabaseUrl = getEnv(c, 'SUPABASE_URL').replace(/\/$/, '')

  const metadataUrl = `${supabaseUrl}/auth/v1/sso/saml/metadata`
  return c.json({
    acs_url: `${supabaseUrl}/auth/v1/sso/saml/acs`,
    entity_id: metadataUrl,
    sp_metadata_url: metadataUrl,
    nameid_format: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  })
})
