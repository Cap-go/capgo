import postgres from 'https://deno.land/x/postgresjs/mod.js'
import { object } from 'https://deno.land/x/zod@v3.22.2/types.ts'

interface Job {
  payload: string
  job_id: number
}

async function main() {
  // postgresql://postgres:postgres@127.0.0.1:54322/postgres') // '
  const sql = postgres('???')

  const failed_job = await sql<Job[]>`select * from job_queue where status='failed'`
  console.log('f', failed_job.length)

  const failedChannelDeviceUpdates = failed_job.map((job) => {
    const payload = JSON.parse(job.payload)

    return { payload, job_id: job.job_id }
  })
    .map((job) => {
      const sql = job.payload.sql
      if (!sql || typeof sql !== 'string') {
        console.error(`invalid sql for ${job.job_id}. SQL: ${sql}, ${job.payload}`)
        return undefined
      }

      const params = job.payload.params
      if (!params || typeof params !== 'object') {
        console.error(`invalid params for ${job.job_id}, ${job.payload}`)
        return undefined
      }

      return { payload: job.payload, job_id: job.job_id, sql, params: params as string[] }
    })
    .filter(job => job !== undefined)
    .map(job => job!)
    .filter(job => !job.sql.includes('"id"') && job.sql.includes('INSERT') && job.sql.includes('channel_devices'))

  console.log('X', failedChannelDeviceUpdates.length)

  for (const job of failedChannelDeviceUpdates) {
    job.sql = job.sql.replace(`"created_at"`, `"id", "created_at"`).replace('?, ?, ?, ?, ?, ?', '?, ?, ?, ?, ?, ?, ?')

    const appId = job.params[2]
    const deviceId = job.params[5]

    const ids = await sql<{ id: number }[]>`select id from channel_devices where device_id = ${deviceId} and app_id = ${appId} limit 1`
    const id = ids[0].id
    job.params = [id.toString(), ...job.params]

    await sql`update job_queue set payload=${JSON.stringify({ sql: job.sql, params: job.params })}, status='inserted' where job_id=${job.job_id}`
  }

  Deno.exit(0)
}

await main()
