import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { POSTGRES_URL } from './test-utils.ts'

const pool = new Pool({
  connectionString: POSTGRES_URL,
  max: 1,
  idleTimeoutMillis: 2000,
})

const TASK_NAME = `test_cron_success_report_${randomUUID().slice(0, 8)}`
const TASK_URL = 'https://example.com/health'
let taskId: number

beforeAll(async () => {
  const { rows } = await pool.query(`
    INSERT INTO public.cron_tasks (
      name,
      description,
      task_type,
      target,
      minute_interval,
      run_at_second,
      enabled,
      success_report_url
    )
    VALUES ($1, 'Test cron success report queue', 'function', 'public.cleanup_tmp_users()', 1, 0, true, $2)
    RETURNING id
  `, [TASK_NAME, TASK_URL])

  taskId = rows[0].id
})

beforeEach(async () => {
  await pool.query('DELETE FROM public.cron_task_runs WHERE cron_task_id = $1', [taskId])
  await pool.query('DELETE FROM pgmq.q_cron_success_report')
  await pool.query('DELETE FROM pgmq.a_cron_success_report')
})

afterAll(async () => {
  await pool.query('DELETE FROM public.cron_task_runs WHERE cron_task_id = $1', [taskId])
  await pool.query('DELETE FROM public.cron_tasks WHERE id = $1', [taskId])
  await pool.end()
})

describe('cron success report queue', () => {
  it.concurrent('queues a success report only once per successful run', async () => {
    const runId = randomUUID()

    await pool.query(`
      INSERT INTO public.cron_task_runs (
        id,
        cron_task_id,
        task_name,
        task_type,
        status,
        success_report_url,
        expected_batches,
        completed_batches,
        failed_batches,
        finished_at
      )
      VALUES ($1, $2, $3, 'function', 'success', $4, 1, 1, 0, NOW())
    `, [runId, taskId, TASK_NAME, TASK_URL])

    await pool.query('SELECT public.queue_cron_success_report($1::uuid)', [runId])
    await pool.query('SELECT public.queue_cron_success_report($1::uuid)', [runId])

    const { rows } = await pool.query(`
      SELECT count(*)::int AS count
      FROM pgmq.q_cron_success_report
      WHERE message->>'runId' = $1
    `, [runId])

    expect(rows[0].count).toBe(1)
  })

  it.concurrent('does not queue a success report for failed runs', async () => {
    const runId = randomUUID()

    await pool.query(`
      INSERT INTO public.cron_task_runs (
        id,
        cron_task_id,
        task_name,
        task_type,
        status,
        success_report_url,
        expected_batches,
        completed_batches,
        failed_batches,
        finished_at
      )
      VALUES ($1, $2, $3, 'queue', 'failed', $4, 1, 0, 1, NOW())
    `, [runId, taskId, TASK_NAME, TASK_URL])

    await pool.query('SELECT public.queue_cron_success_report($1::uuid)', [runId])

    const { rows } = await pool.query(`
      SELECT count(*)::int AS count
      FROM pgmq.q_cron_success_report
      WHERE message->>'runId' = $1
    `, [runId])
    expect(rows[0].count).toBe(0)
  })
})
