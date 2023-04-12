import { Capacitor } from '@capacitor/core'
import { toast } from 'vue-sonner'
import { useSupabase } from './supabase'
import { useDisplayStore } from '~/stores/display'

const displayStore = useDisplayStore()

async function presentActionSheetOpen(url: string) {
  displayStore.actionSheetOption = {
    buttons: [
      {
        text: 'Continue',
        handler: () => {
          window.open(url, '_blank')
        },
      },
    ],
  }
  displayStore.showActionSheet = true
}
function openBlank(link: string) {
  console.log('openBlank', link)
  if (Capacitor.getPlatform() === 'ios')
    presentActionSheetOpen(link)
  else
    window.open(link, '_blank')
}
export async function openPortal() {
//   console.log('openPortal')
  const supabase = useSupabase()
  const session = await supabase.auth.getSession()
  if (!session)
    return
  displayStore.messageLoader = 'Please wait...'
  displayStore.showLoader = true
  try {
    const resp = await supabase.functions.invoke('stripe_portal', {
      body: JSON.stringify({ callbackUrl: window.location.href }),
    })
    console.error('stripe_portal', resp)
    displayStore.showLoader = false
    if (!resp.error && resp.data && resp.data.url) {
      console.error('resp.data.url', resp.data.url)
      openBlank(resp.data.url)
    }
    else {
      toast.error('Cannot open your portal')
    }
  }
  catch (error) {
    console.error('Error unknow', error)
    displayStore.showLoader = false
    toast.error('Cannot get your portal')
  }
  return null
}
function getClientReferenceId() {
  return window.Rewardful && (window.Rewardful.referral ? window.Rewardful.referral : (`checkout_${(new Date()).getTime()}`))
}

export async function openCheckout(priceId: string, successUrl: string, cancelUrl: string, isYear: boolean) {
//   console.log('openCheckout')
  const supabase = useSupabase()
  const session = await supabase.auth.getSession()
  if (!session)
    return
  displayStore.messageLoader = 'Please wait...'
  try {
    displayStore.showLoader = true
    const resp = await supabase.functions.invoke('stripe_checkout', {
      body: JSON.stringify({
        priceId,
        successUrl,
        cancelUrl,
        reccurence: isYear ? 'year' : 'month',
        clientReferenceId: getClientReferenceId(), // TODO: delete after switch done
      }),
    })
    displayStore.showLoader = false
    if (!resp.error && resp.data && resp.data.url)
      openBlank(resp.data.url)
  }
  catch (error) {
    console.error(error)
    displayStore.showLoader = false
    toast.error('Cannot get your checkout')
  }
}
