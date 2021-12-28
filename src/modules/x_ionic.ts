import { IonicVue, isPlatform } from '@ionic/vue'
import type { URLOpenListenerEvent } from '@capacitor/app'
import { App } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import type { UserModule } from '~/types'
// import { useMainStore } from '~/stores/main'

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

// put x in name to make it load last
export const install: UserModule = ({ app, router }) => {
  app.use(IonicVue)
  // const main = useMainStore()
  // const regexpToken = /#access_token=(.+?)&/

  // App.addListener('appStateChange', async(state) => {
  //   // Comment to hide lockscreen in dev
  // })
  if (isPlatform('capacitor')) {
    SplashScreen.hide()
    App.addListener('appUrlOpen', async(event: URLOpenListenerEvent) => {
      const slug = event.url.split('.app').pop()
      // We only push to the route if there is a slug present
      if (slug)
        router.push(slug)
    })
  }
}
