import { actionSheetController, isPlatform, loadingController, toastController } from '@ionic/vue'
import { useSupabase } from './supabase'

const presentActionSheetOpen = async (url: string) => {
  const actionSheet = await actionSheetController.create({
    buttons: [
      {
        text: 'Continue',
        handler: () => {
          window.open(url, '_blank')
        },
      },
    ],
  })
  await actionSheet.present()
}
const openBlank = (link: string) => {
  console.log('openBlank', link)
  if (isPlatform('ios'))
    presentActionSheetOpen(link)
  else
    window.open(link, '_blank')
}
export const openPortal = async () => {
//   console.log('openPortal')
  const supabase = useSupabase()
  const session = supabase.auth.session()
  if (!session)
    return
  const loading = await loadingController.create({
    message: 'Please wait...',
  })
  try {
    await loading.present()
    const resp = await supabase.functions.invoke('stripe_portal', {})
    console.error('stripe_portal', resp)
    await loading.dismiss()
    if (!resp.error && resp.data && resp.data.url) {
      console.error('resp.data.url', resp.data.url)
      openBlank(resp.data.url)
    }
    else {
      const toast = await toastController.create({
        message: 'Cannot open your portal',
        duration: 2000,
      })
      await toast.present()
    }
  }
  catch (error) {
    console.error('Error unknow', error)
    await loading.dismiss()
    const toast = await toastController
      .create({
        message: 'Cannot get your portal',
        duration: 2000,
      })
    await toast.present()
  }
  return null
}

export const openCheckout = async (priceId: string) => {
//   console.log('openCheckout')
  const supabase = useSupabase()
  const session = supabase.auth.session()
  if (!session)
    return
  const loading = await loadingController.create({
    message: 'Please wait...',
  })
  try {
    await loading.present()
    const resp = await supabase.functions.invoke('stripe_checkout', { body: JSON.stringify({ priceId }) })
    await loading.dismiss()
    if (!resp.error && resp.data && resp.data.url)
      openBlank(resp.data.url)
  }
  catch (error) {
    console.error(error)
    await loading.dismiss()
    const toast = await toastController
      .create({
        message: 'Cannot get your checkout',
        duration: 2000,
      })
    await toast.present()
  }
}
