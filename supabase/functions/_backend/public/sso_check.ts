import type { Context } from 'hono'
import { honoFactory } from '../utils/hono.ts'
import { getPgClient } from '../utils/pg.ts'
import { cloudlogErr, serializeError } from '../utils/logging.ts'

export const app = honoFactory.createApp()

/**
 * Public endpoint to check if SSO is available for an email domain
 * No authentication required - accessible to unauthenticated users on login page
 */
app.post('/', async (c: Context) => {
  try {
    const body = await c.req.json()
    const { email } = body

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return c.json({
        error: 'invalid_email',
        message: 'Valid email address required',
      }, 400)
    }

    // Extract domain from email
    const domain = email.split('@')[1]?.toLowerCase()
    if (!domain) {
      return c.json({
        error: 'invalid_email',
        message: 'Could not extract domain from email',
      }, 400)
    }

    // Skip public email providers
    const publicDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com']
    if (publicDomains.includes(domain)) {
      return c.json({
        available: false,
        provider_id: null,
      })
    }

    // Query database for SSO configuration
    const pgClient = getPgClient(c)

    const result = await pgClient.query(`
      SELECT 
        osc.provider_id,
        osc.entity_id,
        osc.org_id,
        o.name as org_name
      FROM saml_domain_mappings sdm
      INNER JOIN org_saml_connections osc ON osc.org_id = sdm.org_id
      INNER JOIN orgs o ON o.id = osc.org_id
      WHERE 
        sdm.domain = $1
        AND osc.enabled = true
        AND osc.deleted_at IS NULL
      LIMIT 1
    `, [domain])

    if (result.rows.length > 0) {
      const row = result.rows[0]
      return c.json({
        available: true,
        provider_id: row.provider_id,
        entity_id: row.entity_id,
        org_id: row.org_id,
        org_name: row.org_name,
      })
    }

    return c.json({
      available: false,
      provider_id: null,
    })
  }
  catch (error) {
    cloudlogErr({ message: 'Error checking SSO availability:', error: serializeError(error) })
    return c.json({
      error: 'internal_error',
      message: 'Failed to check SSO availability',
    }, 500)
  }
})
