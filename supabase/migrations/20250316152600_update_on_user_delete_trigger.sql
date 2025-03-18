-- Update the on_user_delete trigger to properly handle DELETE operations
-- and hash emails before inserting into deleted_account table

-- This migration ensures the on_user_delete trigger properly handles the user deletion process
-- by aligning with the queue-based approach and ensuring emails are hashed before storage

-- No changes needed to the SQL trigger as it's already properly set up in 20250316012705_user_deletion_queue.sql
-- The fix is implemented in the Supabase Edge Function that handles the trigger
