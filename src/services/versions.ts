import { isPlatform, loadingController, toastController } from '@ionic/vue'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { useSupabase } from './supabase'
import type { definitions } from '~/types/supabase'

export const openVersion = async (app: definitions['app_versions'], userId: string) => {
  const supabase = useSupabase()

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
      .from(`apps/${userId}/${app.app_id}/versions`)
      .createSignedUrl(app.bucket_id, 60)

    signedURL = res.data?.signedURL
  }
  else {
    signedURL = app.external_url
  }

  if (signedURL && isPlatform('capacitor')) {
    try {
      const newBundle = await CapacitorUpdater.download({
        url: signedURL,
        version: app.name,
      })
      await CapacitorUpdater.set({
        version: newBundle.version,
        versionName: app.name,
      })
      // comment temporary
      // const newBundle = await CapacitorUpdater.download({
      //   url: signedURL,
      // })
      // const current = await CapacitorUpdater.current()
      // console.log('current', current)
      // await CapacitorUpdater.next({ id: current.bundle.id })
      // // iso date in one hour
      // const expires = new Date(Date.now() + 1000 * 60 * 60).toISOString()
      // await CapacitorUpdater.setDelay({ kind: 'date', value: expires })
      // await CapacitorUpdater.set(newBundle)
    }
    catch (error) {
      console.error('Error', error)
      const toast = await toastController
        .create({
          message: 'Cannot set this version',
          duration: 2000,
        })
      await toast.present()
    }
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
