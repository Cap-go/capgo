import { IonicVue, isPlatform, loadingController, toastController } from '@ionic/vue'
import type { HttpOptions, HttpParams } from '@capacitor-community/http'
import { Http } from '@capacitor-community/http'
import type { URLOpenListenerEvent } from '@capacitor/app'
import { App } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { CapacitorUpdater } from 'capacitor-updater'
import type { UserModule } from '~/types'
import { useMainStore } from '~/stores/main'

// /* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css'

/* Basic CSS for apps built with Ionic */
import '@ionic/vue/css/normalize.css'
import '@ionic/vue/css/structure.css'
import '@ionic/vue/css/typography.css'

/* Optional CSS utils that can be commented out */
import '@ionic/vue/css/padding.css'
import '@ionic/vue/css/float-elements.css'
import '@ionic/vue/css/text-alignment.css'
import '@ionic/vue/css/text-transformation.css'
import '@ionic/vue/css/flex-utils.css'
import '@ionic/vue/css/display.css'
const appUrl = import.meta.env.VITE_APP_URL as string
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

// put x in name to make it load last
export const install: UserModule = ({ app, router }) => {
  app.use(IonicVue)
  const main = useMainStore()
  // const regexpToken = /#access_token=(.+?)&/

  if (isPlatform('capacitor')) {
    CapacitorUpdater.notifyAppReady()
    App.addListener('appUrlOpen', async(event: URLOpenListenerEvent) => {
      const loading = await loadingController.create({
        message: 'Please wait...',
      })
      await loading.present()
      let { url } = event
      console.log('url', url)
      if (url.startsWith(supabaseUrl)) {
        const urlParams = Object.fromEntries(new URLSearchParams(url.split('?')[1]) as any)as HttpParams
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
          console.log('error', e)
          const toast = await toastController.create({
            message: 'Cannot handle this redirect',
            duration: 2000,
          })
          return toast.present()
        }
      }
      console.log('url', url)
      if (!url.startsWith(appUrl)) {
        await loading.dismiss()
        return
      }

      const slug = url.replace(appUrl, '')
      // We only push to the route if there is a slug present
      if (slug) {
        router.push(slug)
        await loading.dismiss()
        SplashScreen.hide()
      }
    })
  }
  router.afterEach((to) => {
    main.path = to.path
  })
}
