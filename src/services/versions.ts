import type { Database } from '~/types/supabase.types'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import dayjs from 'dayjs'
import { toast } from 'vue-sonner'
import { i18n } from '~/modules/i18n'
import { hideLoader, showLoader } from './loader'
import { downloadUrl } from './supabase'

export async function openVersion(app: Database['public']['Tables']['app_versions']['Row']) {
  const { t } = i18n.global

  let signedURL
  if (app.r2_path)
    signedURL = await downloadUrl(app.storage_provider, app.user_id ?? '', app.app_id, app.id)
  else
    signedURL = app.external_url

  if (!signedURL) {
    toast.error(t('cannot-get-the-test-'))
    return
  }
  if (!Capacitor.isNativePlatform()) {
    window.location.assign(signedURL)
    return
  }
  // native platform test the budnle in the app
  showLoader()
  try {
    const newBundle = await CapacitorUpdater.download({
      url: signedURL,
      version: app.name,
    })
    const current = await CapacitorUpdater.current()
    // Make the old bundle auto revert to it after 1 hour
    await CapacitorUpdater.next({ id: current.bundle.id })
    // iso date in one hour with dayjs
    const expires = dayjs().add(1, 'hour').toISOString()
    await CapacitorUpdater.setMultiDelay({ delayConditions: [{ kind: 'date', value: expires }] })
    // set the new bundle
    await CapacitorUpdater.set(newBundle)
  }
  catch (error) {
    console.error('Error', error)
    toast.error(t('cannot-set-this-vers'))
  }
  hideLoader()
}
