async function main() {
    const file = await Deno.readTextFile('./supabase/d1.sql')
    const tables = 
        file.split('CREATE TABLE')
        .filter(table => table.length !== 0)
        .map(table => {
            const lines = table.split('\n')
            const name = lines[0].trim().split(' ')[0]

            const columns = lines
                .slice(1, -1)
                .filter(line => line.split(' ').length >= 2)
                .map(line => line.trim().split(' ')[0])

            return {
                name,
                columns
            }
        })
    console.log(tables)

    const finalMigration = tables.map(table => { 
            return `CREATE OR REPLACE FUNCTION "public"."replicate_insert_d1_${table.name}"() RETURNS trigger\n` + 
            `LANGUAGE plpgsql AS $$\n` + 
            `DECLARE\n` + 
                `sql_query character varying;\n` +
                `request_id text;\n` +
                `BEGIN\n` +
                `\n` + 
                `select 'INSERT INTO ${table.name} (${table.columns.map(c => `\"${c}\"`).join(', ')}) VALUES(${table.columns.map(c => '?').join(', ')})' INTO sql_query;\n` +
                `PERFORM post_replication_sql(sql_query, ARRAY [${table.columns.map(c => `(select (CASE WHEN (NEW.${c}) is distinct from NULL THEN (NEW.${c})::TEXT ELSE NULL END))`)}]);\n` + 
                `\n` + 
                `RETURN NEW;\n` + 
                `END;$$;\n`
    })

    finalMigration.forEach(a => console.log(a))
}

main()
