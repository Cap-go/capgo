import { loadingController, toastController } from '@ionic/vue'
import { useSupabase } from './supabase'

export const openPortal = async() => {
  console.log('openPortal')
  const supabase = useSupabase()
  const session = supabase.auth.session()
  if (!session)
    return
  const loading = await loadingController.create({
    message: 'Please wait...',
  })
  try {
    await loading.present()
    const response = await fetch('https://capgo.app/api/stripe_portal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': session.access_token,
      },
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
        message: 'Cannot get your portal',
        duration: 2000,
      })
    await toast.present()
  }
}
