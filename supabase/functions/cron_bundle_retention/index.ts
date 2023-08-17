import { serve } from 'https://deno.land/std@0.198.0/http/server.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import { getEnv, methodJson, sendRes } from '../_utils/utils.ts'
import type { BaseHeaders } from '../_utils/types.ts'
import { r2 } from '../_utils/r2.js'

async function main(url: URL, headers: BaseHeaders, method: string, body: any) {
  const API_SECRET = getEnv('API_SECRET')
  const authorizationSecret = headers.apisecret
  if (!authorizationSecret)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)

  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET) {
    console.error('Fail Authorization', { authorizationSecret, API_SECRET })
    return sendRes({ message: 'Fail Authorization', authorizationSecret }, 400)
  }

  try {
    const { data: appsWithRetention, error: appDataError } = await supabaseAdmin().from('apps').select(`
    app_id,
    user_id,
    retention,
    app_versions_meta( id, created_at, updated_at )
    `).not('retention', 'is', null)

    if (appDataError)
      console.error('error in fetching the apps data ::', appDataError)

    const appVersionsIdsPassedRetention: number[] = []
    appsWithRetention.forEach((app) => {
      app.app_versions_meta.forEach((meta) => {
        const isRetentionPassed = daysBetween(new Date(), new Date(meta.created_at)) > app.retention
        && daysBetween(new Date(), new Date(meta.updated_at)) > app.retention

        if (isRetentionPassed)
          appVersionsIdsPassedRetention.push(meta.id)
      })
    })

    if (!appVersionsIdsPassedRetention.length)
      return sendRes()
    // check for channels
    const { data: channels, error: channelDataError } = await supabaseAdmin().from('channels').select(`
    version,
    app_id
    `).in('version', appVersionsIdsPassedRetention)

    if (channelDataError)
      console.error('ERROR in fetching channels ', channelDataError)

    // app versions should not be used in any channels
    const appVersionsIdsToDelete = appVersionsIdsPassedRetention.filter((appVersion) => {
      return !channels.map((channel: { version: any }) => channel.version).includes(appVersion)
    })

    const { data: appVersions, error: appVersionsDataError } = await supabaseAdmin().from('app_versions').select(
      `
      id,
      app_id,
      user_id,
      bucket_id,
      storage_provider
      `).in('id', appVersionsIdsToDelete).eq('deleted', false)

    if (appVersionsDataError)
      console.error('ERROR in fetching app versions :: ', channelDataError)

    await Promise.all(appVersions.map((appVersion) => {
      return deleteBucket({
        id: appVersion.id,
        app_id: appVersion.app_id,
        bucket_id: appVersion.bucket_id,
        user_id: appVersion.user_id,
        storage_provider: appVersion.storage_provider,
      })
    }))

    return sendRes()
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
}

async function deleteBucket(appVersion: { id: number; app_id: string; user_id: string; bucket_id: string; storage_provider: string }) {
  const { error } = await supabaseAdmin()
    .from('app_versions')
    .update({ bucket_id: null, deleted: true })
    .eq('id', appVersion.id)
    .single()
  if (error && error.code !== 'PGRST116') {
    console.log('Error', appVersion.id, error)
    return Promise.resolve()
  }
  if (error) {
    console.log('Error', appVersion.id, error)
    return Promise.resolve()
  }

  const { error: errorUpdate } = await supabaseAdmin()
    .from('app_versions_meta')
    .update({ size: 0 })
    .eq('id', appVersion.id)
  if (errorUpdate) {
    console.log('Error', appVersion.id, errorUpdate)
    return Promise.resolve()
  }

  if (appVersion.storage_provider === 'supabase') {
    const { data: data2, error: error2 } = await supabaseAdmin()
    .storage
    .from(`apps/${appVersion.user_id}/${appVersion.app_id}/versions`)
    .remove([appVersion.bucket_id])
    if (error2 || !data2) {
      console.log('Error', appVersion.bucket_id, error2)
      return Promise.resolve()
    }
    console.log('app_versions storage delete', appVersion.id)
  } else if (appVersion.storage_provider === 'r2') {
    const versionPath = `apps/${appVersion.user_id}/${appVersion.app_id}/versions/${appVersion.bucket_id}`;
    if (r2.checkIfExist(versionPath)) {
      try {
        await r2.deleteObject(`apps/${appVersion.user_id}/${appVersion.app_id}/versions`)
      }
      catch (e) {
        console.error('Error in deleting the r2 storage', appVersion.id, errorUpdate)
        return Promise.resolve()
      }
    }
    console.log('app_versions storage delete', appVersion.id)
  }

  return Promise.resolve()
}

function daysBetween(date1: Date, date2: Date) {
  const dateOne = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate())
  const dateTwo = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate())
  const ms = Math.abs(dateOne - dateTwo)
  return Math.floor(ms / 1000 / 60 / 60 / 24)
}

serve(async (event: Request) => {
  try {
    const url: URL = new URL(event.url)
    const headers: BaseHeaders = Object.fromEntries(event.headers.entries())
    const method: string = event.method
    const body: any = methodJson.includes(method) ? await event.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
})
