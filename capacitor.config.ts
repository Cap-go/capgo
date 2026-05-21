import type { CapacitorConfig } from '@capacitor/cli'
import pkg from './package.json'

type CapacitorUpdaterConfig = NonNullable<NonNullable<CapacitorConfig['plugins']>['CapacitorUpdater']>

const capacitorUpdaterConfig = {
  shakeMenu: true,
  allowPreview: true,
  autoSplashscreen: true,
  directUpdate: 'atInstall',
  version: pkg.version,
} satisfies CapacitorUpdaterConfig

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
    CapacitorUpdater: capacitorUpdaterConfig,
  },
  android: {
    webContentsDebuggingEnabled: true,
  },
}

export default config
