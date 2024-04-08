import { createClient } from '@supabase/supabase-js'
import { Database } from '../src/types/supabase.types'

async function generatePlans(env: string, config: any) {
  const supaAnon = config['supa_anon'][env] as string
  const supaUrl = config['supa_url'][env] as string

  const supabase = createClient<Database>(supaUrl, supaAnon, { auth: 
      { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, } 
    })
  
  const { data: plans, error } = await supabase
  .from('plans')
  .select()
  .order('price_m')
  // .neq('stripe_id', 'free')

  if (error)
    throw error

  await Bun.write(`../generated/plans_${env}.json`, JSON.stringify(plans))
  return plans
}

async function main() {
  const configFile = Bun.file('../configs.json')
  const config = await configFile.json()

  await generatePlans('prod', config)
  await generatePlans('local', config)
}

await main()