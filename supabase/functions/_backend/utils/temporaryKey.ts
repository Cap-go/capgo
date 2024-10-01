import { Hono } from 'hono/tiny'
import type { Env } from '@cloudflare/workers-types'
import type { Context } from '@hono/hono'

const KEY_EXPIRATION_TIME = 20 * 60 * 1000 // 20 minutes

export class TemporaryKeyHandler {
  state: DurableObjectState
  env: Env
  router: Hono

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.router = new Hono()

    this.router.post('/create', this.createKey.bind(this))
    this.router.get('/validate', this.validateKey.bind(this))
  }

  async fetch(request: Request): Promise<Response> {
    return this.router.fetch(request)
  }

  private async createKey(c: Context) {
    const { paths } = await c.req.json<{ paths: string[] }>()
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      console.error({ context: 'createKey', error: 'Invalid paths' })
      return c.json({ error: 'Invalid paths' }, 400)
    }

    const key = crypto.randomUUID()
    await this.state.storage.put(key, {
      expiration: Date.now() + KEY_EXPIRATION_TIME,
      paths,
    })

    // Set an alarm to clean up the key after it expires
    await this.state.storage.setAlarm(Date.now() + KEY_EXPIRATION_TIME)

    return c.json({ key })
  }

  private async validateKey(c: Context) {
    const key = c.req.query('key')
    const path = c.req.query('path')
    if (!key || !path) {
      return c.json({ valid: false, error: 'Missing key or path' })
    }

    const keyData = await this.state.storage.get(key)
    if (!keyData || Date.now() > keyData.expiration || !keyData.paths.includes(path)) {
      return c.json({ valid: false, error: 'Invalid or expired key' })
    }

    return c.json({ valid: true })
  }

  async alarm() {
    // Clean up expired keys
    const keys = await this.state.storage.list()
    const now = Date.now()
    for (const [key, value] of keys) {
      if (value.expiration < now) {
        await this.state.storage.delete(key)
      }
    }
  }
}

export { TemporaryKeyHandler as DurableObjectExample }
