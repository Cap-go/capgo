import type { ComposerTranslation } from 'petite-vue-i18n'
import { Capacitor } from '@capacitor/core'
import { useI18n } from 'petite-vue-i18n'
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

export async function openCheckout(priceId: string, successUrl: string, cancelUrl: string, isYear: boolean, orgId: string) {
//   console.log('openCheckout')
  const supabase = useSupabase()
  const session = await supabase.auth.getSession()
  if (!session)
    return
  try {
    const resp = await supabase.functions.invoke('private/stripe_checkout', {
      body: JSON.stringify({
        priceId,
        successUrl,
        cancelUrl,
        reccurence: isYear ? 'year' : 'month',
        orgId,
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
