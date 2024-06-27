import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'ee.forgr.capacitor_go',
  // appId: 'com.demo.app',
  appName: 'Capgo',
  webDir: 'dist',
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
      // localS3: true,
      // localHost: 'http://localhost:5173',
      // localWebHost: 'http://localhost:5173',
      // localSupa: 'http://localhost:54321',
      // localSupaAnon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    },
  },
  android: {
    webContentsDebuggingEnabled: true,
  },
}

export default config
