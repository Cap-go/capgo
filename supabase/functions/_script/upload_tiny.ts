import * as postgres from 'https://deno.land/x/postgres@v0.17.0/mod.ts'

const databaseUrl = Deno.env.get('SUPABASE_DB_URL') ?? ''
const pool = new postgres.Pool(databaseUrl, 3, true)
const connection = await pool.connect()

// Define start and end dates and row limit
const startDate = new Date('2023-07-11T09:27:35.765Z')
const endDate = new Date('2023-10-01T15:32:10Z')
const rowLimit = 500000

function replacer(key: any, value: any) {
  if (typeof value === 'bigint')
    return Number(value)
  // if date then convert to iso string
  // if (value instanceof Date)
  //   return value.toISOString()
  return value
}

async function fetchDataAndUpload() {
  let lastDate = startDate
  while (true) {
    const query = `SELECT * FROM stats WHERE created_at >= '${lastDate.toISOString()}' AND created_at < '${endDate.toISOString()}' ORDER BY created_at ASC LIMIT ${rowLimit}`
    console.log('Query:', query)
    const response = await connection.queryObject(query)

    if (response.rows.length === 0)
      break

    lastDate = (response.rows[response.rows.length - 1] as any).created_at
    console.log('Last date fetched:', lastDate)

    const data = response.rows.map(v => JSON.stringify(v, replacer))
    console.log('Data length:', data.length)
    const dataString = data.join('\n')
    // dataString print first 100 chars
    console.log('Data string length:', dataString.length)
    const uploadResponse = await uploadData(dataString)
    console.log('status', uploadResponse.status)
    if (uploadResponse.status !== 202) {
      // get body readable stream and read it to string
      const errorText = await uploadResponse.text()
      console.log('Error uploading data', errorText)
      break
    }
  }
}

async function uploadData(data: string) {
  console.log('uploading')
  const response = await fetch(
    'https://api.tinybird.co/v0/events?name=stats&mode=append',
    {
      method: 'POST',
      body: data,
      headers: { Authorization: 'Bearer ****' },
    },
  )
  return response
}

console.log('start')
await fetchDataAndUpload()
console.log('done')
