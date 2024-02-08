import postgres from 'https://deno.land/x/postgresjs/mod.js'

async function main() {
  const clickhouseFile = await Deno.readTextFile('./supabase/clickhouse-local.sql')
  const commands = clickhouseFile.split(';\n')

  const sql = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres')

  for (const [i, command] of commands.entries()) {
    const result = await sql.unsafe(command)

    // Only true for "insert into vault.secrets (id, name, secret)"
    // Very important as I CANNOT set key_id in the clickhouse-local file
    // This will grab key_id and replace "magic_key_id" in the next command with this key_id
    if (result.length > 0) {
      const keyId = result[0].key_id
      commands[i + 1] = commands[i + 1].replace('magic_key_id', keyId)
    }
  }
  await sql.end()

  const clickhouseSeed = await Deno.readTextFile('./supabase/clickhouse-seed.sql')
  const clickhouseCommands = clickhouseSeed.split(';').filter(c => !!c)

  for (const command of clickhouseCommands) {
    await fetch(`http://0.0.0.0:8123/?query=${command}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  Deno.exit(0)
}

main()
