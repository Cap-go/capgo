<script setup lang="ts">
import {
  IonButton,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import { ref, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router';
import { useMainStore } from '~/stores/main';

const bannerText = ref('')
const bannerColor = ref('')
const main = useMainStore()
const route = useRoute()
const { t } = useI18n()

watchEffect(() => {
  if(route.path === '/app/usage') return 
  console.log('paymentStatus', main.myPlan)
  if (main.myPlan?.trialDaysLeft && main.myPlan?.trialDaysLeft !== 0) {
    bannerText.value = `${t('trial-plan-expires-in')}) ${parseInt(main.myPlan.trialDaysLeft)} ${t('days')}`
    bannerColor.value = 'success'
  }
  else if (main.myPlan?.trialDaysLeft === 0) {
    bannerText.value = t('trial-plan-expired')
    bannerColor.value = 'warning'
  }
})

defineProps({
  text: { type: String, default: '' },
  color: { type: String, default: '' },
})

</script>

<template>
    <IonToolbar mode="ios" id="banner-toolbar" :color="bannerColor" v-if="bannerText">
      <IonTitle>
        <p class="text-white text-center">
          {{ bannerText }}
        </p>
      </IonTitle>
      <IonButton slot="end" id="banner" href="/app/usage" color="secondary" class="text-white">
        {{ t('upgrade') }}
      </IonButton>
    </IonToolbar>
</template>
<style scoped>
/* .header-collapse-condense-inactive ion-toolbar #banner {
  display: none;
} */
/* .header-collapse-main  #banner-toolbar {
  display: none;
} */
</style>