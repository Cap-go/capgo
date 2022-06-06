<script setup lang="ts">
import {
  IonButton,
  IonTitle,
  IonToolbar,
  isPlatform,
} from '@ionic/vue'
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useMainStore } from '~/stores/main'

defineProps({
  text: { type: String, default: '' },
  color: { type: String, default: '' },
})
const bannerText = ref('')
const bannerColor = ref('')
const main = useMainStore()
const route = useRoute()
const { t } = useI18n()
const isMobile = isPlatform('capacitor')

watchEffect(() => {
  if (route.path === '/app/usage' || !main.myPlan)
    return
  console.log('paymentStatus', main.myPlan)
  if (main.myPlan && !main.myPlan?.canUseMore && main.myPlan?.trialDaysLeft !== 0) {
    bannerText.value = `${t('trial-plan-expires-in')} ${parseInt(main.myPlan.trialDaysLeft)} ${t('days')}`
    if (main.myPlan?.trialDaysLeft <= 7)
      bannerColor.value = 'warning'
    else
      bannerColor.value = 'success'
  }
  else if (main.myPlan && !main.myPlan?.canUseMore && !main.myPlan?.payment?.status) {
    bannerText.value = t('trial-plan-expired')
    bannerColor.value = 'warning'
  }
  else if (main.myPlan && !main.myPlan?.canUseMore && main.myPlan.paying) {
    bannerText.value = 'You reached the limit of your plan'
    bannerColor.value = 'warning'
  }
  else if (!main.myPlan?.canUseMore) {
    bannerText.value = 'Your plan is currently inactive'
    bannerColor.value = 'warning'
  }
})
</script>

<template>
  <IonToolbar v-if="bannerText" id="banner-toolbar" mode="ios" :color="bannerColor">
    <IonTitle>
      <p class="text-white text-center">
        {{ bannerText }}
      </p>
    </IonTitle>
    <IonButton v-if="!isMobile" id="banner" slot="end" href="/app/usage" color="secondary" class="text-white">
      {{ t('upgrade') }}
    </IonButton>
    <IonButton v-if="isMobile" id="banner" slot="end" href="/app/usage" color="secondary" class="text-white">
      {{ t('see-usage') }}
    </IonButton>
  </IonToolbar>
</template>

<style scoped>
.header-collapse-condense-inactive ion-toolbar #banner {
  display: none;
}
/* .header-collapse-main  #banner-toolbar {
  display: none;
} */
</style>
