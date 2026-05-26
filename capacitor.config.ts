import type { CapacitorConfig } from '@capacitor/cli'
import pkg from './package.json'

const enableSelfUpdates = process.env.CAPGO_APP_AUTO_UPDATE === 'true' || process.env.CI === 'true'

const config: CapacitorConfig = {
  appId: 'ee.forgr.capacitor_go',
  appName: 'Capgo',
  webDir: 'dist',
  plugins: {
    PushNotifications: {
      presentationOptions: [
        'badge',
        'sound',
        'alert',
      ],
    },
    SplashScreen: {
      launchAutoHide: false,
      androidScaleType: 'CENTER_CROP',
    },
    CapacitorUpdater: {
      shakeMenu: true,
      allowPreview: true,
      autoUpdate: enableSelfUpdates ? 'atInstall' : 'off',
      autoSplashscreen: true,
      version: pkg.version,
    },
  },
  android: {
    webContentsDebuggingEnabled: true,
  },
}

export default config
