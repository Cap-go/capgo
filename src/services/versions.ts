import { CapacitorUpdater } from '@capgo/capacitor-updater'
import dayjs from 'dayjs'
import { Capacitor } from '@capacitor/core'
import { useSupabase } from './supabase'
import type { Database } from '~/types/supabase.types'
import { useDisplayStore } from '~/stores/display'

const displayStore = useDisplayStore()

export const openVersion = async (app: Database['public']['Tables']['app_versions']['Row'], userId: string) => {
  const supabase = useSupabase()

  displayStore.messageLoader = 'Opening version...'
  displayStore.showLoader = true
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
      displayStore.messageToast.push('Cannot set this version')
    }
    displayStore.showLoader = false
  }
  else {
    if (!signedURL) {
      displayStore.messageToast.push('Cannot get the test version')
      displayStore.showLoader = false
    }
    else {
      window.location.assign(signedURL)
      displayStore.showLoader = false
    }
  }
}
