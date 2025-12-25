import { app as accept_invitation } from '../_backend/private/accept_invitation.ts'
import { app as admin_stats } from '../_backend/private/admin_stats.ts'
import { app as check_auto_join_orgs } from '../_backend/private/check_auto_join_orgs.ts'
import { app as config } from '../_backend/private/config.ts'
import { app as create_device } from '../_backend/private/create_device.ts'
import { app as credits } from '../_backend/private/credits.ts'
import { app as deleted_failed_version } from '../_backend/private/delete_failed_version.ts'
import { app as devices_priv } from '../_backend/private/devices.ts'
import { app as download_link } from '../_backend/private/download_link.ts'
import { app as events } from '../_backend/private/events.ts'
import { app as invite_new_user_to_org } from '../_backend/private/invite_new_user_to_org.ts'
import { app as latency } from '../_backend/private/latency.ts'
import { app as log_as } from '../_backend/private/log_as.ts'
import { app as organization_domains_get } from '../_backend/private/organization_domains_get.ts'
import { app as organization_domains_put } from '../_backend/private/organization_domains_put.ts'
// Webapps API
import { app as plans } from '../_backend/private/plans.ts'
import { app as publicStats } from '../_backend/private/public_stats.ts'
import { app as set_org_email } from '../_backend/private/set_org_email.ts'
import { app as stats_priv } from '../_backend/private/stats.ts'
import { app as storeTop } from '../_backend/private/store_top.ts'
import { app as stripe_checkout } from '../_backend/private/stripe_checkout.ts'
import { app as stripe_portal } from '../_backend/private/stripe_portal.ts'
import { app as upload_link } from '../_backend/private/upload_link.ts'
import { createAllCatch, createHono } from '../_backend/utils/hono.ts'
import { version } from '../_backend/utils/version.ts'

const functionName = 'private'
const appGlobal = createHono(functionName, version, Deno.env.get('SENTRY_DSN_SUPABASE'))

// Webapps API

appGlobal.route('/plans', plans)
appGlobal.route('/credits', credits)
appGlobal.route('/store_top', storeTop)
appGlobal.route('/website_stats', publicStats)
appGlobal.route('/config', config)
appGlobal.route('/devices', devices_priv)
appGlobal.route('/create_device', create_device)
appGlobal.route('/download_link', download_link)
appGlobal.route('/log_as', log_as)
appGlobal.route('/admin_stats', admin_stats)
appGlobal.route('/stats', stats_priv)
appGlobal.route('/stripe_checkout', stripe_checkout)
appGlobal.route('/stripe_portal', stripe_portal)
appGlobal.route('/upload_link', upload_link)
appGlobal.route('/delete_failed_version', deleted_failed_version)
appGlobal.route('/set_org_email', set_org_email)
appGlobal.route('/latency', latency)
appGlobal.route('/events', events)
appGlobal.route('/invite_new_user_to_org', invite_new_user_to_org)
appGlobal.route('/accept_invitation', accept_invitation)
appGlobal.route('/check_auto_join_orgs', check_auto_join_orgs)
appGlobal.route('/organization_domains_get', organization_domains_get)
appGlobal.route('/organization_domains_put', organization_domains_put)

createAllCatch(appGlobal, functionName)
Deno.serve(appGlobal.fetch)
