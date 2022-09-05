import { SplashScreen } from '@capacitor/splash-screen'
import { isPlatform } from '@ionic/vue'

export const hideLoader = async () => {
  const appLoader = document.querySelector('#app-loader')
  if (appLoader) {
    appLoader.setAttribute('style', 'z-index: -10;')
    if (isPlatform('capacitor'))
      SplashScreen.hide()
  }
}
