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

watch(
  () => main.myPlan,
  (myPlan, prevMyPlan) => {
    if (route.path === '/app/usage' || prevMyPlan)
      return
    if (myPlan && !myPlan?.paying && myPlan?.trialDaysLeft !== 0) {
      bannerText.value = `${t('trial-plan-expires-in')} ${parseInt(myPlan.trialDaysLeft)} ${t('days')}`
      if (myPlan?.trialDaysLeft <= 7)
        bannerColor.value = 'warning'
      else
        bannerColor.value = 'success'
    }
    else if (myPlan && !myPlan?.canUseMore && !myPlan?.payment?.status) {
      bannerText.value = t('trial-plan-expired')
      bannerColor.value = 'warning'
    }
    else if (myPlan && !myPlan?.canUseMore && myPlan.paying) {
      bannerText.value = 'You reached the limit of your plan'
      bannerColor.value = 'warning'
    }
    else if (!myPlan?.canUseMore) {
      bannerText.value = 'Your plan is currently inactive'
      bannerColor.value = 'warning'
    }
  },
)
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
