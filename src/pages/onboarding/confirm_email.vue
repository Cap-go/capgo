<script setup lang="ts">
import { IonContent, IonPage } from '@ionic/vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <IonPage>
    <IonContent :fullscreen="true">
      <div class="bg-gray-100 h-screen">
        <div class="flex items-center justify-center w-full h-full px-4 py-5 sm:p-6">
          <div class="w-full max-w-sm bg-white shadow-lg rounded-xl">
            <div class="px-4 py-5 sm:p-6">
              <div class="text-center">
                <svg class="w-16 h-16 mx-auto text-gray-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <p class="mt-5 text-xl font-bold text-gray-900">
                  {{ t('register.confirm-email') }}
                </p>
                <p class="mt-3 text-sm font-medium text-gray-500">
                  {{ t('register.check-email') }}
                </p>
                <div class="mt-8">
                  <span
                    class="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold leading-5 text-blue-600 transition-all duration-200 bg-blue-100 border border-transparent rounded-md"
                  >
                    Thank you for choosing Capgo !
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>
