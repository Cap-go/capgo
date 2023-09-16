import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@^2.2.3'
import { isEqual } from 'https://esm.sh/lodash-es@^4.17.21'
import type { Database } from '../supabase/functions/_utils/supabase.types.ts'

export function assert(condition: boolean, conditionAsString: string) {
  if (!condition)
    throw new Error(`Assertion failed for condition: ${conditionAsString}`)
}

export function assertEquals(first: any, second: any, message: string) {
  return assert(isEqual(first, second), `Assertion equal failed for: ${message}`)
}

export type SupabaseType = SupabaseClient<Database>
