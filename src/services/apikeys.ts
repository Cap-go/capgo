import { v4 as uuidv4 } from 'uuid'
import { useSupabase } from './supabase'

export const createKeys = async (userId: string): Promise<void> => {
  const supabase = useSupabase()
  await supabase
    .from('apikeys')
    .insert(
      {
        user_id: userId,
        key: uuidv4(),
        mode: 'all',
      },
    )
  await supabase
    .from('apikeys')
    .insert(
      {
        user_id: userId,
        key: uuidv4(),
        mode: 'upload',
      },
    )
  await supabase
    .from('apikeys')
    .insert(
      {
        user_id: userId,
        key: uuidv4(),
        mode: 'read',
      },
    )
}
