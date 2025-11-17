import type { Context } from 'hono'

import type { PoolClient } from 'pg'
import { parseCronExpression } from 'cron-schedule'
import dayjs from 'dayjs'
import { trackBentoEvent } from './bento.ts'
import { cloudlog, cloudlogErr } from './logging.ts'
import { closeClient, getPgClient } from './pg.ts'

interface EventData {
  [key: string]: any
}

function isSendable(c: Context, last: string, cron: string) {
  const interval = parseCronExpression(cron)
  const last_send_at = new Date(last)
  const now = new Date()
  const nextDate = interval.getNextDate(last_send_at)
  const sendable = dayjs(now).isAfter(nextDate)
  cloudlog({ requestId: c.get('requestId'), message: 'isSendable', cron, last_send_at, nextDate, now, sendable })

  return sendable
  // return false
}

export async function sendNotifOrg(c: Context, eventName: string, eventData: EventData, orgId: string, uniqId: string, cron: string) {
  const pool = getPgClient(c)
  let client: PoolClient | null = null

  try {
    client = await pool.connect()

    // Start transaction with serializable isolation to prevent race conditions
    await client.query('BEGIN')

    // Get org info
    const orgResult = await client.query(
      'SELECT id, management_email FROM orgs WHERE id = $1',
      [orgId],
    )

    if (orgResult.rows.length === 0) {
      cloudlog({ requestId: c.get('requestId'), message: 'org not found', orgId })
      await client.query('ROLLBACK')
      return false
    }

    const org = orgResult.rows[0]

    // Try to insert notification record first (will fail if already exists)
    // This acts as our lock - only one concurrent request can successfully insert
    const insertResult = await client.query(`
      INSERT INTO notifications (owner_org, event, uniq_id, last_send_at, total_send)
      VALUES ($1, $2, $3, NOW(), 1)
      ON CONFLICT (owner_org, event, uniq_id) DO NOTHING
      RETURNING last_send_at, total_send
    `, [orgId, eventName, uniqId])

    // If insert succeeded, this is the first notification
    if (insertResult.rows.length > 0) {
      cloudlog({ requestId: c.get('requestId'), message: 'notif never sent', event: eventName, uniqId })

      // Send notification BEFORE committing
      const res = await trackBentoEvent(c, org.management_email, eventData, eventName)
      if (!res) {
        cloudlog({ requestId: c.get('requestId'), message: 'trackEvent failed', eventName, email: org.management_email, eventData })
        await client.query('ROLLBACK')
        return false
      }

      // Only commit if email was sent successfully
      await client.query('COMMIT')
      cloudlog({ requestId: c.get('requestId'), message: 'send notif done', eventName, email: org.management_email })
      return true
    }

    // Record exists, check if we should send based on cron
    const selectResult = await client.query(
      'SELECT last_send_at, total_send FROM notifications WHERE owner_org = $1 AND event = $2 AND uniq_id = $3 FOR UPDATE NOWAIT',
      [orgId, eventName, uniqId],
    )

    if (selectResult.rows.length === 0) {
      cloudlog({ requestId: c.get('requestId'), message: 'notif disappeared', event: eventName, orgId })
      await client.query('ROLLBACK')
      return false
    }

    const notif = selectResult.rows[0]

    if (!isSendable(c, notif.last_send_at, cron)) {
      cloudlog({ requestId: c.get('requestId'), message: 'notif already sent', event: eventName, orgId })
      await client.query('ROLLBACK')
      return false
    }

    // Send notification BEFORE updating the record
    cloudlog({ requestId: c.get('requestId'), message: 'notif ready to sent', event: eventName, orgId })
    const res = await trackBentoEvent(c, org.management_email, eventData, eventName)
    if (!res) {
      cloudlog({ requestId: c.get('requestId'), message: 'trackEvent failed', eventName, email: org.management_email, eventData })
      await client.query('ROLLBACK')
      return false
    }

    // Only update and commit if email was sent successfully
    await client.query(
      'UPDATE notifications SET last_send_at = NOW(), total_send = total_send + 1 WHERE owner_org = $1 AND event = $2 AND uniq_id = $3',
      [orgId, eventName, uniqId],
    )

    await client.query('COMMIT')
    cloudlog({ requestId: c.get('requestId'), message: 'send notif done', eventName, email: org.management_email })
    return true
  }
  catch (error) {
    if (client) {
      await client.query('ROLLBACK')
    }

    // Handle lock timeout - another instance is processing
    if (error && typeof error === 'object' && 'code' in error && error.code === '55P03') { // lock_not_available
      cloudlog({ requestId: c.get('requestId'), message: 'notif lock busy', orgId, event: eventName, uniqId })
      return false
    }

    cloudlogErr({ requestId: c.get('requestId'), message: 'notif processing failure', error })
    return false
  }
  finally {
    if (client) {
      client.release()
    }
    await closeClient(c, pool)
  }
}

// dayjs subtract one week
// const last_send_at = dayjs().subtract(1, 'week').toISOString()
// cloudlog(c.get('requestId'), 'isSendable', isSendable(last_send_at, '0 0 1 * *'))
