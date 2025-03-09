import type { Context } from '@hono/hono'
import type { Hono } from 'hono/tiny'
import type { BlankSchema } from 'hono/types'
import type { MiddlewareKeyVariables } from './hono'
import { honoFactory } from './hono'

const KEY_EXPIRATION_TIME = 20 * 60 * 1000 // 20 minutes

interface Env {
  ATTACHMENT_BUCKET: R2Bucket
}

export class TemporaryKeyHandler {
  state: DurableObjectState
  env: Env
  router: Hono<MiddlewareKeyVariables, BlankSchema, '/'>

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.router = honoFactory.createApp()

    this.router.post('/create', this.createKey.bind(this) as any)
    this.router.get('/validate', this.validateKey.bind(this) as any)
  }

  async fetch(request: Request): Promise<Response> {
    return this.router.fetch(request)
  }

  private async createKey(c: Context) {
    const { versionID, paths } = await c.req.json<{ versionID: string, paths: string[] }>()
    if (!versionID || !paths || !Array.isArray(paths) || paths.length === 0) {
      console.error({ context: 'createKey', error: 'Invalid versionID or paths' })
      return c.json({ error: 'Invalid versionID or paths' }, 400)
    }

    const now = Date.now()
    const expiration = now + KEY_EXPIRATION_TIME
    // Set an alarm to clean up the key after it expires
    await this.state.storage.setAlarm(expiration)

    // Check if a key already exists for this versionID
    const existingData = await this.state.storage.get<{ signKey: string, expiration: number, paths: string[] }>(versionID)

    if (existingData) {
      // If a key exists, update the expiration and paths, but keep the existing signKey
      await this.state.storage.put(versionID, {
        signKey: existingData.signKey,
        expiration,
        paths: [...new Set([...existingData.paths, ...paths])],
      })
      return c.json({ key: existingData.signKey })
    }
    else {
      // If no key exists, create a new one
      const signKey = crypto.randomUUID()
      await this.state.storage.put(versionID, { signKey, expiration, paths })
      return c.json({ key: signKey })
    }
  }

  private async validateKey(c: Context) {
    const signKey = c.req.query('key')
    const path = c.req.query('path')
    const versionID = c.req.query('versionID')
    if (!signKey || !path || !versionID) {
      return c.json({ valid: false, error: 'Missing key, path, or versionID' })
    }

    const keyData = await this.state.storage.get<{ signKey: string, expiration: number, paths: string[] }>(versionID)
    if (!keyData) {
      return c.json({ valid: false, error: 'Invalid versionID' })
    }

    if (keyData.signKey !== signKey) {
      return c.json({ valid: false, error: 'Invalid key' })
    }

    if (Date.now() > keyData.expiration || !keyData.paths.includes(path)) {
      await this.state.storage.delete(versionID)
      return c.json({ valid: false, error: 'Invalid or expired key' })
    }

    return c.json({ valid: true })
  }

  async alarm() {
    const keys = await this.state.storage.list<{ expiration: number }>()
    const now = Date.now()
    for (const [versionID, value] of keys) {
      if (value.expiration < now) {
        await this.state.storage.delete(versionID)
      }
    }
  }
}

export { TemporaryKeyHandler as DurableObjectExample }
