<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { chevronBackOutline } from 'ionicons/icons'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
defineProps({
  title: { type: String, default: '' },
  big: { type: Boolean, default: false },
})
const { t } = useI18n()
const router = useRouter()
</script>

<template>
  <div class="sticky top-0 mt-safe z-50 bg-white dark:bg-black">
    <div class="absolute flex left-0 top-5 text-sm text-bright-cerulean-500 items-center" @click="router.go(-1)">
      <IonIcon :icon="chevronBackOutline" />
      {{ t('button.back') }}
    </div>
    <h1 class="font-medium text-left text-black-light dark:text-white-light pt-10 first-letter:uppercase" :class="{'text-4xl': big, 'text-lg': !big}">
      {{ title }}
    </h1>
  </div>
</template>
