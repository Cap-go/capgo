import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { getSupabaseClient } from './test-utils.ts'

describe('supabase Client Tests', () => {
  it('client creation and database query', async () => {
    const client: SupabaseClient = getSupabaseClient()

    // Test a simple query to the database
    const { data: table_data, error: table_error } = await client
      .from('users')
      .select('*')
      .limit(1)

    if (table_error)
      throw new Error(`Invalid Supabase client: ${table_error.message}`)

    expect(table_data).toBeTruthy()
  })
})

describe('[GET] /ok Function Test', () => {
  it('function invocation', async () => {
    const client: SupabaseClient = getSupabaseClient()

    // Invoke the 'hello-world' function with a parameter
    const { data: func_data, error: func_error } = await client.functions.invoke('ok', {
      body: { name: 'bar' },
    })

    // Check for errors from the function invocation
    if (func_error)
      throw new Error(`Invalid response: ${func_error.message}`)

    // Assert that the function returned the expected result
    expect(func_data.status).toBe('ok')
  })
})
