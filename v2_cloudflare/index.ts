import { Hono } from 'hono'
import { app as bundle } from '../backend/public/bundles'
import { app as ok } from '../backend/public/ok'
import { app as devices } from '../backend/public/devices'
import { app as channels } from '../backend/public/channels'
import { app as channel_self } from '../backend/private/plugins/channel_self'
import { app as updates } from '../backend/private/plugins/updates'
import { app as stats } from '../backend/private/plugins/stats'
import { app as plans } from '../backend/private/webapps/plans'
import { app as storeTop } from '../backend/private/webapps/store_top'
import { app as publicStats } from '../backend/private/webapps/public_stats'

const app = new Hono()

// Public API
app.get('/bundle', bundle)
app.get('/channels', channels)
app.get('/device', devices)
app.get('/ok', ok)

// Plugin API
app.get('/channel_self', channel_self)
app.get('/updates', updates)
app.get('/stats', stats)

// Private API
app.get('/plans', plans)
app.get('/store_top', storeTop)
app.get('/website_stats', publicStats)




// WebApp API


export default app
