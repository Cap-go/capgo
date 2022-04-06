<script setup lang="ts">
import { IonIcon, IonLabel, IonPage, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/vue'
import { hammerOutline, list, person } from 'ionicons/icons'
import { useRouter } from 'vue-router'
import { computed } from 'vue'

const router = useRouter()

const isTab = computed(() => {
  return router.currentRoute.value.meta.option && router.currentRoute.value.meta.option === 'tabs'
})
</script>
<template>
  <ion-page>
    <ion-tabs>
      <IonRouterOutlet />
      <ion-tab-bar v-if="isTab" slot="bottom" color="secondary">
        <ion-tab-button tab="home" href="/app/home">
          <ion-icon :icon="list" />
          <ion-label>Projects</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="modules" href="/app/modules">
          <ion-icon :icon="hammerOutline" />
          <ion-label>Modules</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="account" href="/app/account">
          <ion-icon :icon="person" />
          <ion-label>Account</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>
