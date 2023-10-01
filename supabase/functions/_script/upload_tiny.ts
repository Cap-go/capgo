import * as postgres from 'https://deno.land/x/postgres@v0.14.2/mod.ts'

const databaseUrl = Deno.env.get('SUPABASE_DB_URL') ?? ''
const pool = new postgres.Pool(databaseUrl, 3, true)
const connection = await pool.connect()

// Define start and end dates and row limit
const startDate = new Date('2023-08-21T14:47:01.527Z')
const endDate = new Date('2023-10-01T02:10:10Z')
const rowLimit = 1000000

function replacer(key: any, value: any) {
  if (typeof value === 'bigint')
    return Number(value)

  return value
}

async function fetchDataAndUpload() {
  let lastDate = startDate
  while (true) {
    const query = `SELECT * FROM stats WHERE created_at >= '${lastDate.toISOString()}' AND created_at < '${endDate.toISOString()}' ORDER BY created_at ASC LIMIT ${rowLimit}`
    const response = await connection.queryObject(query)

    if (response.rows.length === 0)
      break

    lastDate = (response.rows[response.rows.length - 1] as any).created_at
    console.log('Last date fetched:', lastDate)

    const data = response.rows.map(v => JSON.stringify(v, replacer)).join('\n')
    const uploadResponse = await uploadData(data)
    console.log('status', uploadResponse.status)
  }
}

async function uploadData(data: string) {
  console.log('uploading')
  const response = await fetch(
    'https://api.tinybird.co/v0/events?name=logs',
    {
      method: 'POST',
      body: data,
      headers: { Authorization: 'Bearer ***' },
    },
  )
  return response
}

console.log('start')
await fetchDataAndUpload()
console.log('done')
