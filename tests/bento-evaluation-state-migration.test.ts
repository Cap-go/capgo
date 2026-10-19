import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Pool } from 'pg'
import { afterAll, expect, it } from 'vitest'
import { POSTGRES_URL } from './test-utils.ts'

const pool = new Pool({ connectionString: POSTGRES_URL, max: 1 })
afterAll(() => pool.end())

it('consolidates legacy execution history without losing active snapshots or pending audits', async () => {
  const client = await pool.connect()
  const schema = `test_bento_state_${randomUUID().replaceAll('-', '')}`
  const initial = readFileSync('supabase/migrations/20261017131933_bento_invitation_dispatches.sql', 'utf8')
  const legacy = initial.slice(initial.indexOf('CREATE TABLE public.bento_evaluation_runs'), initial.indexOf('COMMENT ON TABLE public.bento_event_dispatches'))
  const migration = readFileSync('supabase/migrations/20261019130017_bento_evaluation_state.sql', 'utf8')
  const scoped = (sql: string) => sql.replaceAll('public.bento_evaluation_runs', `${schema}.bento_evaluation_runs`)
  const [oldCompleted, newCompleted, running, laterCompleted] = Array.from({ length: 4 }, () => randomUUID())
  const snapshot = [{ metadata: { source: 'original-selection' } }]
  try {
    await client.query('BEGIN')
    await client.query(`CREATE SCHEMA ${schema}`)
    await client.query(scoped(legacy))
    await client.query(`INSERT INTO ${schema}.bento_evaluation_runs
      (id, evaluation_key, scheduled_for, created_at, status, eligible_users, pending_audit)
      VALUES ($1, 'completed-check', NOW() - INTERVAL '4 minutes', NOW() - INTERVAL '4 minutes', 'completed', NULL, '[{"event_id":"old-completed"}]'),
        ($2, 'completed-check', NOW() - INTERVAL '3 minutes', NOW() - INTERVAL '3 minutes', 'completed', NULL, '[{"event_id":"new-completed"}]'),
        ($3, 'active-check', NOW() - INTERVAL '2 minutes', NOW() - INTERVAL '2 minutes', 'running', $5::jsonb, '[{"event_id":"running"}]'),
        ($4, 'active-check', NOW() - INTERVAL '1 minute', NOW() - INTERVAL '1 minute', 'completed', NULL, '[{"event_id":"later-completed"}]')`, [oldCompleted, newCompleted, running, laterCompleted, JSON.stringify(snapshot)])
    await client.query(scoped(migration))
    const { rows } = await client.query(`SELECT id, evaluation_key, status, eligible_users, pending_audit FROM ${schema}.bento_evaluation_runs ORDER BY evaluation_key`)
    expect(rows).toEqual([
      { id: running, evaluation_key: 'active-check', status: 'running', eligible_users: snapshot, pending_audit: [{ event_id: 'running' }, { event_id: 'later-completed' }] },
      { id: newCompleted, evaluation_key: 'completed-check', status: 'completed', eligible_users: null, pending_audit: [{ event_id: 'old-completed' }, { event_id: 'new-completed' }] },
    ])
    await client.query('SAVEPOINT uniqueness')
    await expect(client.query(`INSERT INTO ${schema}.bento_evaluation_runs (evaluation_key, scheduled_for) VALUES ('completed-check', NOW())`)).rejects.toMatchObject({ code: '23505' })
    await client.query('ROLLBACK TO SAVEPOINT uniqueness')
    expect((await client.query(`SELECT COUNT(*)::int AS count FROM ${schema}.bento_evaluation_runs`)).rows).toEqual([{ count: 2 }])
  }
  finally {
    await client.query('ROLLBACK')
    client.release()
  }
})
