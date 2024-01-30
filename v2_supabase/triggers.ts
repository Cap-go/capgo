import { Hono } from 'https://deno.land/x/hono/mod.ts'

// Triggers API
import { app as clear_app_cache } from '../backend/private/triggers/clear_app_cache.ts'
import { app as clear_device_cache } from '../backend/private/triggers/clear_device_cache.ts'
import { app as cron_email } from '../backend/private/triggers/cron_email.ts'
import { app as cron_good_plan } from '../backend/private/triggers/cron_good_plan.ts'
import { app as cron_scrapper } from '../backend/private/triggers/cron_scrapper.ts'
import { app as logsnag_insights } from '../backend/private/triggers/logsnag_insights.ts'
import { app as on_channel_update } from '../backend/private/triggers/on_channel_update.ts'
import { app as on_user_create } from '../backend/private/triggers/on_user_create.ts'
import { app as on_user_update } from '../backend/private/triggers/on_user_update.ts'
import { app as on_user_delete } from '../backend/private/triggers/on_user_delete.ts'
import { app as on_version_create } from '../backend/private/triggers/on_version_create.ts'
import { app as on_version_update } from '../backend/private/triggers/on_version_update.ts'
import { app as on_version_delete } from '../backend/private/triggers/on_version_delete.ts'
import { app as stripe_event } from '../backend/private/triggers/stripe_event.ts'
import { app as test_consistency } from '../backend/private/triggers/test_consistency.ts'

const app = new Hono()

app.route('/clear_app_cache', clear_app_cache)
app.route('/clear_device_cache', clear_device_cache)
app.route('/cron_email', cron_email)
app.route('/cron_good_plan', cron_good_plan)
app.route('/cron_scrapper', cron_scrapper)
app.route('/logsnag_insights', logsnag_insights)
app.route('/on_channel_update', on_channel_update)
app.route('/on_user_create', on_user_create)
app.route('/on_user_update', on_user_update)
app.route('/on_user_delete', on_user_delete)
app.route('/on_version_create', on_version_create)
app.route('/on_version_update', on_version_update)
app.route('/on_version_delete', on_version_delete)
app.route('/stripe_event', stripe_event)
app.route('/test_consistency', test_consistency)

Deno.serve(app.fetch)
