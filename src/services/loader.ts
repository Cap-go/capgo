import { SplashScreen } from '@capacitor/splash-screen'
import { Capacitor } from '@capacitor/core'

export async function hideLoader() {
  const appLoader = document.querySelector('#app-loader')
  if (appLoader) {
    appLoader.setAttribute('style', 'visibility: hidden;')
    if (Capacitor.isNativePlatform())
      SplashScreen.hide()
  }
}
