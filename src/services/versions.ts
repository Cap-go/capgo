import { isPlatform, loadingController, toastController } from '@ionic/vue'
import { SplashScreen } from '@capacitor/splash-screen'
import { CapacitorUpdater } from 'capacitor-updater'
import { useSupabase } from './supabase'
import type { definitions } from '~/types/supabase'

export const openVersion = async(app: definitions['app_versions']) => {
  const supabase = useSupabase()
  const auth = supabase.auth.user()

  const loading = await loadingController
    .create({
      message: 'Please wait...',
      duration: 0,
    })

  await loading.present()
  const res = await supabase
    .storage
    .from(`apps/${auth?.id}/${app.app_id}/versions`)
    .createSignedUrl(app.bucket_id, 60)

  const signedURL = res.data?.signedURL
  if (signedURL && isPlatform('capacitor')) {
    try {
      SplashScreen.show()
      const newFolder = await CapacitorUpdater.download({
        url: signedURL,
      })
      await CapacitorUpdater.set(newFolder)
    }
    catch (error) {
      console.error(error)
      const toast = await toastController
        .create({
          message: 'Cannot set this version',
          duration: 2000,
        })
      await toast.present()
    }
    SplashScreen.show()
    await loading.dismiss()
  }
  else {
    await loading.dismiss()
    console.error('no signedURL')
    const toast = await toastController
      .create({
        message: isPlatform('capacitor') ? 'Cannot get the test version' : 'Cannot test in web browser',
        duration: 2000,
      })
    await toast.present()
  }
}
