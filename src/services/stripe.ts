import { Capacitor } from '@capacitor/core'
import { useSupabase } from './supabase'
import { useDisplayStore } from '~/stores/display'

const displayStore = useDisplayStore()

const presentActionSheetOpen = async (url: string) => {
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
const openBlank = (link: string) => {
  console.log('openBlank', link)
  if (Capacitor.getPlatform() === 'ios')
    presentActionSheetOpen(link)
  else
    window.open(link, '_blank')
}
export const openPortal = async () => {
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
      displayStore.messageToast.push('Cannot open your portal')
    }
  }
  catch (error) {
    console.error('Error unknow', error)
    displayStore.showLoader = false
    displayStore.messageToast.push('Cannot get your portal')
  }
  return null
}

export const openCheckout = async (priceId: string, successUrl: string, cancelUrl: string, isYear: boolean) => {
//   console.log('openCheckout')
  const supabase = useSupabase()
  const session = await supabase.auth.getSession()
  if (!session)
    return
  displayStore.messageLoader = 'Please wait...'
  try {
    displayStore.showLoader = true
    const resp = await supabase.functions.invoke('stripe_checkout', { body: JSON.stringify({ priceId, successUrl, cancelUrl, reccurence: isYear ? 'year' : 'month' }) })
    displayStore.showLoader = false
    if (!resp.error && resp.data && resp.data.url)
      openBlank(resp.data.url)
  }
  catch (error) {
    console.error(error)
    displayStore.showLoader = false
    displayStore.messageToast.push('Cannot get your checkout')
  }
}
