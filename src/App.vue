<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import { useHead } from '@vueuse/head'

// https://github.com/vueuse/head
// you can use this to manipulate the document head in any components,
useHead({
  title: 'Capacitor go',
  meta: [
    { name: 'description', content: 'App to test your capacitor app without store hassle' },
  ],
})

</script>

<template>
  <ion-app>
    <IonRouterOutlet />
  </ion-app>
</template>
