<script setup lang="ts">
import { IonIcon, IonLabel, IonPage, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs, isPlatform } from '@ionic/vue'
import { hammerOutline, list, person } from 'ionicons/icons'
import { useRouter } from 'vue-router'
import { computed } from 'vue'

const router = useRouter()
const isTab = computed(() => {
  return router.currentRoute.value.meta.option && router.currentRoute.value.meta.option === 'tabs'
})
const isMobile = computed(() => isPlatform('capacitor'))
</script>

<template>
  <IonPage>
    <IonTabs>
      <IonRouterOutlet />
      <IonTabBar v-if="isTab" slot="bottom" color="secondary">
        <IonTabButton tab="home" href="/app/home">
          <IonIcon :icon="list" />
          <IonLabel>Projects</IonLabel>
        </IonTabButton>
        <IonTabButton v-if="isMobile" tab="modules" href="/app/modules">
          <IonIcon :icon="hammerOutline" />
          <IonLabel>Modules</IonLabel>
        </IonTabButton>
        <IonTabButton tab="account" href="/app/account">
          <IonIcon :icon="person" />
          <IonLabel>Account</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  </IonPage>
</template>
