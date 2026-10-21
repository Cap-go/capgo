import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './supabase.types.ts'

// Transport types shared by the console and the /private/console API. They
// preserve the existing table/RPC contracts while the console stops calling
// Supabase directly; types are erased at build time.
export type ConsoleDataClient<T = Database> = Pick<SupabaseClient<T>, 'from' | 'rpc'>

export interface ConsoleQuery {
  kind: 'table' | 'rpc'
  name: string
  args: unknown[]
  operations: { method: string, args: unknown[] }[]
}
