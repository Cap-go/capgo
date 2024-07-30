import type { Context } from '@hono/hono'
import { initBento } from './bento.ts'
import { addContactPlunk, trackEventPlunk } from './plunk.ts'
import { logsnag } from './logsnag.ts'
import { canSendNotifOrg, sendNow } from './notifications.ts'
import { supabaseAdmin } from './supabase.ts'
import { posthogCapture } from './posthog.ts'

export async function trackEvent(c: Context, orgId: string, data: any, eventId: string) {
  const snag = logsnag(c)

  const { data: org, error: orgError } = await supabaseAdmin(c)
    .from('orgs')
    .select()
    .eq('id', orgId)
    .single()
  if (!org || orgError) {
    console.log('org not found', orgId)
    return Promise.resolve(false)
  }
  switch (eventId) {
    case 'user:subcribe':
      await snag.track({
        channel: 'usage',
        event: 'User subscribe',
        icon: '🎉',
        user_id: orgId,
        notify: true,
      }).catch()
      break
    case 'user:cancel':
      await snag.track({
        channel: 'usage',
        event: 'User cancel',
        icon: '⚠️',
        user_id: orgId,
        notify: true,
      }).catch()
      break
    case 'user:stripe_update':
      await snag.track({
        channel: 'usage',
        event: 'User update stripe',
        icon: '💰',
        user_id: orgId,
        notify: false,
      }).catch()
      break
    case 'user:add_stripe':
      await snag.track({
        channel: 'usage',
        event: 'User add stripe',
        icon: '💰',
        user_id: orgId,
        notify: false,
      }).catch()
      break
    case 'user:delete_failed_version':
      await snag.track({
        channel: 'upload-failed',
        event: 'User delete failed version',
        icon: '💀',
        user_id: orgId,
        notify: false,
      }).catch()
      break
    case 'user:register':
      await snag.track({
        channel: 'user-register',
        event: 'User register',
        icon: '🎉',
        user_id: orgId,
        notify: true,
      })
      break
    case 'user:upload_get_link':
      await snag.track({
        channel: 'upload-get-link',
        event: 'User upload get link',
        icon: '🏛️',
        user_id: orgId,
        notify: false,
      })
      break
    case 'user:upload_get_link_multipart':
      await snag.track({
        channel: 'upload-get-link',
        event: 'User upload get link multipart',
        icon: '🏗️',
        user_id: orgId,
        notify: false,
      })
      break
    case 'user:app_create':
      await snag.track({
        channel: 'app-created',
        event: 'App Created',
        icon: '🎉',
        user_id: orgId,
        notify: true,
      })
      break
    case 'user:org_create':
      await snag.track({
        channel: 'org-created',
        event: 'Org Created',
        icon: '🎉',
        user_id: orgId,
        notify: false,
        tags: data,
      })
      break
    case 'user:need_onboarding':
      await snag.track({
        channel: 'usage',
        event: 'User need onboarding',
        icon: '🥲',
        user_id: orgId,
        notify: true,
      })
      break
    case 'user:need_plan_upgrade':
      await snag.track({
        channel: 'usage',
        event: 'User need plan upgrade',
        icon: '⚠️',
        user_id: orgId,
        notify: false,
      })
      break
    case 'user:semver_issue':
      if (await canSendNotifOrg(c, eventId, orgId, data.app_id, '0 0 * * 1')) {
        await sendNow(c, eventId, org.management_email, orgId, data.app_id)
        await snag.track({
          channel: 'updates',
          event: 'User semver issue',
          icon: '💀',
          user_id: orgId,
          notify: false,
        }).catch()
      }
      break
    case 'user:plugin_issue':
      if (await canSendNotifOrg(c, eventId, orgId, data.app_id, '0 0 * * 1')) {
        await sendNow(c, eventId, org.management_email, orgId, data.app_id)
        await snag.track({
          channel: 'updates',
          event: 'User plugin issue',
          icon: '💀',
          user_id: orgId,
          notify: false,
        } as any).catch()
      }
      break
    case 'user:update_fail':
      if (await canSendNotifOrg(c, eventId, orgId, data.app_id, '0 0 * * 1')) {
        await sendNow(c, eventId, org.management_email, orgId, data.app_id)
        await snag.track({
          channel: 'updates',
          event: 'User update fail',
          icon: '⚠️',
          user_id: orgId,
          notify: false,
          tags: data,
        })
      }
      break
    case 'user:upgrade_to_team':
      if (await canSendNotifOrg(c, eventId, orgId, data.app_id, '0 0 1 * *')) {
        await sendNow(c, eventId, org.management_email, orgId, data.app_id)
        await snag.track({
          channel: 'usage',
          event: 'User upgrade to team',
          icon: '⚠️',
          user_id: orgId,
          notify: false,
        })
      }
      break
    case 'user:upgrade_to_pay_as_you_go':
      if (await canSendNotifOrg(c, eventId, orgId, data.app_id, '0 0 1 * *')) {
        await sendNow(c, eventId, org.management_email, orgId, data.app_id)
        await snag.track({
          channel: 'usage',
          event: 'User upgrade to pay as you go',
          icon: '⚠️',
          user_id: orgId,
          notify: false,
        })
      }
      break
    case 'user:upgrade_to_solo':
      if (await canSendNotifOrg(c, eventId, orgId, data.app_id, '0 0 1 * *')) {
        await sendNow(c, eventId, org.management_email, orgId, data.app_id)
        await snag.track({
          channel: 'usage',
          event: 'User upgrade to solo',
          icon: '⚠️',
          user_id: orgId,
          notify: false,
        })
      }
      break
    case 'user:upgrade_to_maker':
      if (await canSendNotifOrg(c, eventId, orgId, data.app_id, '0 0 1 * *')) {
        await sendNow(c, eventId, org.management_email, orgId, data.app_id)
        await snag.track({
          channel: 'usage',
          event: 'User upgrade to maker',
          icon: '⚠️',
          user_id: orgId,
          notify: false,
        })
      }
      break
    case 'user:70_percent_of_plan':
      if (await canSendNotifOrg(c, eventId, orgId, data.app_id, '0 0 1 * *')) {
        await sendNow(c, eventId, org.management_email, orgId, data.app_id)
        await snag.track({
          channel: 'usage',
          event: 'User is at 70% of plan usage',
          icon: '⚠️',
          user_id: orgId,
          notify: false,
        })
      }
      break
    case 'user:50_percent_of_plan':
      if (await canSendNotifOrg(c, eventId, orgId, data.app_id, '0 0 1 * *')) {
        await sendNow(c, eventId, org.management_email, orgId, data.app_id)
        await snag.track({
          channel: 'usage',
          event: 'User is at 50% of plan usage',
          icon: '⚠️',
          user_id: orgId,
          notify: false,
        })
      }
      break
    case 'user:90_percent_of_plan':
      if (await canSendNotifOrg(c, eventId, orgId, data.app_id, '0 0 1 * *')) {
        await sendNow(c, eventId, org.management_email, orgId, data.app_id)
        await snag.track({
          channel: 'usage',
          event: 'User is at 90% of plan usage',
          icon: '⚠️',
          user_id: orgId,
          notify: false,
        })
      }
      break
    case 'user:need_more_time':
      await snag.track({
        channel: 'usage',
        event: 'User need more time',
        icon: '⏰',
        user_id: orgId,
        notify: false,
      })
      break
  }
  const res = await trackEventPlunk(c, org.management_email, data, eventId)
  const bento = initBento(c)
  const res2 = await bento.V1.track({
    email: org.management_email,
    type: eventId,
    fields: data,
  })
    .then((result) => {
      console.log(result)
      return res
    })
    .catch((error) => {
      console.error(error)
      return false
    })
  await posthogCapture(c, eventId, data)
  return res2
}

export async function addContact(c: Context, email: string, data: any) {
  const res = await addContactPlunk(c, email, data)
  const bento = initBento(c)
  bento.V1.Batch.importSubscribers({
    subscribers: [
      {
        email,
        ...data,
      },
    ],
  })
    .then((result) => {
      console.log(result)
      return res
    })
    .catch((error) => {
      console.error(error)
      return false
    })
  return res
}
