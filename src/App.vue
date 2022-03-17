<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import { useHead } from '@vueuse/head'
import { useRouter } from 'vue-router'

const router = useRouter()
// https://github.com/vueuse/head
// you can use this to manipulate the document head in any components,
useHead({
  title: 'Capgo | Capacitor auto update tooling',
  meta: [
    { name: 'description', content: 'Send update to your capacitor app without store hassle' },
    { name: 'og:type', content: 'website' },
    { name: 'og:title', content: 'Capgo | Capacitor auto update tooling' },
    { name: 'twitter:title', content: 'Capgo | Capacitor auto update tooling' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:description', content: 'App to test your capacitor app without store hassle.' },
    { name: 'twitter:domain', content: import.meta.env.domain },
    { name: 'twitter:image', content: `https://${import.meta.env.domain}/featured.png` },
    { name: 'og:image:alt', content: 'Capgo App illustration' },
    { name: 'og:image', content: `https://${import.meta.env.domain}/featured.png` },
    { name: 'og:alt', content: 'crossfit image' },
    { name: 'og:url', content: `https://${import.meta.env.domain}/${router.currentRoute.value.path}` },
  ],
})
</script>

<template>
  <ion-app>
    <IonRouterOutlet />
  </ion-app>
</template>
