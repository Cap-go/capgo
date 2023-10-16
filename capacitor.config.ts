import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'ee.forgr.capacitor_go',
  appName: 'Capgo',
  webDir: 'dist',
  bundledWebRuntime: false,
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchAutoHide: false,
      androidScaleType: 'CENTER_CROP',
    },
    CapacitorUpdater: {
      updateUrl: 'https://xvwzpoazmxkqosrdewyv.supabase.co/functions/v1/updates_debug',
    },
  },
  android: {
    webContentsDebuggingEnabled: true,
  },
}

export default config
