import { loadingController, toastController } from '@ionic/vue'
import { useSupabase } from './supabase'

export const openPortal = async() => {
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
    // const response = await fetch('https://capgo.app/api/stripe_portal', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'authorization': session.access_token,
    //   },
    // })
    // const res = await response.json()
    await loading.dismiss()
    if (!resp.error && resp.data && resp.data.url)
      window.open(resp.data.url, '_blank')
  }
  catch (error) {
    console.error(error)
    await loading.dismiss()
    const toast = await toastController
      .create({
        message: 'Cannot get your portal',
        duration: 2000,
      })
    await toast.present()
  }
}

export const openCheckout = async(priceId: string) => {
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
    const response = await fetch('https://capgo.app/api/stripe_checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': session.access_token,
      },
      body: JSON.stringify({
        priceId,
      }),
    })
    const res = await response.json()
    await loading.dismiss()
    if (res && res.url)
      window.open(res.url, '_blank')
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
