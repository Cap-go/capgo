<script setup lang="ts">
import {
  IonButton,
  IonTitle,
  IonToolbar,
  isPlatform,
} from '@ionic/vue'
import { ref, watch } from 'vue'
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

const setBannerState = () => {
  if (main.canceled) {
    bannerText.value = t('plan-inactive')
    bannerColor.value = 'warning'
  }
  else if (!main.paying && main.trialDaysLeft > 1) {
    bannerText.value = `${main.trialDaysLeft} ${t('trial-left')}`
    if (main.trialDaysLeft <= 7)
      bannerColor.value = 'warning'
    else
      bannerColor.value = 'success'
  }
  else if (!main.paying && main.trialDaysLeft === 1) {
    bannerText.value = t('one-day-left')
    bannerColor.value = 'warning'
  }
  else if (!main.paying && !main.canUseMore) {
    bannerText.value = t('trial-plan-expired')
    bannerColor.value = 'warning'
  }
  else if (main.paying && !main.canUseMore) {
    bannerText.value = t('you-reached-the-limi')
    bannerColor.value = 'warning'
  }
}
watch(
  () => main.trialDaysLeft,
  (trialDaysLeft, prevTrialDaysLeft) => {
    console.log('trialDaysLeft', trialDaysLeft)
    if (route.path === '/dashboard/settings/plans' || !prevTrialDaysLeft || !trialDaysLeft)
      return
    setBannerState()
  },
)
setBannerState()
</script>

<template>
  <IonToolbar v-if="bannerText" id="banner-toolbar" mode="ios" :color="bannerColor">
    <IonTitle>
      <p class="text-white text-center">
        {{ bannerText }}
      </p>
    </IonTitle>
    <IonButton v-if="!isMobile" id="banner" slot="end" href="/dashboard/settings/plans" color="secondary" class="text-white">
      {{ t('upgrade') }}
    </IonButton>
    <IonButton v-if="isMobile" id="banner" slot="end" href="/dashboard/settings/plans" color="secondary" class="text-white">
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
