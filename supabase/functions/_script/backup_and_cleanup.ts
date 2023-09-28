import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.2.3';
import 'https://deno.land/x/dotenv/load.ts';
import { r2 } from '../_utils/r2.ts';
import type { Database } from '../_utils/supabase.types.ts';
import * as fs from 'https://deno.land/std/fs/mod.ts';
import * as path from 'https://deno.land/std/path/mod.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const backupFolder = 'backup';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.');
  Deno.exit(1);
}

function useSupabase() {
  const options = {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  };
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, options);
}

async function backupAndDeleteTable(tableName: string) {
  const currentDate = new Date();
  const backupFilenames: string[] = [];
  const pageSize = 1000;

  try {
    if (!await fs.exists(backupFolder)) {
      await fs.ensureDir(backupFolder);
    }

    const supabase = useSupabase();
    const daysToKeep = 30;
    let offset = 0;
    let hasMoreData = true;

    const cutoffDate = new Date(currentDate.getTime() - daysToKeep * 24 * 60 * 60 * 1000); // Declare cutoffDate outside the loop

    while (hasMoreData) {
      await new Promise(r => setTimeout(r, 3000))
      const query = `
        SELECT * FROM ${tableName}
        WHERE updated_at < '${cutoffDate.toISOString()}'
        OFFSET ${offset}
        LIMIT ${pageSize}
      `;

      const { data: oldEntries, error: queryError } = await supabase
        .rpc('exec', { sql: query });

      if (queryError) {
        console.error(`Error querying the Supabase table "${tableName}":`, queryError.message);
        break;
      }

      if (!oldEntries || oldEntries.length === 0) {
        hasMoreData = false;
        break;
      }

      const backupData = JSON.stringify(oldEntries);
      const backupFilename = `backup-${currentDate.toISOString()}-${tableName}-page-${offset / pageSize}.json`;
      const backupPath = path.join(backupFolder, backupFilename);

      try {
        await r2.upload(backupPath, new TextEncoder().encode(backupData));
        console.log(`Backup saved to R2: ${backupPath}`);
        backupFilenames.push(backupFilename);
      } catch (backupError) {
        console.error(`Error saving backup to R2 for table "${tableName}":`, backupError);
        break;
      }

      offset += pageSize;
    }

    if (backupFilenames.length > 0) {
      const deleteQuery = `
        DELETE FROM ${tableName}
        WHERE updated_at < '${cutoffDate.toISOString()}'
        OFFSET ${offset - pageSize}
        LIMIT ${pageSize}
      `;

      const { error: deleteError } = await supabase.rpc('exec', { sql: deleteQuery });

      if (deleteError) {
        console.error(`Error deleting entries from the Supabase table "${tableName}":`, deleteError.message);
      } else {
        console.log(`Deletion completed successfully for table "${tableName}".`);
      }
    }
  } catch (e) {
    console.error(`An error occurred for table "${tableName}":`, e.message);
  }
}

async function backupAndDeleteTables() {
  const tablesToBackupAndDelete = ['stats', 'devices'];

  for (const tableName of tablesToBackupAndDelete) {
    await backupAndDeleteTable(tableName);
  }
}

backupAndDeleteTables();