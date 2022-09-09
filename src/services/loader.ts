import { SplashScreen } from '@capacitor/splash-screen'
import { isPlatform } from '@ionic/vue'

export const hideLoader = async () => {
  const appLoader = document.querySelector('#app-loader')
  if (appLoader) {
    appLoader.setAttribute('style', 'visibility: hidden;')
    if (isPlatform('capacitor'))
      SplashScreen.hide()
  }
}
