import { Client, Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import * as p from 'npm:@clack/prompts@0.7.0';

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

// do $$
// begin
// execute (
//     select string_agg('INSERT INTO "public"."app_versions" ("id", "created_at", "app_id", "name", "bucket_id", "user_id", "updated_at", "deleted", "external_url", "checksum", "session_key", "storage_provider") VALUES ((pgsodium.randombytes_uniform(1000000) - pgsodium.randombytes_uniform(10000)), now(), ''com.demo.app'', format(''%s.%s.%s'', floor(random()  * 100000000), floor(random()  * 100000000), floor(random()  * 100000000)), ''8093d4ad-7d4b-427b-8d73-fc2a97b79ab9'', ''6aa76066-55ef-4238-ade6-0b32334a4097'', now(), ''f'', NULL, ''3885ee49'', NULL, ''r2'')',';')
//     from generate_series(1,1000)
// );
// end; 
// $$;

async function migrationTable(client: Client, table: string) {
  console.log(`migrate ${table}`)
  let lastDate = new Date(0)
  let totalMigrated = 0

  while (true) {
    const query = `SELECT array_to_json(array_agg(row_to_json(${table}) ORDER BY created_at ASC)) FROM (select * from ${table} WHERE created_at > '${lastDate.toISOString()}' limit 1000) as ${table}`
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
    totalMigrated += rows.length

    if (rows.length < 1000) {
      // Migration done
      break
    }
    
    lastDate = new Date(rows[rows.length - 1].created_at)
    console.log(`not yet done for ${table}. Total: ${totalMigrated}, last date: ${lastDate.toISOString()}`)
  }

  console.log(`migrate ${table} done. Total: ${totalMigrated}`)
}


main()