<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import { useHead } from '@vueuse/head'

// https://github.com/vueuse/head
// you can use this to manipulate the document head in any components,
useHead({
  title: 'Capgo | Capacitor tooling',
  meta: [
    { name: 'description', content: 'App to test your capacitor app without store hassle' },
    { name: 'og:type', content: 'website' },
    { name: 'og:title', content: 'Capgo | Capacitor tooling' },
    { name: 'twitter:title', content: 'Capgo | Capacitor tooling' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:domain', content: 'captime.app' },
    { name: 'twitter:image', content: 'https://capgo.app/alternative_to_1.png' },
    { name: 'og:image', content: 'https://capgo.app/alternative_to_1.png' },
    { name: 'og:alt', content: 'crossfit image' },
  ],
})
</script>

<template>
  <ion-app>
    <IonRouterOutlet />
  </ion-app>
</template>
