import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ee.forgr.capacitor_go',
  appName: 'Capgo',
  webDir: 'dist',
  plugins: {
    PushNotifications: {
      presentationOptions: [
        'badge',
        'sound',
        'alert'
      ]
    },
    SplashScreen: {
      launchAutoHide: false,
      androidScaleType: 'CENTER_CROP'
    },
    CapacitorUpdater: {
      shakeMenu: true,
      autoSplashscreen: true,
      directUpdate: 'atInstall',
      version: '12.84.2',
      publicKey: '-----BEGIN RSA PUBLIC KEY-----\nMIIBCgKCAQEA1GyVWIZU07dro+SCvnROspVK/C3aPiPN3Sf+vMzkmQl0vX1x9WBs\nQSS4z+TNK7KfWDw5GAPZ6w7jAxJWrqzKXstG4bqpAY1V0CGAsd5wxl1mfe48HKKn\nC6YZ/lD69TNefTeVREBAGQptW8b8ZaaizKvar8LREBHuxOIpI/2yLJGMsxq7XavU\nDPoJDW/g6a/XsI+xUhkme6cbs9nQLs6LJBjK4WkRBcL/8BXmAxGAWnJdiwk/eJ0o\nhGKZli8Mz7aYXmGgMtNc0TTgTRc6g25aewENoTgVi0eguSMZx3q9ZJBXaYhHofne\nSinac/CUgcORXs3EhUjUjPzT0E+Z229MxQIDAQAB\n-----END RSA PUBLIC KEY-----\n'
    }
  },
  android: {
    webContentsDebuggingEnabled: true
  }
};

export default config;
