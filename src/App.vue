<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import { SafeArea } from 'capacitor-plugin-safe-area'
import { ref } from 'vue'

const safeArea = ref(0)

const getSafeArea = async () => {
  SafeArea.getStatusBarHeight().then(({ statusBarHeight }) => {
    console.log(statusBarHeight, 'statusbarHeight')
    safeArea.value = statusBarHeight
  })
}

getSafeArea()
</script>

<template>
  <IonApp class="bg-white/90 dark:bg-gray-900/90">
    <IonRouterOutlet :class="safeArea > 0 ? 'mt-10' : ''" />
  </IonApp>
</template>
