import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/supabase.types'
import type { OnboardingAppDraft } from '~/utils/onboardingAppDraft'
import { FunctionsHttpError } from '@supabase/supabase-js'

type AppRow = Database['public']['Tables']['apps']['Row']

interface CreateOnboardingAppResult {
  app: AppRow
  appIdFeedback?: string
}

function isAppIdConflict(error: { status?: number, message?: string } | null | undefined) {
  if (!error)
    return false

  if (error.status === 409)
    return true

  const message = error.message?.toLowerCase() || ''
  return ['duplicate', 'already exists', 'unique constraint', 'apps_pkey', 'app_id_key', 'app_id_already_exists'].some(fragment => message.includes(fragment))
}

function slugify(value: string) {
  const slug = value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, '.')

  return slug
    .replace(/^\./g, '')
    .replace(/\.$/g, '')
    || 'prod'
}

function buildAlternativeAppIds(baseId: string, orgName?: string) {
  const normalized = baseId.trim().replace(/\.+$/g, '') || baseId
  const orgSlug = orgName ? slugify(orgName) : 'prod'

  const proposals = [
    `${normalized}.app`,
    `${normalized}.mobile`,
    `${normalized}.capgo`,
    `${normalized}.${orgSlug}`,
    `${normalized}.${crypto.randomUUID().slice(0, 4)}`,
  ]

  return [...new Set(proposals.filter(candidate => candidate !== normalized))]
}

async function readFunctionError(error: unknown) {
  if (!(error instanceof FunctionsHttpError) || !(error.context instanceof Response))
    return null

  try {
    const json = await error.context.clone().json() as {
      error?: string
      message?: string
      app_id?: string
      moreInfo?: { app_id?: string, error?: string }
    }

    return {
      status: error.context.status,
      code: json.error ?? '',
      message: json.message ?? 'Failed to create app',
      appId: json.app_id ?? json.moreInfo?.app_id ?? '',
    }
  }
  catch {
    return {
      status: error.context.status,
      code: '',
      message: `Failed to create app (${error.context.status})`,
      appId: '',
    }
  }
}

async function uploadIconFromDraft(
  supabase: SupabaseClient<Database>,
  appId: string,
  draft: OnboardingAppDraft,
) {
  const iconSource = draft.iconDataUrl || draft.storeIconDataUrl
  if (!iconSource)
    return

  let blob: Blob
  if (iconSource.startsWith('data:')) {
    const [header, payload = ''] = iconSource.split(',', 2)
    const contentType = header.match(/^data:([^;]+)/)?.[1] ?? 'image/png'
    if (!payload)
      return

    const binary = atob(payload)
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    blob = new Blob([bytes], { type: contentType })
  }
  else {
    const response = await fetch(iconSource)
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
    if (!response.ok || !contentType.startsWith('image/'))
      return
    blob = await response.blob()
  }

  const iconPath = `${appId}/icon.png`
  const { error: uploadError } = await supabase.storage
    .from('apps')
    .upload(iconPath, blob, {
      upsert: true,
      contentType: blob.type || 'image/png',
    })

  if (uploadError) {
    console.error('Cannot upload onboarding app icon', uploadError)
    return
  }

  await supabase
    .from('apps')
    .update({ icon_url: iconPath })
    .eq('app_id', appId)
}

export async function createOnboardingAppFromDraft(
  supabase: SupabaseClient<Database>,
  ownerOrgId: string,
  draft: OnboardingAppDraft,
  orgName?: string,
): Promise<CreateOnboardingAppResult> {
  const candidateIds = [draft.appId, ...buildAlternativeAppIds(draft.appId, orgName)]
  let responseData: AppRow | null = null
  let appIdFeedback: string | undefined

  for (const candidateId of candidateIds) {
    const { data, error } = await supabase.functions.invoke('app', {
      method: 'POST',
      body: {
        owner_org: ownerOrgId,
        app_id: candidateId,
        name: draft.appName,
        need_onboarding: true,
        existing_app: draft.existingApp,
        ios_store_url: draft.iosStoreUrl,
        android_store_url: draft.androidStoreUrl,
      },
    })

    if (!error && data?.app_id) {
      responseData = data as AppRow
      if (candidateId !== candidateIds[0]) {
        appIdFeedback = `App ID ${candidateIds[0]} was already taken, so Capgo switched to ${candidateId}.`
      }
      break
    }

    const functionError = await readFunctionError(error)
    const isConflict = isAppIdConflict({
      status: functionError?.status ?? (error as { status?: number } | null | undefined)?.status,
      message: `${functionError?.code ?? ''} ${functionError?.message ?? (error as { message?: string } | null | undefined)?.message ?? ''}`,
    })

    if (isConflict)
      continue

    throw new Error(functionError?.message ?? 'Failed to create app')
  }

  if (!responseData)
    throw new Error(`App ID ${candidateIds[0]} is already used.`)

  await uploadIconFromDraft(supabase, responseData.app_id, draft)

  const { data: refreshed } = await supabase
    .from('apps')
    .select()
    .eq('app_id', responseData.app_id)
    .single()

  return { app: refreshed ?? responseData, appIdFeedback }
}
