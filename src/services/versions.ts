import { loadingController, toastController } from '@ionic/vue'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import dayjs from 'dayjs'
import { Capacitor } from '@capacitor/core'
import { useSupabase } from './supabase'
import type { Database } from '~/types/supabase.types'

export const openVersion = async (app: Database['public']['Tables']['app_versions']['Row'], userId: string) => {
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
    signedURL = res.data?.signedUrl
  }
  else {
    signedURL = app.external_url
  }

  if (signedURL && Capacitor.isNativePlatform()) {
    try {
      // const newBundle = await CapacitorUpdater.download({
      //   url: signedURL
      // })
      // await CapacitorUpdater.set(newBundle)
      // comment temporary
      const newBundle = await CapacitorUpdater.download({
        url: signedURL,
        version: app.name,
      })
      const current = await CapacitorUpdater.current()
      // console.log('current', current)
      await CapacitorUpdater.next({ id: current.bundle.id })
      // // iso date in one hour with dayjs
      const expires = dayjs().add(1, 'hour').toISOString()
      await CapacitorUpdater.setMultiDelay({ delayConditions: [{ kind: 'date', value: expires }] })
      await CapacitorUpdater.set(newBundle)
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
