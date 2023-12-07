import { Client, Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

let d1HttpUrl = ''

async function main() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  d1HttpUrl = Deno.env.get('D1_URL') ?? ''

  if (!supabaseUrl) {
    console.log('no postgress url')
    Deno.exit(1)
  }

  if (!d1HttpUrl) {
    console.log('no postgress url')
    Deno.exit(1)
  }

  const pool = new Pool(supabaseUrl, 5);
  await Promise.all([
    migrationTable(await pool.connect(), 'app_versions'),
    migrationTable(await pool.connect(), 'apps'),
    migrationTable(await pool.connect(), 'channel_devices'),
    migrationTable(await pool.connect(), 'channels'),
    migrationTable(await pool.connect(), 'devices_override')
  ])
}

async function migrationTable(client: Client, table: string) {
  console.log(`migrate ${table}`)
  const lastDate = new Date(0)
  const query = `SELECT array_to_json(array_agg(row_to_json(${table}))) FROM ${table} WHERE created_at > '${lastDate.toISOString()}' limit 1000`
  const resultArr = await client.queryObject<object>(query)
  if (resultArr.rows.length !== 1) {
    console.log(`Problem with json result arr. Result arr to long. Length: ${resultArr.rows.length}, Data: ${resultArr.rows}`)
    Deno.exit(0)
  }

  const rows = (resultArr.rows[0] as any).array_to_json as Record<string, any>[]
  if (!rows) {
    console.log(`Nothing to migrate for ${table}`)
    return
  }

  const promises = rows.map((row) => {
    const keys = Object.keys(row)

    const values = Object.entries(row).map(([_, value]) => {
      return (value !== undefined && value !== null) ? value.toString() : 'NULL' 
    })

    const sqlQuery = `INSERT INTO ${table} ("${keys.join('", "')}") VALUES (${values.map((_) => `?`)})`

    // TODO: AUTH FOR ACCUAL API
    return fetch(d1HttpUrl, {
      method: 'POST',
      body: JSON.stringify({
        sql: sqlQuery,
        params: values
      })
    })
  })

  await Promise.all(promises)
  console.log(`migrate ${table} done`)
}


main()