import { isPlatform, loadingController, toastController } from '@ionic/vue'
import { SplashScreen } from '@capacitor/splash-screen'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { useSupabase } from './supabase'
import type { definitions } from '~/types/supabase'

interface versionSet {
  version: string
  versionName?: string | undefined
}
export const openVersion = async(app: definitions['app_versions']) => {
  const supabase = useSupabase()
  const auth = supabase.auth.user()

  const loading = await loadingController
    .create({
      message: 'Please wait...',
      duration: 0,
    })

  await loading.present()
  let signedURL
  if (app.bucket_id) {
    const res = await supabase
      .storage
      .from(`apps/${auth?.id}/${app.app_id}/versions`)
      .createSignedUrl(app.bucket_id, 60)

    signedURL = res.data?.signedURL
  }
  else {
    signedURL = app.external_url
  }

  if (signedURL && isPlatform('capacitor')) {
    try {
      SplashScreen.show()
      const newFolder: versionSet = await CapacitorUpdater.download({
        url: signedURL,
      })
      newFolder.versionName = app.name
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
    if (!signedURL) {
      await loading.dismiss()
      const toast = await toastController
        .create({
          message: 'Cannot get the test version',
          duration: 2000,
        })
      await toast.present()
    }
    else {
      window.location.assign(signedURL)
      await loading.dismiss()
    }
  }
}
