import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

const firebaseConfig = import.meta.env.VITE_FIREBASE_CONFIG

cleanupOutdatedCaches()

precacheAndRoute(self.__WB_MANIFEST)

// https://firebase.google.com/docs/cloud-messaging/js/receive#handle_messages_when_your_web_app_is_in_the_background
const firebaseApp = initializeApp(JSON.parse(firebaseConfig as string))

const messaging = getMessaging(firebaseApp)
onBackgroundMessage(messaging, (payload) => {
  console.log('onBackgroundMessage', payload)

  return self.registration.showNotification(payload.notification?.title || 'no title', {
    body: payload.notification?.body,
    data: payload.data,
  })
})

// Todo: Check below code. Some problem with it. Its not being called on background-notification click
self.addEventListener('notificationclick', (event) => {
  // console.log('notificationclick event', event)
  console.log('notificationclick notif', event.notification)
  const data = event.notification.data
  event.notification.close()

  // This looks to see if the current is already open and
  // focuses if it is
  event.waitUntil(self.clients.matchAll({
    type: 'window',
  }).then((clientList) => {
    for (const client of clientList) {
      if (client.url === '/' && 'focus' in client) {
        client.focus()
        if (data.link)
          client.navigate(data.link)
      }
    }
    if (self.clients.openWindow) {
      if (data.link)
        self.clients.openWindow(data.link)
      else
        self.clients.openWindow('/')
    }
  }))
})
