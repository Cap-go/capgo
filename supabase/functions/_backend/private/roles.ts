import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono/tiny'
import { middlewareAuth, useCors } from '../utils/hono.ts'
import { cloudlogErr } from '../utils/logging.ts'
import { getDrizzleClient } from '../utils/pg.ts'
import { schema } from '../utils/postgres_schema.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)
app.use('/', middlewareAuth)

// GET /private/roles - Liste des rôles assignables
app.get('/', async (c: Context<MiddlewareKeyVariables>) => {
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const drizzle = await getDrizzleClient(c)

    // Récupérer tous les rôles assignables
    const roles = await drizzle
      .select({
        id: schema.roles.id,
        name: schema.roles.name,
        scope_type: schema.roles.scope_type,
        description: schema.roles.description,
        family_name: schema.roles.family_name,
        priority_rank: schema.roles.priority_rank,
        is_assignable: schema.roles.is_assignable,
      })
      .from(schema.roles)
      .where(eq(schema.roles.is_assignable, true))
      .orderBy(schema.roles.priority_rank)

    return c.json(roles)
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'roles_fetch_failed',
      userId,
      error,
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /private/roles/:scope_type - Liste des rôles par scope
app.get('/:scope_type', async (c: Context<MiddlewareKeyVariables>) => {
  const scopeType = c.req.param('scope_type')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (!['platform', 'org', 'app', 'channel'].includes(scopeType)) {
    return c.json({ error: 'Invalid scope_type' }, 400)
  }

  try {
    const drizzle = await getDrizzleClient(c)

    // Récupérer les rôles pour ce scope
    const roles = await drizzle
      .select({
        id: schema.roles.id,
        name: schema.roles.name,
        scope_type: schema.roles.scope_type,
        description: schema.roles.description,
        family_name: schema.roles.family_name,
        priority_rank: schema.roles.priority_rank,
        is_assignable: schema.roles.is_assignable,
      })
      .from(schema.roles)
      .where(
        and(
          eq(schema.roles.scope_type, scopeType),
          eq(schema.roles.is_assignable, true),
        ),
      )
      .orderBy(schema.roles.priority_rank)

    return c.json(roles)
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'roles_fetch_by_scope_failed',
      userId,
      scopeType,
      error,
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})
