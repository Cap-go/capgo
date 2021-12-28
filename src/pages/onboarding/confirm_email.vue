<script setup lang="ts">
import { IonContent, IonPage } from '@ionic/vue'
import { useI18n } from 'vue-i18n'
import TitleHead from '~/components/TitleHead.vue'

const { t } = useI18n()

</script>

<template>
  <IonPage>
    <IonContent :fullscreen="true">
      <div class="py-16 px-6 mx-auto w-full lg:w-1/2 min-h-screen">
        <TitleHead :big="false" :title="t('register.heading')" />
        <div class="grid place-content-center w-full my-auto pt-40">
          <h1 class="text-3xl">
            {{ t('register.confirm-email') }}
          </h1>
          <p class="mt-3">
            {{ t('register.check-email') }}
          </p>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>
