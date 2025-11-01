import { Hono } from 'hono'
import { app as channel_self } from '../../../supabase/functions/_backend/plugins/channel_self.ts'
import { app as stats } from '../../../supabase/functions/_backend/plugins/stats.ts'
// Import plugin endpoints
import { app as updates } from '../../../supabase/functions/_backend/plugins/updates.ts'

const PORT = Bun.env.PORT || '3000'

// Create main Hono app
const app = new Hono()

// Health check
app.get('/health', c => c.text('OK'))
app.get('/ok', c => c.text('OK'))

// Mount plugin routes
app.route('/updates', updates)
app.route('/stats', stats)
app.route('/channel_self', channel_self)

// Root handler
app.get('/', (c) => {
  return c.json({
    service: 'Bunny Plugin Server',
    endpoints: [
      '/updates',
      '/stats',
      '/channel_self',
      '/health',
      '/ok',
    ],
  })
})

// Start Bun server
const server = Bun.serve({
  port: PORT,
  fetch: app.fetch,
})

console.log(`Bunny Plugin server running on http://localhost:${server.port}`)
console.log('Available endpoints:')
console.log('  - POST /updates')
console.log('  - POST /stats')
console.log('  - POST /channel_self')
console.log('  - PUT /channel_self')
console.log('  - DELETE /channel_self')
console.log('  - GET /health')
console.log('  - GET /ok')
