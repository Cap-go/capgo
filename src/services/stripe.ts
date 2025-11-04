import type { ComposerTranslation } from 'vue-i18n'
import { Capacitor } from '@capacitor/core'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useSupabase } from './supabase'

async function presentActionSheetOpen(url: string) {
  const { t } = useI18n()
  const dialogStore = useDialogV2Store()

  dialogStore.openDialog({
    title: t('open-in-new-tab'),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('continue'),
        id: 'continue-button',
        handler: async () => {
          window.open(url, '_blank')
        },
      },
    ],
  })
  return dialogStore.onDialogDismiss()
}
export function openBlank(link: string) {
  console.log('openBlank', link)
  if (Capacitor.getPlatform() === 'ios')
    presentActionSheetOpen(link)
  else
    window.open(link, '_blank')
}
export async function openPortal(orgId: string, t: ComposerTranslation) {
  let url = ''
  const supabase = useSupabase()
  const dialogStore = useDialogV2Store()

  const session = await supabase.auth.getSession()
  if (!session)
    return

  // datafast_visitor_id

  const prem = supabase.functions.invoke('private/stripe_portal', {
    body: JSON.stringify({ callbackUrl: window.location.href, orgId }),
  }).then(({ data }) => {
    if (data?.url) {
      url = data.url
    }
  })

  dialogStore.openDialog({
    title: t('open-your-portal'),
    description: t('stripe-billing-portal-will-be-opened-in-a-new-tab'),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-confirm'),
        id: 'confirm-button',
        role: 'primary',
        handler: async () => {
          await prem
          if (url)
            openBlank(url)
          else
            toast.error('Cannot open your portal')
        },
      },
    ],
  })
  return dialogStore.onDialogDismiss()
}

async function getAttributionId() {
  // attribute is made via cookie of name datafast_visitor_id
  return (await cookieStore.get('datafast_visitor_id'))?.value
}

export async function openCheckout(priceId: string, successUrl: string, cancelUrl: string, isYear: boolean, orgId: string) {
  //   console.log('openCheckout')
  const supabase = useSupabase()
  const session = await supabase.auth.getSession()
  if (!session)
    return
  const attributionId = await getAttributionId()
  try {
    const resp = await supabase.functions.invoke('private/stripe_checkout', {
      body: JSON.stringify({
        priceId,
        successUrl,
        cancelUrl,
        reccurence: isYear ? 'year' : 'month',
        orgId,
        attributionId,
      }),
    })
    if (!resp.error && resp.data?.url)
      openBlank(resp.data.url)
  }
  catch (error) {
    console.error(error)
    toast.error('Cannot get your checkout')
  }
}

export async function startCreditTopUp(orgId: string, quantity = 100) {
  if (!orgId)
    return
  const supabase = useSupabase()
  try {
    const { data, error } = await supabase.functions.invoke('private/credits/start-top-up', {
      body: JSON.stringify({ orgId, quantity }),
    })
    if (error || !data?.url) {
      console.error('Failed to start credit top-up', error ?? data)
      throw error ?? new Error('Missing checkout URL')
    }
    window.location.href = data.url
  }
  catch (error) {
    console.error('Cannot start credit top-up checkout', error)
    toast.error('Cannot start credit checkout')
    throw error
  }
}

export async function completeCreditTopUp(orgId: string, sessionId: string) {
  if (!orgId || !sessionId)
    return null

  const supabase = useSupabase()
  try {
    const { data, error } = await supabase.functions.invoke('private/credits/complete-top-up', {
      body: JSON.stringify({ orgId, sessionId }),
    })
    if (error) {
      console.error('Failed to complete credit top-up', error)
      throw error
    }
    return data?.grant ?? null
  }
  catch (error) {
    console.error('Cannot complete credit top-up', error)
    toast.error('Cannot finalize credit checkout')
    throw error
  }
}
