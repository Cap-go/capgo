import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { middlewareAPISecret } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { formatDateCF } from '../utils/cloudflare.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'

interface ActiveApp {
    app_id: string
    org_id: string
    device_count: number
    last_activity: string
}

interface OrgApp {
    app_id: string
    name: string
    icon_url: string
    created_at: string
}

interface ActiveOrg {
    org_id: string
    org_name: string
    app_count: number
    total_devices: number
    apps: ActiveApp[]
}

export const app = new Hono<MiddlewareKeyVariables>()

/**
 * Query Cloudflare Analytics Engine for active apps by organization
 */
async function queryActiveAppsByOrgCF(c: any, orgIds: string[], daysBack: number = 7): Promise<Map<string, ActiveApp[]>> {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)

    const query = `
    SELECT
      index1 AS app_id,
      index2 AS org_id,
      count(DISTINCT blob1) AS device_count,
      max(timestamp) AS last_activity
    FROM device_usage
    WHERE
      index2 IN (${orgIds.map(id => `'${id}'`).join(',')})
      AND timestamp >= toDateTime('${formatDateCF(startDate.toISOString())}')
      AND timestamp < toDateTime('${formatDateCF(endDate.toISOString())}')
    GROUP BY index1, index2
    ORDER BY device_count DESC
  `

    cloudlog({ requestId: c.get('requestId'), message: 'Cloudflare Analytics query', query })

    try {
        const CF_ANALYTICS_TOKEN = getEnv(c, 'CF_ANALYTICS_TOKEN')
        const CF_ACCOUNT_ID = getEnv(c, 'CF_ACCOUNT_ANALYTICS_ID')

        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/analytics_engine/sql`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CF_ANALYTICS_TOKEN}`,
                'Content-Type': 'text/plain; charset=utf-8',
                'Accept-Encoding': 'gzip, zlib, deflate, zstd, br',
                'User-Agent': 'Capgo/1.0',
            },
            body: query
        })

        if (!response.ok) {
            throw new Error(`Analytics query failed: ${response.status} ${response.statusText}`)
        }

        const result = await response.json() as any
        cloudlog({ requestId: c.get('requestId'), message: 'Cloudflare Analytics result', result })

        // Group results by org_id
        const orgAppsMap = new Map<string, ActiveApp[]>()

        if (result.data && Array.isArray(result.data)) {
            result.data.forEach((row: any) => {
                const orgId = row.org_id
                if (!orgAppsMap.has(orgId)) {
                    orgAppsMap.set(orgId, [])
                }

                orgAppsMap.get(orgId)!.push({
                    app_id: row.app_id,
                    org_id: row.org_id,
                    device_count: parseInt(row.device_count),
                    last_activity: row.last_activity
                })
            })
        }

        return orgAppsMap
    } catch (error) {
        cloudlog({ requestId: c.get('requestId'), message: 'Error querying Cloudflare analytics', error })
        return new Map()
    }
}

/**
 * Query Supabase for active apps by organization using device usage data with SQL grouping
 */
async function queryActiveAppsByOrgSB(c: any, orgIds: string[], daysBack: number = 7): Promise<Map<string, ActiveApp[]>> {
    try {
        const supabase = supabaseAdmin(c)
        const endDate = new Date()
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - daysBack)

        cloudlog({ requestId: c.get('requestId'), message: 'Supabase Analytics query with SQL grouping', orgIds, startDate, endDate })

        // Use raw SQL query to efficiently group by org_id and app_id
        const { data, error } = await supabase.rpc('get_active_apps_by_org', {
            org_ids: orgIds,
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString()
        })

        if (error) {
            cloudlog({ requestId: c.get('requestId'), message: 'Error querying Supabase analytics', error })
            return new Map()
        }

        cloudlog({ requestId: c.get('requestId'), message: 'Supabase Analytics result', count: data?.length })

        // Group results by org_id
        const orgAppsMap = new Map<string, ActiveApp[]>()

        if (data && Array.isArray(data)) {
            data.forEach((row: any) => {
                const orgId = row.org_id

                if (!orgAppsMap.has(orgId)) {
                    orgAppsMap.set(orgId, [])
                }

                orgAppsMap.get(orgId)!.push({
                    app_id: row.app_id,
                    org_id: row.org_id,
                    device_count: parseInt(row.device_count),
                    last_activity: row.last_activity
                })
            })

            // Sort apps by device count descending within each org
            orgAppsMap.forEach((apps) => {
                apps.sort((a, b) => b.device_count - a.device_count)
            })
        }

        return orgAppsMap
    } catch (error) {
        cloudlog({ requestId: c.get('requestId'), message: 'Error querying Supabase analytics', error })
        return new Map()
    }
}

/**
 * Query active apps by organization - tries Cloudflare first, falls back to Supabase
 */
async function queryActiveAppsByOrg(c: any, orgIds: string[], daysBack: number = 7): Promise<Map<string, ActiveApp[]>> {
    // Try Cloudflare first
    try {
        const CF_ANALYTICS_TOKEN = getEnv(c, 'CF_ANALYTICS_TOKEN')
        const CF_ACCOUNT_ID = getEnv(c, 'CF_ACCOUNT_ANALYTICS_ID')

        if (CF_ANALYTICS_TOKEN && CF_ACCOUNT_ID) {
            cloudlog({ requestId: c.get('requestId'), message: 'Using Cloudflare Analytics' })
            return await queryActiveAppsByOrgCF(c, orgIds, daysBack)
        }
    } catch (error) {
        cloudlog({ requestId: c.get('requestId'), message: 'Cloudflare Analytics failed, falling back to Supabase', error })
    }

    // Fall back to Supabase
    cloudlog({ requestId: c.get('requestId'), message: 'Using Supabase Analytics' })
    return await queryActiveAppsByOrgSB(c, orgIds, daysBack)
}

/**
 * Query Supabase for paying and trial organizations using optimized database function
 */
async function getPayingAndTrialOrgs(c: any): Promise<{ org_id: string, org_name: string }[]> {
    try {
        const supabase = supabaseAdmin(c)

        // Use the optimized database function to get paying and trial orgs
        const { data, error } = await supabase
            .rpc('get_paying_and_trial_orgs')

        if (error) {
            cloudlog({ requestId: c.get('requestId'), message: 'Error querying get_paying_and_trial_orgs', error })
            return []
        }

        cloudlog({ requestId: c.get('requestId'), message: 'Paying and trial orgs', count: data?.length || 0 })

        return data || []
    } catch (error) {
        cloudlog({ requestId: c.get('requestId'), message: 'Error querying Supabase', error })
        return []
    }
}

app.post('/', middlewareAPISecret, async (c) => {
    try {
        cloudlog({ requestId: c.get('requestId'), message: 'Starting schedule_app_stats query' })

        // Get paying and trial organizations from Supabase
        const orgs = await getPayingAndTrialOrgs(c)
        cloudlog({ requestId: c.get('requestId'), message: 'Found paying/trial organizations', count: orgs.length, orgs })

        if (orgs.length === 0) {
            return c.json({
                success: true,
                message: 'No paying or trial organizations found',
                organizations: []
            })
        }

        // Extract org IDs for Cloudflare Analytics query
        const orgIds = orgs.map(org => org.org_id)

        // Query Cloudflare Analytics for active apps by organization
        const activeAppsByOrg = await queryActiveAppsByOrg(c, orgIds)
        cloudlog({ requestId: c.get('requestId'), message: 'Active apps by org', activeAppsByOrg })

        // Build response with organization summary
        const activeOrgs: ActiveOrg[] = []

        for (const org of orgs) {
            const activeApps = activeAppsByOrg.get(org.org_id) || []
            const totalDevices = activeApps.reduce((sum, app) => sum + app.device_count, 0)

            activeOrgs.push({
                org_id: org.org_id,
                org_name: org.org_name,
                app_count: activeApps.length,
                total_devices: totalDevices,
                apps: activeApps
            })
        }

        // Sort by total devices descending
        activeOrgs.sort((a, b) => b.total_devices - a.total_devices)

        // Schedule cron_stat_app jobs for all organizations with active apps
        cloudlog({ requestId: c.get('requestId'), message: 'Scheduling cron_stat_app jobs', orgCount: activeOrgs.length })

        try {
            const supabase = supabaseAdmin(c)

            // Get all apps from active organizations
            const allApps = activeOrgs.flatMap(org => org.apps)

            if (allApps.length > 0) {
                // Prepare apps data for the function
                const appsData = allApps.map(app => ({
                    app_id: app.app_id,
                    org_id: app.org_id
                }))

                // Use the new function to schedule all cron_stat_app jobs
                const { error: scheduleError } = await supabase.rpc('schedule_cron_stat_app_jobs', {
                    apps: appsData
                })

                if (scheduleError) {
                    cloudlog({ requestId: c.get('requestId'), message: 'Error scheduling cron_stat_app jobs', error: scheduleError })
                } else {
                    cloudlog({ requestId: c.get('requestId'), message: 'Successfully scheduled cron_stat_app jobs', count: allApps.length })
                }
            } else {
                cloudlog({ requestId: c.get('requestId'), message: 'No active apps found to schedule' })
            }
        } catch (error) {
            cloudlog({ requestId: c.get('requestId'), message: 'Error scheduling cron_stat_app jobs', error })
        }

        return c.json({
            success: true,
            message: `Found ${activeOrgs.length} organizations with active apps`,
            total_orgs_checked: orgs.length,
            active_orgs_count: activeOrgs.length,
            organizations: activeOrgs
        })

    } catch (error) {
        cloudlog({ requestId: c.get('requestId'), message: 'Error in schedule_app_stats', error })
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            organizations: []
        }, 500)
    }
})
