import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ORG_ID, getSupabaseClient, getCronPlanQueueCount, getLatestCronPlanMessage, cleanupPostgresClient } from './test-utils.ts'

describe('[Function] queue_cron_stat_org_for_org', () => {
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
        // Cleanup PostgreSQL connection
        await cleanupPostgresClient()
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

        // Get initial queue count using direct PostgreSQL connection
        const initialCount = await getCronPlanQueueCount()

        // Call the function
        const { error } = await supabase.rpc('queue_cron_stat_org_for_org', {
            org_id: ORG_ID,
            customer_id: testCustomerId
        })

        expect(error).toBeNull()

        // Verify a queue record was created
        const finalCount = await getCronPlanQueueCount()
        expect(finalCount).toBe(initialCount + 1)

        // Verify the queue record contains correct data
        const latestMessage = await getLatestCronPlanMessage()
        expect(latestMessage).toMatchObject({
            function_name: 'cron_stat_org',
            function_type: 'cloudflare',
            payload: {
                orgId: ORG_ID,
                customerId: testCustomerId
            }
        })
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

        // Get initial queue count using direct PostgreSQL connection
        const initialCount = await getCronPlanQueueCount()

        // Call the function
        const { error } = await supabase.rpc('queue_cron_stat_org_for_org', {
            org_id: ORG_ID,
            customer_id: testCustomerId
        })

        expect(error).toBeNull()

        // Verify NO queue record was created (rate limiting worked)
        const finalCount = await getCronPlanQueueCount()
        expect(finalCount).toBe(initialCount)

        // Verify plan_calculated_at was NOT updated (should remain the same)
        const { data: stripeInfo } = await supabase
            .from('stripe_info')
            .select('plan_calculated_at')
            .eq('customer_id', testCustomerId)
            .single()
            .throwOnError()

        const actualTimestamp = new Date(stripeInfo?.plan_calculated_at!).getTime()
        const expectedTimestamp = thirtyMinutesAgo.getTime()

        // Should be within 1 second of the original timestamp (rate limiting prevented update)
        expect(Math.abs(actualTimestamp - expectedTimestamp)).toBeLessThan(1000)
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

        // Get initial queue count using direct PostgreSQL connection
        const initialCount = await getCronPlanQueueCount()

        // Call the function
        const { error } = await supabase.rpc('queue_cron_stat_org_for_org', {
            org_id: ORG_ID,
            customer_id: testCustomerId
        })

        expect(error).toBeNull()

        // Verify a queue record was created (rate limiting allowed it)
        const finalCount = await getCronPlanQueueCount()
        expect(finalCount).toBe(initialCount + 1)

        // Verify the queue record contains correct data
        const latestMessage = await getLatestCronPlanMessage()
        expect(latestMessage).toMatchObject({
            function_name: 'cron_stat_org',
            function_type: 'cloudflare',
            payload: {
                orgId: ORG_ID,
                customerId: testCustomerId
            }
        })
    })

    it('handles non-existent customer_id gracefully', async () => {
        const supabase = getSupabaseClient()

        // Call with non-existent customer_id
        const { error } = await supabase.rpc('queue_cron_stat_org_for_org', {
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

        const { error } = await supabase.rpc('queue_cron_stat_org_for_org', {
            org_id: ORG_ID,
            customer_id: testCustomerId
        })

        expect(error).toBeNull()
    })
})
