// eslint-disable
async function main() {
  const file = await Deno.readTextFile('./supabase/d1.sql')
  const tables
        = file.split('CREATE TABLE')
          .filter(table => table.length !== 0)
          .map((table) => {
            const lines = table.split('\n')
            const name = lines[0].trim().split(' ')[0]

            const columns = lines
              .slice(1, -1)
              .filter(line => line.split(' ').length >= 2)
              .map(line => line.trim().split(' ')[0])

            return {
              name,
              columns,
            }
          })
  // console.log(tables)
  // tables = tables.filter(t => t.name === 'channels')

  const finalMigration = tables.map((table) => {
    return `CREATE OR REPLACE FUNCTION "public"."replicate_insert_d1_${table.name}"() RETURNS trigger\n`
      + `LANGUAGE plpgsql AS $$\n`
      + `DECLARE\n`
      + `sql_query character varying;\n`
      + `request_id text;\n`
      + `BEGIN\n`
      + `\n`
      + `select 'INSERT INTO ${table.name} (${table.columns.map(c => `\"${c}\"`).join(', ')}) VALUES(${table.columns.map(_c => '?').join(', ')})' INTO sql_query;\n`
      + `PERFORM post_replication_sql(sql_query, ARRAY [${table.columns.map(c => `(select (CASE WHEN (NEW."${c}") is distinct from NULL THEN (NEW."${c}")::TEXT ELSE NULL END))`)}]);\n`
      + `\n`
      + `RETURN NEW;\n`
      + `END;$$;\n`
      + `\n`
      + `CREATE OR REPLACE FUNCTION "public"."replicate_update_d1_${table.name}"() RETURNS trigger\n`
      + `LANGUAGE plpgsql AS $$\n`
      + `DECLARE\n`
      + `sql_query character varying;\n`
      + `BEGIN\n`
      + `\n`
      + `select 'UPDATE ${table.name} SET ${table.columns.map(c => `"${c}"=?`).join(', ')} where "id"=?' INTO sql_query;\n`
      + `PERFORM post_replication_sql(sql_query, ARRAY [${table.columns.map(c => `(select (CASE WHEN (NEW."${c}") is distinct from NULL THEN (NEW."${c}")::TEXT ELSE NULL END))`)}, NEW.id::text]);\n`
      + `\n`
      + `RETURN NEW;\n`
      + `END;$$;\n`
      + `\n`
      + `CREATE OR REPLACE FUNCTION "public"."replicate_drop_d1_${table.name}"() RETURNS trigger\n`
      + `LANGUAGE plpgsql AS $$\n`
      + `DECLARE\n`
      + `sql_query character varying;\n`
      + `BEGIN\n`
      + `\n`
      + `select 'DELETE FROM ${table.name} where id=?' INTO sql_query;\n`
      + `PERFORM post_replication_sql(sql_query, ARRAY [OLD.id::text]);\n`
      + `\n`
      + `RETURN OLD;\n`
      + `END;$$;\n`
  })

  finalMigration.forEach(a => console.log(a))

  const triggers = tables
    .map((table) => {
      if (table.name === 'channels')
        return { triggerName: 'channel', realName: 'channels' }
      else if (table.name === 'app_versions')
        return { triggerName: 'version', realName: 'app_versions' }
      else
        return { triggerName: table.name, realName: table.name }
    })
    .map((table) => {
      return `CREATE OR REPLACE TRIGGER replicate_${table.triggerName}_insert\n`
        + `BEFORE INSERT ON "public"."${table.realName}" FOR EACH ROW\n`
        + `EXECUTE PROCEDURE "public"."replicate_insert_d1_${table.realName}"();\n`
        + `\n`
        + `CREATE OR REPLACE TRIGGER replicate_${table.triggerName}_update\n`
        + `BEFORE UPDATE ON "public"."${table.realName}" FOR EACH ROW\n`
        + `EXECUTE PROCEDURE "public"."replicate_update_d1_${table.realName}"();\n`
        + `\n`
        + `CREATE OR REPLACE TRIGGER replicate_${table.triggerName}_drop\n`
        + `BEFORE DELETE ON "public"."${table.realName}" FOR EACH ROW\n`
        + `EXECUTE PROCEDURE "public"."replicate_drop_d1_${table.realName}"();\n`
    })

  triggers.forEach(t => console.log(t))
}

main()
