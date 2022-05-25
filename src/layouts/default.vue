<script setup lang="ts">
import { IonIcon, IonLabel, IonPage, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs, isPlatform } from '@ionic/vue'
import { hammerOutline, list, person } from 'ionicons/icons'
import { useRouter } from 'vue-router'
import { computed, onMounted, ref } from 'vue'
import Banner from '~/components/Banner.vue'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'

const router = useRouter()
const supabase = useSupabase()
const main = useMainStore()

const bannerText = ref('')
const bannerColor = ref('')

const isTab = computed(() => {
  return router.currentRoute.value.meta.option && router.currentRoute.value.meta.option === 'tabs'
})
const isMobile = computed(() => isPlatform('capacitor'))

const paymentStatus = async() => {
  const { data, error } = await supabase.functions.invoke('payment_status', {})

  if (data.trialDaysLeft && data.trialDaysLeft !== 0) {
    bannerText.value = `Trial Plan expires in ${parseInt(data.trialDaysLeft)} days`
    bannerColor.value = 'bg-orange-500'
  }

  else if (data.trialDaysLeft === 0) {
    bannerText.value = 'Trial Plan Expired'
    bannerColor.value = 'bg-rose-800'
  }
}

if (main.auth)
  paymentStatus()

</script>
<template>
  <ion-page>
    <Banner :text="bannerText" :color="bannerColor" />
    <ion-tabs>
      <IonRouterOutlet />
      <ion-tab-bar v-if="isTab" slot="bottom" color="secondary">
        <ion-tab-button tab="home" href="/app/home">
          <ion-icon :icon="list" />
          <ion-label>Projects</ion-label>
        </ion-tab-button>
        <ion-tab-button v-if="isMobile" tab="modules" href="/app/modules">
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
