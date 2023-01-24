import { IonicVue, loadingController, toastController } from '@ionic/vue'
import type { HttpOptions, HttpParams } from '@capacitor-community/http'
import { Http } from '@capacitor-community/http'
import type { URLOpenListenerEvent } from '@capacitor/app'
import { App } from '@capacitor/app'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { Capacitor } from '@capacitor/core'
import type { UserModule } from '~/types'
import { useMainStore } from '~/stores/main'
import { hideLoader } from '~/services/loader'

const appUrl = import.meta.env.VITE_APP_URL as string
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

// put x in name to make it load last
export const install: UserModule = ({ app, router }) => {
  app.use(IonicVue)
  const main = useMainStore()
  if (Capacitor.isNativePlatform()) {
    CapacitorUpdater.notifyAppReady()
    App.addListener('appUrlOpen', async (event: URLOpenListenerEvent) => {
      const loading = await loadingController.create({
        message: 'Please wait...',
      })
      await loading.present()
      let { url } = event
      if (url.startsWith(supabaseUrl)) {
        const urlParams = Object.fromEntries(new URLSearchParams(url.split('?')[1]) as any) as HttpParams
        const options: HttpOptions = {
          url,
          params: urlParams,
        }
        try {
          const response = await Http.get(options)
          if (response.status === 200)
            url = response.url
        }
        catch (e) {
          console.error('appUrlOpen', e)
          const toast = await toastController.create({
            message: 'Cannot handle this redirect',
            duration: 2000,
          })
          await loading.dismiss()
          return toast.present()
        }
      }
      else {
        await loading.dismiss()
        return
      }

      const slug = url.replace(appUrl, '')
      // We only push to the route if there is a slug present
      if (slug) {
        router.push(slug)
        await loading.dismiss()
        hideLoader()
      }
    })
  }
  router.afterEach((to) => {
    main.path = to.path
  })
}
