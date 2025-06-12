import type { Context } from '@hono/hono'
import type { Dayjs } from 'dayjs'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { closeClient, getPgClient } from "../utils/pg.ts"
import { Database } from "../utils/supabase.types.ts"

dayjs.extend(utc)

export const app = new Hono<MiddlewareKeyVariables>()

const inputBodySchema = z.object({
    app_id: z.string(),
})

const maxCacheAge = 65; // 1 hour 5 minutes in minutes

const cacheSchema = z.object({
    storageChanges: z.array(z.object({
        version: z.coerce.number(),
        storage_added: z.string().datetime().optional(),
        storage_removed: z.string().datetime().optional(),
        size: z.coerce.number()
    }))
})

const cacheFinalSchema = z.object({
    storageChanges: z.array(z.object({
        version: z.coerce.number(),
        storage_added: z.string().datetime().optional(),
        storage_removed: z.string().datetime().optional(),
        size: z.coerce.number()
    })),
    cacheModified: z.string().datetime()
})

// Cache helper functions
async function getCacheForApp(supabase: any, app_id: string) {
    const { data, error } = await supabase
        .from('storage_hourly_cache')
        .select('cache, updated_at')
        .eq('app_id', app_id)
        .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Error getting cache:', error)
        return null
    }

    if (!data) {
        return null
    }

    const cache = cacheFinalSchema.safeParse(data.cache)

    if (!cache.success) {
        cloudlogErr(cache.error)
        return null
    }

    const cacheModified = dayjs(cache.data.cacheModified)
    const now = dayjs()
    const diff = now.diff(cacheModified, 'milliseconds')
    if (diff > maxCacheAge * 60 * 1000) {
        return null
    }

    return cache.data
}

async function setCacheForApp(supabase: any, app_id: string, cacheData: z.infer<typeof cacheSchema>, cacheDate: Dayjs) {
    const finalCache = {
        ...cacheData,
        cacheModified: cacheDate.toISOString()
    }
    const { error } = await supabase
        .from('storage_hourly_cache')
        .upsert({
            app_id,
            cache: finalCache,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'app_id'
        })

    if (error) {
        console.error('Error setting cache:', error)
        return false
    }

    return true
}

// This will be called by a cron job every hour
// For now, we won't do cache, but later we will
app.post('/', middlewareAPISecret, async (c) => {
    try {
        const body = await c.req.json()
        const { app_id } = inputBodySchema.parse(body)

        const supabase = await supabaseAdmin(c as any)

        // Step one: get the app owner org
        const { data: appData, error: appError } = await supabase.from('apps').select('owner_org').eq('app_id', app_id).single()
        if (appError) {
            console.error(appError)
            return c.json({ status: 'Cannot get app owner org', error: JSON.stringify(appError) }, 500)
        }
        const ownerOrgId = appData.owner_org

        // Step two: get the billing data
        const cycleInfoData = await supabase.rpc('get_cycle_info_org', { orgid: ownerOrgId }).single()
        const cycleInfo = cycleInfoData.data
        if (!cycleInfo || !cycleInfo.subscription_anchor_start || !cycleInfo.subscription_anchor_end)
            return c.json({ status: 'Cannot get cycle info' }, 400)

        // Step three: validate the billing date is not at more than 34 days apart
        const startDate = new Date(cycleInfo.subscription_anchor_start)
        const endDate = new Date(cycleInfo.subscription_anchor_end)
        const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        if (diffDays > 34)
            return c.json({ status: 'Billing date is more than 34 days apart' }, 400)

        // Step four: get the storage per hour raw data
        const { data, error } = await supabase.from('version_meta').select('*').eq('app_id', app_id).limit(100_000)
        if (error) {
            console.error(error)
            return c.json({ status: 'Cannot get storage per hour', error: JSON.stringify(error) }, 500)
        }

        // Step five: generate an array of the hours between the start and end date
        const cycleStartHour = dayjs(startDate).utc().add(1, 'hour').startOf('hour')
        const cycleEndHour = dayjs(endDate).utc().add(1, 'hour').startOf('hour')

        const hourlyTimestamps: { date: Dayjs, storage: number }[] = []
        let currentHour = cycleStartHour

        while (currentHour.isBefore(cycleEndHour) || currentHour.isSame(cycleEndHour)) {
            hourlyTimestamps.push({ date: currentHour, storage: 0 })
            currentHour = currentHour.add(1, 'hour')
        }

        // Step six: Generate a reference map for each version. It will contain the creation and deletion timestamps

        const semiSortedData: typeof data = []
        const positiveData: typeof data = []
        const negativeData: typeof data = []
        for (const item of data) {
            if (item.size > 0) {
                positiveData.push(item)
            }
            else {
                negativeData.push(item)
            }
        }

        semiSortedData.push(...positiveData)
        semiSortedData.push(...negativeData)

        const storageChanggesPerVersion = semiSortedData.reduce((acc, item) => {
            if (item.size > 0) {
                if (acc.has(item.version_id)) {
                    // What the fuck? how can two versions be added TWICE? Bad, throw
                    throw new Error('Two versions are added at the same time')
                }
                const ownerOrgId = appData.owner_org

                // Step two: get the billing data
                const cycleInfoData = await supabase.rpc('get_cycle_info_org', { orgid: ownerOrgId }).single()
                const cycleInfo = cycleInfoData.data
                if (!cycleInfo || !cycleInfo.subscription_anchor_start || !cycleInfo.subscription_anchor_end)
                    return c.json({ status: 'Cannot get cycle info' }, 400)

                // Step three: validate the billing date is not at more than 34 days apart
                const startDate = new Date(cycleInfo.subscription_anchor_start)
                const endDate = new Date(cycleInfo.subscription_anchor_end)
                const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                if (diffDays > 34)
                    return c.json({ status: 'Billing date is more than 34 days apart' }, 400)

                // Step three and a half: get the cache
                const cache = await getCacheForApp(supabase, app_id)

                // Step four: get the storage per hour raw data
                let data: any = null
                let error: any = null
                let date: Dayjs | null = null
                try {
                    const pgClient = getPgClient(c as any)
                    if (cache) {
                        data = await pgClient`select * from version_meta where app_id = ${app_id} and timestamp > ${cache.cacheModified}`
                        date = dayjs(cache.cacheModified)
                    } else {
                        data = await pgClient`select * from version_meta where app_id = ${app_id}`
                        date = dayjs()
                    }
                    closeClient(c as any, pgClient)
                } catch (e) {
                    error = e
                    data = null
                }

                if (error) {
                    console.error(error)
                    return c.json({ status: 'Cannot get storage per hour', error: JSON.stringify(error) }, 500)
                }

                if (!data) {
                    return c.json({ status: 'No data received' }, 500)
                }

                // Step five: generate an array of the hours between the start and end date
                const cycleStartHour = dayjs(startDate).utc().add(1, 'hour').startOf('hour')
                const cycleEndHour = dayjs(endDate).utc().add(1, 'hour').startOf('hour')

                const hourlyTimestamps: { date: Dayjs, storage: number }[] = []
                let currentHour = cycleStartHour

                while (currentHour.isBefore(cycleEndHour) || currentHour.isSame(cycleEndHour)) {
                    hourlyTimestamps.push({ date: currentHour, storage: 0 })
                    currentHour = currentHour.add(1, 'hour')
                }
                itemInfo.storage_removed = dayjs(item.timestamp)
                acc.set(item.version_id, itemInfo)
            }
            return acc
        }, new Map<number, { storage_added: Dayjs | null, storage_removed: Dayjs | null, size: number }>())

        // Step six: Generate a reference map for each version. It will contain the creation and deletion timestamps
        // Here we take very different approaches if the cache is valid or not.
        const semiSortedData: Database['public']['Tables']['version_meta']['Row'][] = []
        const positiveData: Database['public']['Tables']['version_meta']['Row'][] = []
        const negativeData: Database['public']['Tables']['version_meta']['Row'][] = []
        for (const item of data) {
            if (item.size > 0) {
                positiveData.push(item)
            } else {
                negativeData.push(item)
            }
        }

        if (storageAddedNull > 0) {
            console.log(`storageAddedNull: ${storageAddedNull}`)
            await reportStorageAddedNull(c as any, storageAddedNull)
        }

        const acc = new Map<number, { storage_added: Dayjs | null, storage_removed: Dayjs | null, size: number }>()

        if (cache) {
            for (const item of cache.storageChanges) {
                acc.set(item.version, { storage_added: item.storage_added ? dayjs(item.storage_added) : null, storage_removed: item.storage_removed ? dayjs(item.storage_removed) : null, size: item.size })
            }
        }

        const storageChanggesPerVersion = semiSortedData.reduce((acc, item) => {
            if (item.size > 0) {
                if (acc.has(item.version_id)) {
                    // What the fuck? how can two versions be added TWICE? Bad, throw
                    throw new Error('Two versions are added at the same time')
                }
                acc.set(item.version_id, { storage_added: dayjs(item.timestamp), storage_removed: null, size: item.size })
            }
            else if (item.size < 0) {
                if (!acc.has(item.version_id)) {
                    // What the fuck? how can a version be removed without being added? Bad, let's add it, but later we will filter out said versions
                    acc.set(item.version_id, { storage_added: null, storage_removed: dayjs(item.timestamp), size: 0 })
                }
                const itemInfo = acc.get(item.version_id)!
                if (itemInfo && dayjs(item.timestamp).isBefore(dayjs(itemInfo.storage_added))) {
                    // What the fuck? how can a version be removed before being added? Bad, throw
                    throw new Error('A version is removed before being added')
                }
                itemInfo.storage_removed = dayjs(item.timestamp)
                acc.set(item.version_id, itemInfo)
            }
            return acc
        }, acc)

        const cacheData = cacheSchema.safeParse({
            storageChanges: Array.from(storageChanggesPerVersion.entries()).map(([version, x]) => ({
                version,
                storage_added: x.storage_added?.toISOString(),
                storage_removed: x.storage_removed?.toISOString(),
                size: x.size
            }))
        })

        // We messed up the schema, don't do cache
        if (!cacheData.success) {
            cloudlogErr(cacheData.error)
        } else {
            await setCacheForApp(supabase, app_id, cacheData.data, date!)
        }

        if (startHour.isBefore(cycleStartHour))
            startHour = cycleStartHour
        startHour = startHour.startOf('hour')

        let endHour = item.storage_removed ?? now.clone()
        if (endHour.isAfter(cycleEndHour))
            endHour = cycleEndHour
        endHour = endHour.endOf('hour')

        console.log(`startHour: ${startHour.toDate().getTime()}, cycleStartHour: ${cycleStartHour.toDate().getTime()}`)
        const startIndex = (startHour.toDate().getTime() - cycleStartHour.toDate().getTime()) / 3600000
        if (startIndex % 1 !== 0) {
            throw new Error(`Start index must be a whole number, is ${startIndex}`)
        }
        const endIndex = (cycleEndHour.toDate().getTime() - (endHour.toDate().getTime() + 1)) / 3600000
        if (endIndex % 1 !== 0) {
            throw new Error(`
                End index must be a whole number, is ${endIndex}. 
                Before devision: ${cycleEndHour.toDate().getTime() - endHour.toDate().getTime()}, 
                cycleEndHour: ${cycleEndHour.toDate().getTime()}, 
                endHour: ${endHour.toDate().getTime() + 1}, 
            `)
        }

        console.log(`startIndex: ${startIndex}, endIndex: ${endIndex}, max: ${hourlyTimestamps.length} `)

        let biggestValueAdded = 0

        for (let i = startIndex; i <= endIndex; i++) {
            hourlyTimestamps[i].storage += item.size * (i - startIndex + 1)
            biggestValueAdded = Math.max(biggestValueAdded, item.size * (i - startIndex + 1))
        }

        for (let i = endIndex + 1; i < hourlyTimestamps.length; i++) {
            hourlyTimestamps[i].storage += biggestValueAdded
        }
    }

    // Step eight: Clear the database
    const { error: deleteError } = await supabase.from('storage_hourly').delete().eq('app_id', app_id)
    if (deleteError) {
        console.error(deleteError)
        return c.json({ status: 'Cannot delete storage hourly', error: JSON.stringify(deleteError) }, 500)
    }

    // Step nine: Insert the data into the database
    const { error: insertError } = await supabase.from('storage_hourly').insert(hourlyTimestamps.map(item => ({
        app_id,
        date: item.date.toDate().toISOString(),
        size: item.storage,
    })))
    if (insertError) {
        console.error(insertError)
        return c.json({ status: 'Cannot insert storage hourly', error: JSON.stringify(insertError) }, 500)
    }

    return c.json(BRES)
}
  catch (error) {
    console.error(error)
    cloudlogErr(error)
    return c.json({ error: 'Internal server error' }, 500)
}
})

async function reportStorageAddedNull(c: Context, storageAddedNull: number) {
    try {
        await sendDiscordAlert(c, {
            content: `🚨 cron_hourly_storage: storageAddedNull: ${storageAddedNull}`,
            embeds: [
                {
                    title: `❌ cron_hourly_storage: storageAddedNull: ${storageAddedNull}`,
                    description: `**Error:** Storage added is null for some versions`,
                    color: 0xFF0000, // Red color
                    timestamp: new Date().toISOString(),
                },
            ],
        })
    }
    catch (e) {
        cloudlogErr(e)
    }
}
