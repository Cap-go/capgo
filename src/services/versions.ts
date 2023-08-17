import { CapacitorUpdater } from '@capgo/capacitor-updater'
import dayjs from 'dayjs'
import { Capacitor } from '@capacitor/core'
import { toast } from 'vue-sonner'
import { downloadUrl } from './supabase'
import type { Database } from '~/types/supabase.types'
import { useDisplayStore } from '~/stores/display'
import { i18n } from '~/modules/i18n'

const displayStore = useDisplayStore()

export async function openVersion(app: Database['public']['Tables']['app_versions']['Row']) {
  const { t } = i18n.global

  displayStore.messageLoader = 'Opening version...'
  displayStore.showLoader = true
  let signedURL
  if (app.bucket_id)
    signedURL = await downloadUrl(app.user_id, app.storage_provider, app.app_id, app.bucket_id)
  else
    signedURL = app.external_url

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
      toast.error(t('cannot-set-this-vers'))
    }
    displayStore.showLoader = false
  }
  else {
    if (!signedURL) {
      toast.error(t('cannot-get-the-test-'))
      displayStore.showLoader = false
    }
    else {
      window.location.assign(signedURL)
      displayStore.showLoader = false
    }
  }
}
