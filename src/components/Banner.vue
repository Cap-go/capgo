<script setup lang="ts">
import {
  IonButton,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import { ref, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n'
import { useSupabase } from '~/services/supabase';
import { useMainStore } from '~/stores/main';
const bannerText = ref('')
const bannerColor = ref('')
const supabase = useSupabase()
const main = useMainStore()

const paymentStatus = async() => {
  const { data } = await supabase.functions.invoke('payment_status', {})

  console.log('paymentStatus', data)

  if (data.trialDaysLeft && data.trialDaysLeft !== 0) {
    bannerText.value = `${t('trial-plan-expires-in')}) ${parseInt(data.trialDaysLeft)} ${t('days')}`
    bannerColor.value = 'success'
  }
  else if (data.trialDaysLeft === 0) {
    bannerText.value = t('trial-plan-expired')
    bannerColor.value = 'warning'
  }
}

watchEffect(() => {
  if (main.auth)
    paymentStatus()
})
const { t } = useI18n()

defineProps({
  text: { type: String, default: '' },
  color: { type: String, default: '' },
})

</script>

<template>
    <IonToolbar mode="ios" :color="bannerColor" v-if="bannerText">
      <IonTitle>
        <p class="text-white text-center">
          {{ bannerText }}
        </p>
      </IonTitle>
      <IonButton slot="end" href="/app/usage" color="secondary" class="text-white">
        {{ t('upgrade') }}
      </IonButton>
    </IonToolbar>
</template>
<style >
.header-collapse-condense-inactive > .ion-button {
  display: none;
}
</style>