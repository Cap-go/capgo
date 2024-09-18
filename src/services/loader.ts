import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'

export async function hideLoader() {
  const appLoader = document.querySelector('#app-loader')
  if (appLoader) {
    appLoader.setAttribute('style', 'visibility: hidden;')
    if (Capacitor.isNativePlatform())
      SplashScreen.hide()
  }
}

export async function showLoader() {
  const appLoader = document.querySelector('#app-loader')
  if (appLoader) {
    appLoader.setAttribute('style', 'visibility: visible;')
    if (Capacitor.isNativePlatform())
      SplashScreen.show()
  }
}
