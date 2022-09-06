<script setup lang="ts">
import {
  IonButton,
  IonTitle,
  IonToolbar,
  isPlatform,
} from '@ionic/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMainStore } from '~/stores/main'

defineProps({
  text: { type: String, default: '' },
  color: { type: String, default: '' },
})
const main = useMainStore()
const { t } = useI18n()
const isMobile = isPlatform('capacitor')

const bannerText = computed(() => {
  if (main.canceled)
    return t('plan-inactive')

  else if (!main.paying && main.trialDaysLeft > 1)
    return `${main.trialDaysLeft} ${t('trial-left')}`

  else if (!main.paying && main.trialDaysLeft === 1)
    return t('one-day-left')

  else if (!main.paying && !main.canUseMore)
    return t('trial-plan-expired')

  else if (main.paying && !main.canUseMore)
    return t('you-reached-the-limi')

  return null
})
const bannerColor = computed(() => {
  if (main.canceled)
    return 'warning'

  else if (!main.paying && main.trialDaysLeft > 1 && main.trialDaysLeft <= 7)
    return 'warning'

  else if (!main.paying && main.trialDaysLeft === 1)
    return 'warning'

  else if (!main.paying && !main.canUseMore)
    return 'warning'

  else if (main.paying && !main.canUseMore)
    return 'warning'

  return 'success'
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
