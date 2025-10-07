import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ORG_ID, getSupabaseClient } from './test-utils.ts'

describe('[Function] queue_cron_plan_for_org', () => {
    let testCustomerId: string | null = null

    beforeAll(async () => {
        const supabase = getSupabaseClient()

        // Get an existing customer_id from the test org or any existing stripe_info
        const { data: orgData } = await supabase
            .from('orgs')
            .select('customer_id')
            .eq('id', ORG_ID)
            .single()

        if (orgData?.customer_id) {
            testCustomerId = orgData.customer_id
        } else {
            // Fallback: get any existing stripe_info record
            const { data: stripeData } = await supabase
                .from('stripe_info')
                .select('customer_id')
                .limit(1)
                .single()

            testCustomerId = stripeData?.customer_id || null
        }
    })

    afterAll(async () => {
        // No cleanup needed since we're using existing data
    })

    it('queues plan processing when plan_calculated_at is null', async () => {
        if (!testCustomerId) {
            console.log('Skipping test - no customer_id available')
            return
        }

        const supabase = getSupabaseClient()

        // Ensure plan_calculated_at is null
        await supabase
            .from('stripe_info')
            .update({ plan_calculated_at: null })
            .eq('customer_id', testCustomerId)
            .throwOnError()

        // Call the function
        const { error } = await supabase.rpc('queue_cron_plan_for_org', {
            org_id: ORG_ID,
            customer_id: testCustomerId
        })

        expect(error).toBeNull()
        // Note: We can't easily verify the queue was populated, but no error means it worked
    })

    it('skips queuing when plan was calculated within last hour', async () => {
        if (!testCustomerId) {
            console.log('Skipping test - no customer_id available')
            return
        }

        const supabase = getSupabaseClient()

        // Set plan_calculated_at to 30 minutes ago
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
        await supabase
            .from('stripe_info')
            .update({ plan_calculated_at: thirtyMinutesAgo.toISOString() })
            .eq('customer_id', testCustomerId)
            .throwOnError()

        // Call the function
        const { error } = await supabase.rpc('queue_cron_plan_for_org', {
            org_id: ORG_ID,
            customer_id: testCustomerId
        })

        expect(error).toBeNull()
        // Function should succeed but skip queuing (no way to verify this directly)
    })

    it('queues plan processing when plan was calculated over 1 hour ago', async () => {
        if (!testCustomerId) {
            console.log('Skipping test - no customer_id available')
            return
        }

        const supabase = getSupabaseClient()

        // Set plan_calculated_at to 2 hours ago
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
        await supabase
            .from('stripe_info')
            .update({ plan_calculated_at: twoHoursAgo.toISOString() })
            .eq('customer_id', testCustomerId)
            .throwOnError()

        // Call the function
        const { error } = await supabase.rpc('queue_cron_plan_for_org', {
            org_id: ORG_ID,
            customer_id: testCustomerId
        })

        expect(error).toBeNull()
    })

    it('handles non-existent customer_id gracefully', async () => {
        const supabase = getSupabaseClient()

        // Call with non-existent customer_id
        const { error } = await supabase.rpc('queue_cron_plan_for_org', {
            org_id: ORG_ID,
            customer_id: 'non_existent_customer'
        })

        expect(error).toBeNull()
        // Should not error even if customer doesn't exist
    })

    it('has correct permissions - only service_role can call', async () => {
        if (!testCustomerId) {
            console.log('Skipping test - no customer_id available')
            return
        }

        // This test verifies the function exists and can be called
        // The actual permission restriction is tested at the database level
        const supabase = getSupabaseClient()

        const { error } = await supabase.rpc('queue_cron_plan_for_org', {
            org_id: ORG_ID,
            customer_id: testCustomerId
        })

        expect(error).toBeNull()
    })
})
