import { getMessaging, getToken, onMessage } from 'firebase/messaging'
import { initializeApp } from 'firebase/app'
import { isPlatform } from '@ionic/vue'
import type { ActionPerformed, PushNotificationSchema, Token } from '@capacitor/push-notifications'
import { PushNotifications } from '@capacitor/push-notifications'
import type { Router } from 'vue-router'
import { useSupabase } from '~/services/supabase'
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = import.meta.env.VITE_FIREBASE_CONFIG

const registerToken = async(token: string) => {
  const supabase = useSupabase()
  console.log(`Push registration success, token: ${token}`)
  const { error } = await supabase
    .from('notification_token')
    .insert([
      {
        created_by: supabase.auth.user()?.id,
        token,
      },
    ])
  if (error)
    console.error('error registration', error)
}

export const initNotif = () => {
// Initialize Firebase
  if (!isPlatform('capacitor')) {
    console.log('register web', firebaseConfig)
    const app = initializeApp(JSON.parse(firebaseConfig as string))
    const messaging = getMessaging(app)
    getToken(messaging, { vapidKey: import.meta.env.VITE_VAPID_KEY as string }).then(async(currentToken) => {
      if (currentToken) {
        // Send the token to your server and update the UI if necessary
        // ...
        console.log('token', currentToken)
        try {
          await registerToken(currentToken)
        }
        catch (e) {
          console.error(e)
        }
      }
      else {
        // Show permission request UI
        console.log('No registration token available. Request permission to generate one.')
        // ...
      }
    }).catch((err) => {
      console.log('An error occurred while retrieving token. ', err)
      // ...
    })
  }
  else {
    // On success, we should be able to receive notifications
    PushNotifications.addListener('registration',
      async(token: Token) => {
        try {
          await registerToken(token.value)
        }
        catch (e) {
          console.error(e)
        }
      },
    )
    // Some issue with our setup and push will not work
    PushNotifications.addListener('registrationError',
      (error: any) => {
        console.log(`Error on registration: ${JSON.stringify(error)}`)
      },
    )
    PushNotifications.checkPermissions().then(({ receive }) => {
      console.log('checkPermissions', receive)
      if (receive === 'granted')
        PushNotifications.register()
    })
  }
}

export const listenNotif = (router: Router) => {
  if (!isPlatform('capacitor')) {
    const app = initializeApp(JSON.parse(firebaseConfig as string))
    const messaging = getMessaging(app)
    onMessage(messaging, (payload) => {
      console.log('Message received. ', payload)
      // ...
      const isNotInChatPages = window.location.pathname !== '/app/chats' && window.location.pathname.search('/chat/') === -1
      if (isNotInChatPages && payload.notification?.title) {
        const greeting = new Notification(payload.notification.title, {
          body: payload.notification?.body,
          icon: '/pwa-192x192.png',
        })

        greeting.addEventListener('click', () => {
          window.location.href = `${window.location.host}${payload.data?.link}`
        })
      }
    })
  }
  else {
    // Show us the notification payload if the app is open on our device
    PushNotifications.addListener('pushNotificationReceived',
      (notification: PushNotificationSchema) => {
        console.log(`Push received: ${JSON.stringify(notification)}`)
      },
    )

    // Method called when tapping on a notification
    PushNotifications.addListener('pushNotificationActionPerformed',
      (notification: ActionPerformed) => {
        console.log(`Push action performed: ${JSON.stringify(notification)}`)
        if (notification.notification.data.link)
          router.push(notification.notification.data.link)
      },
    )
  }
}
