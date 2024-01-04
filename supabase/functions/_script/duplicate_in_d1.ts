/// <reference lib="deno.ns" />
import { Client, Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import * as p from 'npm:@clack/prompts@0.7.0';

let d1HttpUrl = ''
const migrationsPerStep = 100

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
  const client = await pool.connect()
  // await migrationTable(client, 'app_versions')
  //await migrationTable(client, 'apps')
  await migrationTable(client, 'channel_devices')
  await migrationTable(client, 'channels')
  await migrationTable(client, 'devices_override')
}

// do $$
// begin
// execute (
//     select string_agg('INSERT INTO "public"."app_versions" ("id", "created_at", "app_id", "name", "bucket_id", "user_id", "updated_at", "deleted", "external_url", "checksum", "session_key", "storage_provider") VALUES ((pgsodium.randombytes_uniform(1000000) - pgsodium.randombytes_uniform(10000)), now(), ''com.demo.app'', format(''%s.%s.%s'', floor(random()  * 100000000), floor(random()  * 100000000), floor(random()  * 100000000)), ''8093d4ad-7d4b-427b-8d73-fc2a97b79ab9'', ''6aa76066-55ef-4238-ade6-0b32334a4097'', now(), ''f'', NULL, ''3885ee49'', NULL, ''r2'')',';')
//     from generate_series(1,1000)
// );
// end; 
// $$;

function queryD1(sqlQuery: string, values: any) {
  return fetch(d1HttpUrl, {
    method: 'POST',
    headers: {
      "Authorization": `Bearer ${Deno.env.get('D1_CF_APIKEY' ?? '')}`
    },
    body: JSON.stringify({
      sql: sqlQuery,
      params: values
    })
  })
  .then((res) => res.json())
  .then(json => {
    // console.log(json)
    return json
  })
  .catch(err => console.error('some error happend', JSON.stringify(err)))
}

async function migrationTable(client: Client, table: string) {
  let lastId = 0
  let totalMigrated = 0

  // first clean up all data in the db, check if there is data

  const resCount = await client.queryObject<{ count: bigint }>(`SELECT count(*) FROM ${table}`)
  if (resCount.rows.length !== 1) {
    console.error('invalid row count length', resCount)
  }
  const count = resCount.rows[0].count

  console.log(`migrate ${table} (size: ${count.toString()})`)

  const promises = [] as { query: string, parms: string[] }[]
  while (true) {
    const query = `SELECT array_to_json(array_agg(row_to_json(${table}) ORDER BY id ASC)) FROM (select * from ${table} WHERE id > ${lastId.toString()} ORDER BY id ASC limit ${migrationsPerStep}) as ${table}`
    const resultArr = await client.queryObject<object>(query)

    if (resultArr.rows.length !== 1) {
      console.log(`Problem with json result arr. Result arr to long. Length: ${resultArr.rows.length}, Data: ${resultArr.rows}`)
      Deno.exit(0)
    }
  
    const rows = (resultArr.rows[0] as any).array_to_json as Record<string, any>[]
    // console.log(`rows length: ${rows.length}`)
    if (!rows) {
      console.log(`Nothing to migrate for ${table}`)
      return
    }
  
    promises.push(...rows.map((row) => {
      let keys = Object.keys(row)

      if (table === 'apps') {
        keys = keys
          .filter(key => key !== 'id')
          .map(key => key === 'tmp_id' ? 'id' : key)
      }
  
      const values = Object.entries(row)
      .filter(([key, _]) => table === 'apps' ? (key !== 'id') : true) //Do not send column `id` into d1 for the table "apps"
      .map(([_, value]) => {
        return (value !== undefined && value !== null) ? value.toString() : null
      })
  
      const sqlQuery = `INSERT INTO ${table} ("${keys.join('", "')}") VALUES (${values.map((a, b) => `?${b+1}`)})`
  
      // console.log(values)
      // TODO: AUTH FOR ACCUAL API
      return { query: sqlQuery, parms: values }
    }))
  
    totalMigrated += rows.length

    if (rows.length < migrationsPerStep) {
      // Migration done
      console.log(`migrate ${table} waiting. Total: ${totalMigrated}, ${rows.length}`)
      break
    }
    lastId = rows[rows.length - 1].id
    console.log(`not yet done for ${table}. Total: ${totalMigrated}, last id: ${lastId}`)

    const finalSql = promises.map(p => p.query).join(';\n')
    // const finalValues = promises.flatMap(p => p.parms)

    // console.log(finalSql)
    

    await queryD1(finalSql, promises.map(p => p.parms))
    promises.length = 0 // clear promises array
  }
  const finalSql = `${promises.map(p => p.query).join(';\n')}`
  const finalValues = promises.map(p => p.parms)
  // console.log(finalValues.length)

  // console.log(finalSql)
  

  await queryD1(finalSql, finalValues)
  console.log(`migrate ${table} done. Total: ${totalMigrated}`)
}

await main()