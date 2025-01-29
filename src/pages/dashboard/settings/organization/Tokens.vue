<script setup lang="ts">
import IconCapgoToken from '~/assets/capgo-token-gold.svg'
import { useI18n } from 'petite-vue-i18n'
import BlurBg from '~/components/BlurBg.vue'

const { t } = useI18n()
</script>
<template>
  <div class="h-full pb-8 overflow-y-auto grow md:pb-0">
    <div class="px-4 pt-6 mx-autolg:px-8 sm:px-6">
        <div class="sm:align-center sm:flex sm:flex-col">
          <h1 class="text-5xl font-extrabold text-gray-900 sm:text-center dark:text-white">
            {{ t('capgo-tokens') }}
          </h1>
          <p class="mt-5 text-xl text-gray-700 sm:text-center dark:text-white">
          {{ t('manage-your-tokens-here') }}<br>
        </p>
      </div>
      <div class="flex items-center justify-center mt-8 space-x-6 sm:mt-12">
        <BlurBg background="linear-gradient(90deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%)" rotate>
          <div class="flex items-center justify-center p-5">
            <IconCapgoToken class="w-32 h-32" />
            <h1 class="ml-7 text-5xl font-extrabold text-gray-900 sm:text-center dark:text-white">
              100
            </h1>
          </div>
        </BlurBg>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
        </route>
