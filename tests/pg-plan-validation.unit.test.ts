import { describe, expect, it } from 'vitest'

import { buildPlanValidationExpression } from '../supabase/functions/_backend/utils/pg.ts'
import * as schema from '../supabase/functions/_backend/utils/postgres_schema.ts'

function collectSqlText(chunk: unknown): string {
  if (typeof chunk === 'string')
    return chunk

  if (Array.isArray(chunk))
    return chunk.map(collectSqlText).join('')

  if (!chunk || typeof chunk !== 'object')
    return ''

  const maybeSqlChunk = chunk as { queryChunks?: unknown, value?: unknown }
  if (Array.isArray(maybeSqlChunk.value))
    return collectSqlText(maybeSqlChunk.value)

  if (Array.isArray(maybeSqlChunk.queryChunks))
    return collectSqlText(maybeSqlChunk.queryChunks)

  return ''
}

describe('plan validation SQL', () => {
  it.concurrent('keeps plan checks limited to succeeded subscriptions', () => {
    const expression = buildPlanValidationExpression(['mau'], schema.apps.owner_org)
    const sqlText = collectSqlText(expression)

    expect(sqlText).toContain('= \'succeeded\'')
    expect(sqlText).not.toContain('past_due')
    expect(sqlText).toContain('mau_exceeded = false')
  })
})
