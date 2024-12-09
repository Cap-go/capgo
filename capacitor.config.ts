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
      publicKey: '-----BEGIN RSA PUBLIC KEY-----\nMIIBCgKCAQEAr14i5kxJzunGDdobtL/GQt6AHtO2cogKW8mCfe0JRi6VLuyxti8v\nM9rexGPTKswuhICMObVwvvfYlyE2Hc6FnWABWkWVujSfqvpRYb7qzfh2cMJzpaHM\nIqKeDVV1nRT9nt+wK3xJ/FZn+YZEaOQF07k9zTy78MqmQbSg95+aOBkfdujQhMYl\n2LyXUgN8xZXRMJUbdqgtkyUS4y7T3ODvgGzzrnhszcDF4AhC5R9mz7NqPrAf0T2A\nGIYnA6f6omsc9VzItvtV4wFp3dZHbzpM+7BcSrL7KtpjPDuNaiAdAvOyrRJZAg8b\nionslGkRyAJj1OMmuAHPfXEBLJFZf+0GxQIDAQAB\n-----END RSA PUBLIC KEY-----\n',
      statsUrl: 'http://localhost:54321/functions/v1/stats',
      channelUrl: 'http://localhost:54321/functions/v1/channel_self',
      updateUrl: 'http://localhost:54321/functions/v1/updates',
      localApiFiles: 'http://localhost:54321/functions/v1',
      localS3: true,
      localSupa: 'http://localhost:54321',
      localSupaAnon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
    }
  },
  android: {
    webContentsDebuggingEnabled: true
  }
};

export default config;
