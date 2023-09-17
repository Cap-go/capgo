import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.2.3';
import 'https://deno.land/x/dotenv/load.ts';
import { r2 } from '../_utils/r2.js';
import type { Database } from '../_utils/supabase.types.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '***';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '***';
const backupFolder = 'backup'; 

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

async function backupAndDeleteOldEntries() {
  const supabase = useSupabase();
  const daysToKeep = 30; 

  const currentDate = new Date();
  const cutoffDate = new Date(currentDate.getTime() - daysToKeep * 24 * 60 * 60 * 1000);

  const { data: oldEntries, error: queryError } = await supabase
    .from<Database['public']['Tables']['app_versions']['Row']>('app_versions')
    .select()
    .lt('updated_at', cutoffDate.toISOString());

  if (queryError) {
    console.error('Error querying the Supabase table:', queryError.message);
    return;
  }

  const backupData = JSON.stringify(oldEntries);
  const backupFilename = `backup-${currentDate.toISOString()}.json`;
  const backupPath = `${backupFolder}/${backupFilename}`;

  try {
    await r2.upload(backupPath, new TextEncoder().encode(backupData));
    console.log(`Backup saved to R2: ${backupPath}`);
  } catch (backupError) {
    console.error('Error saving backup to R2:', backupError);
  }

  const { error: deleteError } = await supabase
    .from('app_versions')
    .delete()
    .lt('updated_at', cutoffDate.toISOString());

  if (deleteError) {
    console.error('Error deleting entries from the Supabase table:', deleteError.message);
  } else {
    console.log('Deletion completed successfully.');
  }
}

backupAndDeleteOldEntries().catch((error) => {
  console.error('An error occurred:', error.message);
  Deno.exit(1);
});
