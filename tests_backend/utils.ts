import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@^2.2.3'
import { isEqual } from 'https://esm.sh/lodash-es@^4.17.21'
import type { Database } from '../supabase/functions/_utils/supabase.types.ts'

export const defaultUserId = '6aa76066-55ef-4238-ade6-0b32334a4097'

export function assert(condition: boolean, conditionAsString: string) {
  if (!condition)
    throw new Error(`Assertion failed for condition: ${conditionAsString}`)
}

export function assertEquals(first: any, second: any, message: string) {
  return assert(isEqual(first, second), `Assertion equal failed for: ${message}`)
}

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export type SupabaseType = SupabaseClient<Database>
